import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 打包成分发版本时用：产出 .next/standalone（自带运行所需依赖，只需一个 node 可执行文件）
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
