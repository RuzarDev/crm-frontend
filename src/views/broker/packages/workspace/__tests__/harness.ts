import { vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Общая обвязка спеков «Разбора поезда»: заглушки окон и меню (видны пункты и состав, без механики Reka),
// роутер с маршрутом страницы, роли.

export const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div data-dropdown><slot /><button v-for="i in items" :key="i.key" type="button" :data-menu-item="i.key" @click="$emit(\'select\', i.key)">{{ i.label }}</button></div>',
}
export const ModalStub = {
  props: ['open', 'title', 'okButtonProps', 'confirmLoading'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}
export const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><div data-drawer-title><slot name="title" /></div><slot /><slot name="footer" /></div>',
}
export const RadioStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<div><button v-for="o in options" :key="o.value" type="button" :data-radio="o.value" @click="$emit(\'update:value\', o.value)">{{ o.label }}</button></div>',
}
export const stubs = { ZDropdown: DropdownStub, ZModal: ModalStub, ZDrawer: DrawerStub, ZRadioGroup: RadioStub }

export const App = defineComponent({ render: () => h(RouterView) })

export const makeRouter = (page: unknown): Router => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/document-packages/:id/workspace', name: 'document-packages-workspace', component: page as never },
    { path: '/:p(.*)*', component: { template: '<div data-elsewhere />' } },
  ],
})

export const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
export const BROKER = ['reestr.read', 'reestr.write', 'packages.manage', 'clients.read']

export const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

export const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

/** DataTransfer для перетаскивания в jsdom. */
export const dataTransfer = () => ({ setData: vi.fn(), getData: () => '', effectAllowed: 'all', dropEffect: 'none', files: [] })

/** matchMedia: phone — совпадает ли «(max-width: 639px)». */
export const mockMedia = (phone: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: phone && q.includes('max-width: 639px'), media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
