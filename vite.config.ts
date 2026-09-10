import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import aitDevtools from '@apps-in-toss/devtools/unplugin';

export default defineConfig({
  plugins: [react(), ...(process.env.AIT_DEVTOOLS === '1' ? [aitDevtools.vite()] : [])],
  server: { port: 5190, strictPort: true },
  build: { reportCompressedSize: false },
});
