import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const enablePwa = process.env.VITE_ENABLE_PWA === 'true';

  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': {},
    },
    server: {
      // SECURITY: Default to localhost; use 0.0.0.0 only when network access is explicitly needed
      host: "localhost",
      port: 3000,
      strictPort: true,
      hmr: {
        clientPort: 3000,
        host: "localhost",
      },
      headers: {
        "Content-Security-Policy": "script-src 'self' 'unsafe-inline'; object-src 'self'"
      },
      proxy: {
        // Proxy /api-proxy/* to backend in dev (used when VITE_API_URL=/api-proxy)
        '/api-proxy': {
          target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-proxy/, ''),
        },
      },
    },
    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      enablePwa && VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallbackDenylist: [/^\/api-proxy\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === self.location.origin,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'schoolflow-runtime-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 24 * 60 * 60,
                },
                networkTimeoutSeconds: 5,
              }
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "react": path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      },
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-router-dom",
        "@tanstack/react-query",
        "lucide-react",
        "framer-motion",
        "clsx",
        "tailwind-merge"
      ],
    },
    build: {
      target: "es2020",
      minify: "esbuild",
      cssMinify: true,
      sourcemap: false,
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks(id) {
            // Core: React + everything that depends on React.createContext
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router') || id.includes('node_modules/react-i18next') || id.includes('node_modules/i18next') || id.includes('node_modules/scheduler')) {
              return 'vendor-react';
            }
            // UI: Radix primitives (depend on React but loaded after vendor-react)
            if (id.includes('node_modules/@radix-ui')) {
              return 'vendor-ui';
            }
            // Data fetching
            if (id.includes('node_modules/@tanstack') || id.includes('node_modules/axios') || id.includes('node_modules/zod') || id.includes('node_modules/react-hook-form') || id.includes('node_modules/@hookform')) {
              return 'vendor-query';
            }
            // Charts
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
              return 'vendor-charts';
            }
            // PDF generation (lazy-loaded only when needed)
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
              return 'vendor-pdf';
            }
            // Motion
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
          },
        },
      },
      chunkSizeWarningLimit: 500,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
