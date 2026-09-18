import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { message } from 'ant-design-vue'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import 'ant-design-vue/dist/reset.css'
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

app.mount('#app')
