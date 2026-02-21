import {
  api,
  TestRunner,
  assertEqual,
  assertOk,
  loadConfig,
  sleep,
} from "./helpers.js";

async function main() {
  // 读取配置
  const config = loadConfig();
  const { apiKey, endpointId } = config;
  const AUTH = apiKey;

  const runner = new TestRunner();

  // 唯一后缀避免资源名冲突
  const suffix = Date.now().toString(36);

  console.log("🧪 Portainer 插件自动化测试\n");
  console.log(`   URL: ${config.url}`);
  console.log(`   Endpoint ID: ${endpointId}`);
  console.log(`   API Key: ${AUTH.slice(0, 12)}...\n`);

  // ============ P0 测试组 ============
  console.log("── P0: 核心功能 ──\n");

  // --- 环境管理 ---

  await runner.run("P0: 列出环境", async () => {
    const resp = await api("GET", "/api/endpoints", { auth: AUTH });
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(Array.isArray(resp.data), "返回应为数组");
    assertOk(resp.data.length > 0, "至少有一个环境");
  });

  await runner.run("P0: 获取环境详情", async () => {
    const resp = await api("GET", `/api/endpoints/${endpointId}`, {
      auth: AUTH,
    });
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(resp.data.Name !== undefined, "应有环境名称");
  });

  // --- Stack 管理 ---
  let testStackId: number | null = null;
  const stackName = `test-stack-${suffix}`;

  await runner.run("P0: 创建 Compose Stack", async () => {
    const composeContent = [
      'version: "3"',
      "services:",
      "  web:",
      "    image: nginx:1.27-alpine",
    ].join("\n");

    // Portainer 2.24.1 使用 /api/stacks/create/standalone/string
    const resp = await api(
      "POST",
      `/api/stacks/create/standalone/string?endpointId=${endpointId}`,
      {
        auth: AUTH,
        body: {
          Name: stackName,
          StackFileContent: composeContent,
          Env: [],
        },
      }
    );
    assertEqual(resp.status, 200, `Stack 创建应成功: ${JSON.stringify(resp.data)}`);
    assertOk(resp.data.Id > 0, "应返回 Stack ID");
    testStackId = resp.data.Id;
  });

  // 等待 Stack 容器启动
  await sleep(5000);

  await runner.run("P0: 列出 Stack", async () => {
    const resp = await api("GET", "/api/stacks", { auth: AUTH });
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(Array.isArray(resp.data), "返回应为数组");
    const names = resp.data.map((s: any) => s.Name);
    assertOk(names.includes(stackName), `应包含 ${stackName}`);
  });

  await runner.run("P0: 获取 Stack 详情", async () => {
    assertOk(testStackId !== null, "需要先创建 Stack");
    const resp = await api("GET", `/api/stacks/${testStackId}`, {
      auth: AUTH,
    });
    assertEqual(resp.status, 200, "状态码应为 200");
    assertEqual(resp.data.Name, stackName, `名称应为 ${stackName}`);
  });

  await runner.run("P0: 获取 Stack 编排文件", async () => {
    assertOk(testStackId !== null, "需要先创建 Stack");
    const resp = await api("GET", `/api/stacks/${testStackId}/file`, {
      auth: AUTH,
    });
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(
      resp.data.StackFileContent.includes("nginx"),
      "编排文件应包含 nginx"
    );
  });

  await runner.run("P0: 停止 Stack", async () => {
    assertOk(testStackId !== null, "需要先创建 Stack");
    const resp = await api(
      "POST",
      `/api/stacks/${testStackId}/stop?endpointId=${endpointId}`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "停止应成功");
  });

  await runner.run("P0: 启动 Stack", async () => {
    assertOk(testStackId !== null, "需要先创建 Stack");
    const resp = await api(
      "POST",
      `/api/stacks/${testStackId}/start?endpointId=${endpointId}`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "启动应成功");

    // 等待容器启动
    await sleep(3000);
  });

  await runner.run("P0: 更新 Stack", async () => {
    assertOk(testStackId !== null, "需要先创建 Stack");
    const newCompose = [
      'version: "3"',
      "services:",
      "  web:",
      "    image: nginx:1.27-alpine",
      "    environment:",
      "      - UPDATED=true",
    ].join("\n");

    const resp = await api(
      "PUT",
      `/api/stacks/${testStackId}?endpointId=${endpointId}`,
      {
        auth: AUTH,
        body: {
          StackFileContent: newCompose,
          Env: [],
          Prune: false,
        },
      }
    );
    assertEqual(resp.status, 200, "更新应成功");

    // 等待容器重建
    await sleep(3000);
  });

  // --- 容器管理 ---

  await runner.run("P0: 列出容器", async () => {
    const resp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/containers/json?all=true`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(Array.isArray(resp.data), "返回应为数组");
  });

  await runner.run("P0: 查找并重启容器", async () => {
    const listResp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/containers/json?all=true`,
      { auth: AUTH }
    );
    assertEqual(listResp.status, 200, "列出容器应成功");

    // 查找 test-stack 的 web 容器
    const container = listResp.data.find(
      (c: any) =>
        c.Labels?.["com.docker.compose.project"] === stackName &&
        c.State === "running"
    );
    assertOk(container !== undefined, `应找到 ${stackName} 运行中的容器`);

    const restartResp = await api(
      "POST",
      `/api/endpoints/${endpointId}/docker/containers/${container.Id}/restart`,
      { auth: AUTH }
    );
    assertEqual(restartResp.status, 204, "重启应成功");

    await sleep(2000);
  });

  await runner.run("P0: 查看容器日志", async () => {
    const listResp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/containers/json?all=true`,
      { auth: AUTH }
    );
    const container = listResp.data.find(
      (c: any) =>
        c.Labels?.["com.docker.compose.project"] === stackName
    );
    assertOk(container !== undefined, "应找到容器");

    const logResp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/containers/${container.Id}/logs?stdout=true&stderr=true&tail=50`,
      { auth: AUTH }
    );
    assertEqual(logResp.status, 200, "获取日志应成功");
  });

  await runner.run("P0: 获取容器 stats", async () => {
    const listResp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/containers/json`,
      { auth: AUTH }
    );
    assertEqual(listResp.status, 200, "列出运行中容器应成功");
    assertOk(listResp.data.length > 0, "应有运行中容器");

    const container = listResp.data[0];
    const statsResp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/containers/${container.Id}/stats?stream=false`,
      { auth: AUTH }
    );
    assertEqual(statsResp.status, 200, "获取 stats 应成功");
  });

  // --- Webhook ---
  await runner.run("P0: Stack Webhook 字段检查", async () => {
    assertOk(testStackId !== null, "需要先创建 Stack");
    const stackResp = await api("GET", `/api/stacks/${testStackId}`, {
      auth: AUTH,
    });
    assertEqual(stackResp.status, 200, "获取 Stack 应成功");
    assertOk(
      stackResp.data.Name === stackName,
      "Stack 名称应正确"
    );
  });

  // ============ P1 测试组 ============
  console.log("\n── P1: 扩展功能 ──\n");

  // --- 镜像管理 ---
  await runner.run("P1: 列出镜像", async () => {
    const resp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/images/json`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(Array.isArray(resp.data), "返回应为数组");
  });

  await runner.run("P1: 拉取镜像", async () => {
    // 镜像拉取返回流式 NDJSON，helpers 已做容错处理
    const resp = await api(
      "POST",
      `/api/endpoints/${endpointId}/docker/images/create?fromImage=alpine&tag=3.20`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "拉取应成功");
    await sleep(5000);
  });

  await runner.run("P1: 删除镜像", async () => {
    const resp = await api(
      "DELETE",
      `/api/endpoints/${endpointId}/docker/images/alpine:3.20?force=true`,
      { auth: AUTH }
    );
    assertOk(
      [200, 409].includes(resp.status),
      `删除应成功或报告冲突，实际: ${resp.status}`
    );
  });

  // --- 网络管理 ---
  let testNetworkId: string | null = null;
  const networkName = `test-net-${suffix}`;

  await runner.run("P1: 列出网络", async () => {
    const resp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/networks`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(Array.isArray(resp.data), "返回应为数组");
  });

  await runner.run("P1: 创建网络", async () => {
    const resp = await api(
      "POST",
      `/api/endpoints/${endpointId}/docker/networks/create`,
      {
        auth: AUTH,
        body: { Name: networkName, Driver: "bridge" },
      }
    );
    // Portainer 代理的 Docker API 返回 200
    assertOk(
      [200, 201].includes(resp.status),
      `创建网络应成功，实际: ${resp.status}`
    );
    testNetworkId = resp.data.Id;
    assertOk(typeof testNetworkId === "string", "应返回网络 ID");
  });

  await runner.run("P1: 删除网络", async () => {
    assertOk(testNetworkId !== null, "需要先创建网络");
    const resp = await api(
      "DELETE",
      `/api/endpoints/${endpointId}/docker/networks/${testNetworkId}`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 204, "删除网络应成功");
  });

  // --- 卷管理 ---
  const volumeName = `test-vol-${suffix}`;

  await runner.run("P1: 创建并删除卷", async () => {
    const createResp = await api(
      "POST",
      `/api/endpoints/${endpointId}/docker/volumes/create`,
      {
        auth: AUTH,
        body: { Name: volumeName, Driver: "local" },
      }
    );
    // Portainer 代理的 Docker API 返回 200
    assertOk(
      [200, 201].includes(createResp.status),
      `创建卷应成功，实际: ${createResp.status}`
    );

    const deleteResp = await api(
      "DELETE",
      `/api/endpoints/${endpointId}/docker/volumes/${volumeName}`,
      { auth: AUTH }
    );
    assertEqual(deleteResp.status, 204, "删除卷应成功");
  });

  // --- 系统信息 ---
  await runner.run("P1: Docker info", async () => {
    const resp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/info`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "状态码应为 200");
    assertOk(
      resp.data.ServerVersion !== undefined,
      "应有 Docker 版本"
    );
  });

  await runner.run("P1: Docker version", async () => {
    const resp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/version`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "状态码应为 200");
  });

  await runner.run("P1: 磁盘使用", async () => {
    const resp = await api(
      "GET",
      `/api/endpoints/${endpointId}/docker/system/df`,
      { auth: AUTH }
    );
    assertEqual(resp.status, 200, "状态码应为 200");
  });

  // --- Swarm ---
  runner.skip("P1: Swarm 服务管理", "测试环境非 Swarm 模式");

  // ============ 错误处理测试 ============
  console.log("\n── 错误处理 ──\n");

  await runner.run("Error: 无效 API Key → 401", async () => {
    const resp = await api("GET", "/api/endpoints", {
      auth: "ptr_invalid_key_12345",
    });
    assertEqual(resp.status, 401, "应返回 401");
  });

  await runner.run("Error: 不存在的 Stack → 404", async () => {
    const resp = await api("GET", "/api/stacks/99999", { auth: AUTH });
    assertOk(
      [404, 400].includes(resp.status),
      `应返回 404 或 400，实际: ${resp.status}`
    );
  });

  await runner.run("Error: 名称冲突 → 409", async () => {
    const composeContent = [
      'version: "3"',
      "services:",
      "  web:",
      "    image: nginx:1.27-alpine",
    ].join("\n");

    const resp = await api(
      "POST",
      `/api/stacks/create/standalone/string?endpointId=${endpointId}`,
      {
        auth: AUTH,
        body: {
          Name: stackName,
          StackFileContent: composeContent,
          Env: [],
        },
      }
    );
    assertEqual(resp.status, 409, "应返回 409 冲突");
  });

  // ============ 清理测试资源 ============
  console.log("\n── 清理 ──\n");

  await runner.run("Cleanup: 删除测试 Stack", async () => {
    if (!testStackId) return;
    const resp = await api(
      "DELETE",
      `/api/stacks/${testStackId}?endpointId=${endpointId}`,
      { auth: AUTH }
    );
    assertOk(
      [200, 204].includes(resp.status),
      `删除 Stack 应成功，实际: ${resp.status}`
    );
  });

  // ============ 汇总 ============
  runner.summary();
  process.exit(runner.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ 测试运行失败:", err.message);
  process.exit(1);
});
