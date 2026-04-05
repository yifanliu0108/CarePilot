import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
  /** `npm start` / `vite preview` on Railway — bind all interfaces and use $PORT */
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
  },
})
