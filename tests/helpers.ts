import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

// 配置常量
export const PORTAINER_URL = "http://localhost:19000";
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "TestPassword123!";

const TESTS_DIR = resolve(import.meta.dirname ?? ".");
const CONFIG_PATH = resolve(TESTS_DIR, ".test-config.json");

/** 保存测试配置到文件 */
export function saveConfig(config: {
  url: string;
  apiKey: string;
  endpointId: number;
}): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** 读取测试配置 */
export function loadConfig(): {
  url: string;
  apiKey: string;
  endpointId: number;
} {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      ".test-config.json 不存在，请先运行 npx tsx setup.ts"
    );
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

/** API 调用封装 (JSON) */
export async function api(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    auth?: string;
  }
): Promise<{ status: number; data: any }> {
  const url = path.startsWith("http")
    ? path
    : `${PORTAINER_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options?.headers,
  };

  if (options?.auth) {
    if (options.auth.startsWith("ptr_")) {
      headers["X-API-Key"] = options.auth;
    } else {
      headers["Authorization"] = `Bearer ${options.auth}`;
    }
  }

  const fetchOptions: RequestInit = { method, headers };
  if (options?.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const resp = await fetch(url, fetchOptions);
  return parseResponse(resp);
}

/** API 调用封装 (multipart/form-data) */
export async function apiForm(
  method: string,
  path: string,
  options: {
    formData: Record<string, string>;
    auth?: string;
  }
): Promise<{ status: number; data: any }> {
  const url = path.startsWith("http")
    ? path
    : `${PORTAINER_URL}${path}`;

  const form = new FormData();
  for (const [key, value] of Object.entries(options.formData)) {
    form.append(key, value);
  }

  const headers: Record<string, string> = {};
  if (options.auth) {
    if (options.auth.startsWith("ptr_")) {
      headers["X-API-Key"] = options.auth;
    } else {
      headers["Authorization"] = `Bearer ${options.auth}`;
    }
  }

  const resp = await fetch(url, { method, headers, body: form });
  return parseResponse(resp);
}

/** 解析 HTTP 响应（容错处理流式 NDJSON 等非标准格式） */
async function parseResponse(
  resp: Response
): Promise<{ status: number; data: any }> {
  const status = resp.status;
  let data: any;
  const contentType = resp.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const text = await resp.text();
    try {
      data = JSON.parse(text);
    } catch {
      // 流式 NDJSON（如镜像拉取），返回原始文本
      data = text;
    }
  } else {
    data = await resp.text();
  }

  return { status, data };
}

/** 轮询等待 Portainer 就绪 */
export async function waitForPortainer(
  maxWaitMs = 60000,
  intervalMs = 2000
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${PORTAINER_URL}/api/system/status`);
      if (resp.ok) return;
    } catch {
      // 连接失败，继续重试
    }

    // 回退路径
    try {
      const resp = await fetch(`${PORTAINER_URL}/api/status`);
      if (resp.ok) return;
    } catch {
      // 继续重试
    }

    await sleep(intervalMs);
  }

  throw new Error(`Portainer 未在 ${maxWaitMs / 1000} 秒内就绪`);
}

/** 等待容器启动并运行 */
export async function waitForContainers(
  auth: string,
  endpointId: number,
  expectedName: string,
  maxWaitMs = 30000,
  intervalMs = 2000
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const resp = await api(
        "GET",
        `/api/endpoints/${endpointId}/docker/containers/json?all=true`,
        { auth }
      );
      if (resp.status === 200 && Array.isArray(resp.data)) {
        const found = resp.data.find((c: any) =>
          c.Names?.some((n: string) => n.includes(expectedName))
        );
        if (found && found.State === "running") return;
      }
    } catch {
      // 继续重试
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `容器 "${expectedName}" 未在 ${maxWaitMs / 1000} 秒内就绪`
  );
}

/** 简单延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- 断言工具 ----

export function assertEqual(
  actual: any,
  expected: any,
  message: string
): void {
  if (actual !== expected) {
    throw new Error(`${message}\n  期望: ${expected}\n  实际: ${actual}`);
  }
}

export function assertIncludes(
  arr: any[],
  item: any,
  message: string
): void {
  if (!arr.includes(item)) {
    throw new Error(
      `${message}\n  数组: ${JSON.stringify(arr)}\n  元素: ${item}`
    );
  }
}

export function assertOk(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// ---- 测试运行器 ----

interface TestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  error?: string;
  durationMs?: number;
}

export class TestRunner {
  passed = 0;
  failed = 0;
  skipped = 0;
  results: TestResult[] = [];

  async run(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      const durationMs = Date.now() - start;
      this.passed++;
      this.results.push({ name, status: "pass", durationMs });
      console.log(`  ✅ ${name} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      this.failed++;
      const error = err?.message ?? String(err);
      this.results.push({ name, status: "fail", error, durationMs });
      console.log(`  ❌ ${name} (${durationMs}ms)`);
      console.log(`     ${error.split("\n").join("\n     ")}`);
    }
  }

  skip(name: string, reason?: string): void {
    this.skipped++;
    this.results.push({
      name,
      status: "skip",
      error: reason,
    });
    console.log(`  ⏭️  ${name}${reason ? ` — ${reason}` : ""}`);
  }

  summary(): void {
    console.log("\n" + "=".repeat(60));
    console.log(
      `测试结果: ${this.passed} 通过, ${this.failed} 失败, ${this.skipped} 跳过`
    );
    console.log("=".repeat(60));

    if (this.failed > 0) {
      console.log("\n失败详情:");
      for (const r of this.results) {
        if (r.status === "fail") {
          console.log(`  ❌ ${r.name}`);
          console.log(`     ${r.error}`);
        }
      }
    }
  }
}

// ---- Docker Compose 操作 ----

export function composeUp(): void {
  console.log("启动 Docker Compose ...");
  execSync(
    "docker compose -f docker-compose.test.yml up -d --wait",
    { cwd: TESTS_DIR, stdio: "inherit" }
  );
}

export function composeDown(): void {
  console.log("停止 Docker Compose ...");
  execSync("docker compose -f docker-compose.test.yml down -v", {
    cwd: TESTS_DIR,
    stdio: "inherit",
  });
}
