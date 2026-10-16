import { defineConfig } from "vite";

// Project site on GitHub Pages: https://<user>.github.io/Mysudok/
export default defineConfig({
  base: "/Mysudok/",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
