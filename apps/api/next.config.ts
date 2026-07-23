import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@junaidi/shared", "@junaidi/db", "@junaidi/pdf"],

  // Chromium and the Mongo driver must stay external: bundling them breaks
  // Puppeteer's binary lookup and Mongoose's dynamic requires.
  serverExternalPackages: ["puppeteer", "mongoose", "bcryptjs"],

  // This app serves JSON and PDFs only; nothing here is a web page.
  reactStrictMode: true,
  poweredByHeader: false,

  // The workspace packages are ESM source that imports with explicit ".js"
  // extensions (e.g. "./auth.js"). Tell the bundler a ".js" specifier may
  // resolve to the ".ts" source, which is what actually exists on disk.
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },

  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"],
  },
};

export default config;
