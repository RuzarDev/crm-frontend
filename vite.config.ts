import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { fileURLToPath, URL } from 'node:url'

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:5110'

// Z-набор подключается только явным импортом (так заведено с волны 0c): видно, откуда компонент,
// и автоподключение не тянет z/ в каждый экран.
// Только положительные глобы: unplugin-vue-components 0.26 в dev-наблюдателе
// объединяет глобы через OR, и исключение «!…» там не работает.
export const componentGlobs = ['src/components/*.vue', 'src/components/!(z)/**/*.vue']

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    Components({
      globs: componentGlobs,
    }),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: proxyTarget.startsWith('https://'),
      }
    }
  }
})
