import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Without this Vite silently moves to 5174 when 5173 is taken, so a dev
    // server left running from an earlier session keeps answering the address
    // in the browser while the new one serves the new code somewhere nobody is
    // looking. Fail loudly instead.
    strictPort: true,
    // The browser talks to one origin in development; Vite forwards the API and
    // the websocket to the Express server.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: { sourcemap: true },
});
