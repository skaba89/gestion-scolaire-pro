import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Use loadEnv (official Vite API) instead of import.meta.env for reliability
  // across all Node.js versions and build environments (Render, Docker, CI)
  const env = loadEnv(mode, process.cwd(), '');
  const enablePwa = mode === 'production' && env.VITE_ENABLE_PWA === 'true';

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
          target: env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-proxy/, ''),
        },
      },
    },
    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      // ⚠️  NE PAS activer VITE_ENABLE_PWA=true — le projet utilise
      // sw-schoolflow.js (custom SW, enregistré dans main.tsx).
      // VitePWA génère un sw.js Workbox séparé qui INTERCEPTERAIT les appels API
      // et entrerait en conflit avec notre SW custom.
      // Le mode offline est géré entièrement par sw-schoolflow.js + Dexie (offlineDb.ts).
      enablePwa && VitePWA({
        registerType: 'autoUpdate',
        // Exclusions API complètes — JAMAIS intercepter les appels backend
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/api-proxy\//,
            /^\/api\/v1\//,
          ],
          // Ne PAS intercepter les requêtes API avec le SW Workbox
          runtimeCaching: [
            {
              // Seulement les assets statiques same-origin (pas les API)
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin &&
                !url.pathname.startsWith('/api') &&
                request.destination !== 'document',
              handler: 'CacheFirst',
              options: {
                cacheName: 'schoolflow-static-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
                },
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
