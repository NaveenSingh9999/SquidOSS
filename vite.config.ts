import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      path: "path-browserify",
      fs: "browserify-fs",
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', 'pdfjs-dist'],
    exclude: [
      // Exclude all level-* packages that cause module externalization warnings
      'level-js',
      'levelup',
      'leveldown',
      'level-sublevel',
      'level-blobs',
      'level-filesystem',
      'deferred-leveldown',
      'abstract-leveldown',
      'fwd-stream',
      'concat-stream',
    ]
  },
  assetsInclude: ['**/*.pdf', '**/*.wasm'],
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()]
  },
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      external: [
      // Mark Node.js built-ins as external since we're building for browser
        'util',
        'events',
        'stream',
        'path',
        'fs',
        'buffer',
      ],
      output: {
        manualChunks: undefined,
        assetFileNames: (assetInfo) => {
          if (!assetInfo.name) {
            return 'assets/[name]-[hash][extname]';
          }

          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/\.(css)$/.test(assetInfo.name)) {
            return `assets/[name]-[hash].css`;
          }
          return `assets/[name]-[hash].${ext}`;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      }
    }
  }
}));
