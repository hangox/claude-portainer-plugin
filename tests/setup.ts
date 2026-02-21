import {
  PORTAINER_URL,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  waitForPortainer,
  api,
  apiForm,
  composeUp,
  saveConfig,
  sleep,
} from "./helpers.js";

async function setup() {
  console.log("🚀 启动测试环境...\n");

  // 1. docker compose up
  composeUp();

  // 2. 等待 Portainer 就绪
  console.log("\n⏳ 等待 Portainer 就绪...");
  await waitForPortainer();
  console.log("   Portainer 已就绪");

  // 3. 初始化管理员
  console.log("\n👤 创建管理员用户...");
  const initResp = await api("POST", "/api/users/admin/init", {
    body: { Username: ADMIN_USERNAME, Password: ADMIN_PASSWORD },
  });
  if (initResp.status !== 200) {
    console.log(`   管理员初始化响应: ${initResp.status} — ${JSON.stringify(initResp.data)}`);
  } else {
    console.log("   管理员创建成功");
  }

  // 4. 获取 JWT
  console.log("\n🔑 获取认证 Token...");
  const authResp = await api("POST", "/api/auth", {
    body: { Username: ADMIN_USERNAME, Password: ADMIN_PASSWORD },
  });
  if (authResp.status !== 200) {
    throw new Error(
      `认证失败: ${authResp.status} — ${JSON.stringify(authResp.data)}`
    );
  }
  const jwt = authResp.data.jwt;
  console.log("   JWT 获取成功");

  // 5. 生成 API Key
  console.log("\n🔐 生成 API Key...");
  const usersResp = await api("GET", "/api/users", { auth: jwt });
  if (usersResp.status !== 200 || !Array.isArray(usersResp.data)) {
    throw new Error(
      `获取用户列表失败: ${usersResp.status} — ${JSON.stringify(usersResp.data)}`
    );
  }
  const adminUser = usersResp.data.find(
    (u: any) => u.Username === ADMIN_USERNAME
  );
  if (!adminUser) {
    throw new Error("未找到管理员用户");
  }
  const adminId = adminUser.Id;

  const tokenResp = await api("POST", `/api/users/${adminId}/tokens`, {
    auth: jwt,
    body: { description: "test-api-key", password: ADMIN_PASSWORD },
  });
  if (tokenResp.status !== 201 && tokenResp.status !== 200) {
    throw new Error(
      `生成 API Key 失败: ${tokenResp.status} — ${JSON.stringify(tokenResp.data)}`
    );
  }
  const apiKey = tokenResp.data.rawAPIKey;
  console.log(`   API Key: ${apiKey.slice(0, 12)}...`);

  // 6. 注册 Docker 环境（使用共享的 Docker socket）
  console.log("\n🐳 注册 Docker 环境...");
  const endpointsResp = await api("GET", "/api/endpoints", { auth: apiKey });
  let endpointId: number;

  if (
    endpointsResp.status === 200 &&
    Array.isArray(endpointsResp.data) &&
    endpointsResp.data.length > 0
  ) {
    endpointId = endpointsResp.data[0].Id;
    console.log(
      `   已存在环境: ID=${endpointId}, Name="${endpointsResp.data[0].Name}"`
    );
  } else {
    // 使用 local socket 方式 (EndpointCreationType=1)
    // DinD 的 docker.sock 通过共享 volume 挂载到 /var/run/docker.sock
    const createResp = await apiForm("POST", "/api/endpoints", {
      auth: apiKey,
      formData: {
        Name: "test-dind",
        EndpointCreationType: "1",
        URL: "unix:///var/run/docker.sock",
      },
    });

    if (createResp.status >= 200 && createResp.status < 300) {
      endpointId = createResp.data.Id;
      console.log(`   环境注册成功: ID=${endpointId}`);
    } else {
      throw new Error(
        `注册环境失败: ${createResp.status} — ${JSON.stringify(createResp.data)}`
      );
    }
  }

  // 7. 验证环境可用
  console.log("\n🔍 验证 Docker 连接...");
  await sleep(2000);
  const infoResp = await api(
    "GET",
    `/api/endpoints/${endpointId}/docker/info`,
    { auth: apiKey }
  );
  if (infoResp.status === 200) {
    console.log(
      `   Docker 版本: ${infoResp.data.ServerVersion}, 容器数: ${infoResp.data.Containers}`
    );
  } else {
    console.log(
      `   ⚠️  Docker info 返回: ${infoResp.status} — ${JSON.stringify(infoResp.data)}`
    );
  }

  // 8. 保存配置
  const config = {
    url: PORTAINER_URL,
    apiKey,
    endpointId,
  };
  saveConfig(config);

  console.log("\n✅ 测试环境就绪！");
  console.log(`   PORTAINER_URL=${PORTAINER_URL}`);
  console.log(`   PORTAINER_API_KEY=${apiKey.slice(0, 12)}...`);
  console.log(`   PORTAINER_ENDPOINT_ID=${endpointId}`);
  console.log(`   配置已保存到 .test-config.json`);
}

setup().catch((err) => {
  console.error("\n❌ 环境初始化失败:", err.message);
  process.exit(1);
});
