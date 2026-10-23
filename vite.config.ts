import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function singleHtmlFile(): Plugin {
  return {
    name: "single-html-file",
    apply: "build",
    closeBundle() {
      if (process.env.PAGES === "1") return;
      const dist = resolve("dist");
      let html = readFileSync(resolve(dist, "index.html"), "utf8");
      for (const name of readdirSync(resolve(dist, "assets"))) {
        const text = readFileSync(resolve(dist, "assets", name), "utf8");
        if (name.endsWith(".css")) {
          html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${text.replace(/<\/style/gi, "<\\/style")}</style>`);
        }
        if (name.endsWith(".js")) {
          html = html.replace(
            /<script type="module"[^>]*><\/script>/,
            () => `<script type="module">${text.replace(/<\/script/gi, "<\\/script")}</script>`,
          );
        }
      }
      writeFileSync(resolve("قيفانتا.html"), html);
      cpSync(resolve("public/hospitality"), resolve("hospitality"), { recursive: true });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), singleHtmlFile()],
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    allowedHosts: true,
    proxy: { "/api": { target: "http://127.0.0.1:5181", changeOrigin: true } },
  },
  preview: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    allowedHosts: true,
    proxy: { "/api": { target: "http://127.0.0.1:5181", changeOrigin: true } },
  },
});
