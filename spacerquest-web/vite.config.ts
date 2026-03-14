import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { ViteDevServer, Connect } from 'vite';
import type { ServerResponse, IncomingMessage } from 'http';

/**
 * Fix two Vite 5 dev-server bugs that cause React to break:
 *
 * 1. __DEFINES__ not replaced: Vite rewrites `@vite/env` → the direct
 *    filesystem path in @vite/client, but clientInjectionsPlugin only
 *    transforms the virtual `@vite/env` specifier.
 *
 * 2. Dual React instances: App code imports deps with versioned URLs
 *    (react.js?v=HASH) but pre-bundled deps import each other without
 *    version hashes (./react.js). Browser treats these as separate
 *    modules → two React instances → "Invalid hook call".
 *
 * Fix for (2): Strip ?v=HASH from .vite/deps/ imports in served app
 * code so all imports use the same unversioned URL. Done at the HTTP
 * response level (after Vite's importAnalysis has already run).
 */
function fixViteDevServer() {
  return {
    name: 'fix-vite-dev-server',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!req.url) return next();

        // Fix 1: Redirect direct env.mjs path to virtual module
        if (req.url.includes('/vite/dist/client/env.mjs')) {
          req.url = '/@vite/env';
          return next();
        }

        // Fix 2: For app source files (not deps/node_modules), wrap the
        // response to strip version hashes from dep imports
        const isAppSource = req.url.startsWith('/src/') ||
                            req.url.startsWith('/@') ||
                            req.url === '/' ||
                            req.url.endsWith('.html');
        const isDepFile = req.url.includes('/node_modules/');

        if (!isAppSource || isDepFile) return next();

        const origEnd = res.end;
        const origWrite = res.write;
        const chunks: (Buffer | string)[] = [];
        let shouldPatch = false;

        res.write = function(chunk: any, ...args: any[]) {
          if (chunk) {
            const str = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
            if (str.includes('.vite/deps/') && str.includes('?v=')) {
              shouldPatch = true;
            }
            chunks.push(chunk);
          }
          return true;
        } as any;

        res.end = function(chunk?: any, ...args: any[]) {
          if (chunk) {
            const str = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
            if (str.includes('.vite/deps/') && str.includes('?v=')) {
              shouldPatch = true;
            }
            chunks.push(chunk);
          }

          res.write = origWrite;
          res.end = origEnd;

          if (!shouldPatch) {
            // No deps to patch, send original chunks
            for (const c of chunks) {
              res.write(c);
            }
            return res.end();
          }

          // Concatenate and strip version hashes from dep URLs
          let body = chunks.map(c =>
            typeof c === 'string' ? c : c.toString('utf-8')
          ).join('');

          body = body.replace(
            /(\/node_modules\/\.vite\/deps\/[\w.\-]+\.js)\?v=[a-f0-9]+/g,
            '$1'
          );

          return res.end(body);
        } as any;

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [fixViteDevServer(), react()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'zustand',
      'zustand/middleware',
      'socket.io-client',
      'xterm',
      'xterm-addon-fit',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/frontend'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
