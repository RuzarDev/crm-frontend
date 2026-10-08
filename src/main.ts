import { createApp } from 'vue'
import { createPinia } from 'pinia'
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
// Manrope — только для надписи ZIRCON (брендбук); в нём нет казахских букв, для текста не используется
import '@fontsource/manrope/800.css'
import './styles/tailwind.css'
import 'vue-sonner/style.css'
import './styles/toast.css'
import './assets/main.css'
import { vUppercase } from './directives/uppercase'
import { installChunkReload } from './shell/chunkReload'

// Чанк после выкладки не найден — один раз перезагружаем страницу (защита от цикла — в chunkReload).
installChunkReload()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.directive('uppercase', vUppercase)

// Язык пользователя (казахский/английский) подгружаем до первого кадра, чтобы не мигал русский.
void setLocale(getStoredLocale()).finally(() => app.mount('#app'))
