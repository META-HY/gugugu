import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 独立部署产物：next build 后输出 .next/standalone（含精简 node_modules + server.js），
  // 解压即跑，无需在服务器上 npm install
  output: "standalone",
};

export default nextConfig;
