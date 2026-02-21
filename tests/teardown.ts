import { composeDown } from "./helpers.js";
import { existsSync, unlinkSync } from "fs";
import { resolve } from "path";

async function teardown() {
  console.log("🧹 清理测试环境...\n");

  const configPath = resolve(import.meta.dirname ?? ".", ".test-config.json");

  // 删除临时配置文件
  if (existsSync(configPath)) {
    unlinkSync(configPath);
    console.log("   已删除 .test-config.json");
  }

  // 停止并删除容器和卷
  composeDown();

  console.log("\n✅ 清理完成");
}

teardown().catch((err) => {
  console.error("❌ 清理失败:", err.message);
  process.exit(1);
});
