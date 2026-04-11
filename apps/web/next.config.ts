import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["next-swagger-doc", "swagger-ui-react", "swagger-themes"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
