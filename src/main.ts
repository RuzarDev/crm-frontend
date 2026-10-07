import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { message } from 'ant-design-vue'
import App from './App.vue'
import router from './router'
import { i18n, setLocale, getStoredLocale } from './i18n'
import 'ant-design-vue/dist/reset.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/tailwind.css'
import './assets/main.css'
import { vUppercase } from './directives/uppercase'

// Тосты-ошибки: не даём очереди перекрывать шапку (top ниже хедера) и жёстко
// ограничиваем число одновременных плашек — вместе с keyed-message в api/client.ts
// это убирает стопку нечитаемых уведомлений при пачке 401/500.
message.config({ top: '72px', maxCount: 3, duration: 4 })

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.directive('uppercase', vUppercase)

// Язык пользователя (казахский/английский) подгружаем до первого кадра, чтобы не мигал русский.
void setLocale(getStoredLocale()).finally(() => app.mount('#app'))
