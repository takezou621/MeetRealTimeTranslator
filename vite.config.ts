import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

function chromeExtensionPlugin(): Plugin {
  return {
    name: "chrome-extension-html",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const [fileName, info] of Object.entries(bundle)) {
        if (fileName.startsWith("src/") && fileName.endsWith(".html")) {
          const newName = fileName.replace("src/", "");
          info.fileName = newName;
          if ("source" in info && typeof info.source === "string") {
            info.source = (info.source as string).replace(/\.\.\//g, "./");
          }
          delete bundle[fileName];
          bundle[newName] = info;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), chromeExtensionPlugin()],
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup.html"),
        offscreen: resolve(__dirname, "src/offscreen.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        inject: resolve(__dirname, "src/inject/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name].[ext]",
        // Prevent code-splitting for content.js and inject.js (no imports allowed)
        manualChunks(id) {
          if (id.includes("src/content/") || id.includes("src/inject/")) {
            return undefined as unknown as string;
          }
        },
      },
    },
  },
});
