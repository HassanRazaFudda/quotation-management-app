import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@junaidi/shared"],
  reactStrictMode: true,
  poweredByHeader: false,

  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"],
  },
};

export default config;
