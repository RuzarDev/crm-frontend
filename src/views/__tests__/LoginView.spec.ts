import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import LoginView from '@/views/LoginView.vue'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
let pinia: Pinia
let router: Router

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  const page = { template: '<div/>' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page },
      { path: '/login', component: page },
      { path: '/forgot-password', component: page },
      { path: '/register', component: page },
    ],
  })
  await router.push('/login')
  await router.isReady()
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  localStorage.clear()
})

const mountIt = () => mountWithI18n(LoginView, { attachTo: document.body, global: { plugins: [pinia, router] } })
const submit = async () => {
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('LoginView', () => {
  it('пустая отправка — ошибки под обоими полями, вход не вызывается', async () => {
    const login = vi.spyOn(useAuthStore(), 'login').mockResolvedValue(true)
    w = mountIt()
    await submit()
    expect(w.text()).toContain('Введите логин или e-mail')
    expect(w.text()).toContain('Введите пароль')
    expect(login).not.toHaveBeenCalled()
    // Первое поле с ошибкой получает фокус.
    expect(document.activeElement).toBe(w.find('input[autocomplete="username"]').element)
  })

  it('заполнено — вход с логином и паролем, затем переход на главную', async () => {
    const login = vi.spyOn(useAuthStore(), 'login').mockResolvedValue(true)
    const push = vi.spyOn(router, 'push')
    w = mountIt()
    await w.find('input[autocomplete="username"]').setValue('aigerim.k')
    await w.find('input[autocomplete="current-password"]').setValue('secret')
    await submit()
    expect(login).toHaveBeenCalledWith({ username: 'aigerim.k', password: 'secret' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('неудачный вход — остаёмся на странице (ошибку показывает перехватчик axios)', async () => {
    vi.spyOn(useAuthStore(), 'login').mockResolvedValue(false)
    const push = vi.spyOn(router, 'push')
    w = mountIt()
    await w.find('input[autocomplete="username"]').setValue('aigerim.k')
    await w.find('input[autocomplete="current-password"]').setValue('wrong')
    await submit()
    expect(push).not.toHaveBeenCalled()
    expect(w.find('button[type="submit"]').attributes('aria-busy')).toBeUndefined()
  })

  it('подписи связаны с полями, логин в фокусе при открытии', async () => {
    w = mountIt()
    await flushPromises()
    const user = w.find('input[autocomplete="username"]')
    const pass = w.find('input[autocomplete="current-password"]')
    expect(w.find(`label[for="${user.attributes('id')}"]`).text()).toBe('Логин или e-mail')
    expect(w.find(`label[for="${pass.attributes('id')}"]`).text()).toBe('Пароль')
    expect(user.attributes('aria-required')).toBe('true')
    expect(document.activeElement).toBe(user.element)
  })

  it('ссылки на восстановление пароля и регистрацию', () => {
    w = mountIt()
    expect(w.find('a[href="/forgot-password"]').text()).toBe('Забыли пароль?')
    expect(w.find('a[href="/register"]').text()).toBe('Зарегистрировать компанию')
    expect(w.find('h2').text()).toBe('Вход')
  })
})
