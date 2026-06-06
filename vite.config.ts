import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
// import wasm from "vite-plugin-wasm";
// import topLevelAwait from "vite-plugin-top-level-await";
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    watch: {
      ignored: ["**/node_modules/**", "**/.git/**", "/data/data/com.termux/files/home/**"],
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      path: "path-browserify",
      fs: "browserify-fs",
      "@capacitor/core": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/app": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/device": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/filesystem": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/share": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/network": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/haptics": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/status-bar": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/splash-screen": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
      "@capacitor/camera": path.resolve(__dirname, "src/lib/capacitor-stub.ts"),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
    exclude: [
      'framer-motion',
      'pdfjs-dist',
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
    plugins: () => []
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
