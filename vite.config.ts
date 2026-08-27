import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/rbx-fashion/",
  plugins: [preact()],
  build: {
    sourcemap: false,
  },
});
