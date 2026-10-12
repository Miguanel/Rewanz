import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        // React w osobnym, długo cache'owanym pliku – zmiany w kodzie aplikacji
        // nie unieważniają go na telefonach użytkowników.
        manualChunks: { react: ["react", "react-dom"] },
      },
    },
  },
  server: { port: 5173, host: true },
});
