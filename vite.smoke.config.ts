/** Builds the browser check pages in smoke/ (npm run smoke). Same headers as production. */
import { mergeConfig } from 'vite';
import base from './vite.config.ts';

export default mergeConfig(base, {
  build: { outDir: 'dist-smoke', rollupOptions: { input: 'smoke/pki.html' } },
  preview: { port: 4174, open: '/smoke/pki.html' },
});
