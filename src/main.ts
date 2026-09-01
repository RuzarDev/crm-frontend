import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import 'ant-design-vue/dist/reset.css'
import './assets/main.css'
import { vUppercase } from './directives/uppercase'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.directive('uppercase', vUppercase)

app.mount('#app')
