/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { renderHeadersFile, securityHeaders } from './security/headers.ts';

/** Emits dist/_headers from the same source the preview server uses. */
function securityHeadersFile(): Plugin {
  return {
    name: 'mahtem:security-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: renderHeadersFile() });
    },
  };
}

export default defineConfig({
  plugins: [react(), securityHeadersFile()],
  build: {
    // Never inline assets as data: URIs. Keeps font-src/style-src strict ('self' only).
    assetsInlineLimit: 0,
    sourcemap: false,
    // One ~511 KB (≈145 KB gzipped) bundle, mostly the X.509 library: loaded once, no server round-trips.
    // Raised from Vite's 500 KB default deliberately; revisit if the bundle grows past 600 KB.
    chunkSizeWarningLimit: 600,
  },
  preview: {
    headers: { ...securityHeaders },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
