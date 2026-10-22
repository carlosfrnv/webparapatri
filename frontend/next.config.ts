import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Identificador de esta versión: la web lo compara con el de /version para recargarse sola tras publicar.
  env: { BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "local" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
