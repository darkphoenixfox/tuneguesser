import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = "http://127.0.0.1:3000";
export default defineConfig({
  plugins: [react()],
  build: { target: ['es2019', 'safari13'] }, // older iPhones: transpile ?., ??, ??= instead of leaving a black page
  server: {
    host: true, // reachable from phones on the LAN
    port: 5173,
    strictPort: true,
    proxy: { "/api": server, "/callback": server, "/ws": { target: server, ws: true } },
  },
});
