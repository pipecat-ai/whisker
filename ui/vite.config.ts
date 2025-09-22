import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries into separate chunks
          vendor: ["react", "react-dom"],
          cytoscape: ["cytoscape", "cytoscape-dagre", "react-cytoscapejs"],
          utils: ["zustand", "@msgpack/msgpack", "classnames"],
        },
      },
    },
    // Increase the chunk size warning limit to 1000kb
    chunkSizeWarningLimit: 1000,
  },
});
