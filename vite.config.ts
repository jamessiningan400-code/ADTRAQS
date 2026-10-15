import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

function officeRootEntry() {
  return {
    name: 'office-root-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/') req.url = '/office.html'
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    figmaAssetResolver(),
    ...(mode === 'office' ? [officeRootEntry()] : []),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.devtunnels.ms', '.github.dev'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
        secure: false,
        rewrite: (requestPath) => {
          const queryIndex = requestPath.indexOf('?');
          const pathname = queryIndex === -1 ? requestPath : requestPath.slice(0, queryIndex);
          const query = queryIndex === -1 ? '' : requestPath.slice(queryIndex);
          const phpRoutes = {
            '/api/health': '/smartdocs/api/health.php',
            '/api/docs': '/smartdocs/api/docs.php',
            '/api/tracking': '/smartdocs/api/tracking.php',
            '/api/tracking-update': '/smartdocs/api/tracking-update.php',
            '/api/login': '/smartdocs/api/auth/login.php',
            '/api/register': '/smartdocs/api/auth/signup.php',
          };
          return `${phpRoutes[pathname] || pathname.replace(/^\/api/, '/smartdocs/api')}${query}`;
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        office: path.resolve(__dirname, 'office.html'),
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
}))
