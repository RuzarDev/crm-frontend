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
  vi.unstubAllGlobals()
  localStorage.clear()
})

// Ширина экрана для автофокуса: true — ≥ lg (1024px), false — телефон.
const stubWide = (wide: boolean) =>
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: wide && q === '(min-width: 1024px)', media: q })))

const mountIt = () => mountWithI18n(LoginView, { attachTo: document.body, global: { plugins: [pinia, router] } })
const userInput = () => w.find('input[autocomplete="username"]')
const passInput = () => w.find('input[autocomplete="current-password"]')
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
    expect(document.activeElement).toBe(userInput().element)
    // Ошибка связана с полем: aria-invalid и aria-describedby на текст ошибки.
    for (const [input, text] of [[userInput(), 'Введите логин или e-mail'], [passInput(), 'Введите пароль']] as const) {
      expect(input.attributes('aria-invalid')).toBe('true')
      const ids = input.attributes('aria-describedby')?.split(' ') ?? []
      expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(text)
    }
  })

  it('заполнено — вход с логином и паролем, затем переход на главную', async () => {
    const login = vi.spyOn(useAuthStore(), 'login').mockResolvedValue(true)
    const push = vi.spyOn(router, 'push')
    w = mountIt()
    await userInput().setValue('aigerim.k')
    await passInput().setValue('secret')
    await submit()
    expect(login).toHaveBeenCalledWith({ username: 'aigerim.k', password: 'secret' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('пробелы по краям логина обрезаются, пароль — как есть', async () => {
    const login = vi.spyOn(useAuthStore(), 'login').mockResolvedValue(true)
    w = mountIt()
    await userInput().setValue(' aigerim.k ')
    await passInput().setValue(' secret ')
    await submit()
    expect(login).toHaveBeenCalledWith({ username: 'aigerim.k', password: ' secret ' })
  })

  it('неудачный вход — остаёмся на странице (ошибку показывает перехватчик axios)', async () => {
    vi.spyOn(useAuthStore(), 'login').mockResolvedValue(false)
    const push = vi.spyOn(router, 'push')
    w = mountIt()
    await userInput().setValue('aigerim.k')
    await passInput().setValue('wrong')
    await submit()
    expect(push).not.toHaveBeenCalled()
    expect(w.find('button[type="submit"]').attributes('aria-busy')).toBeUndefined()
  })

  it('подписи связаны с полями, на широком экране логин в фокусе при открытии', async () => {
    stubWide(true)
    w = mountIt()
    await flushPromises()
    const user = w.find('input[autocomplete="username"]')
    const pass = w.find('input[autocomplete="current-password"]')
    expect(w.find(`label[for="${user.attributes('id')}"]`).text()).toBe('Логин или e-mail')
    expect(w.find(`label[for="${pass.attributes('id')}"]`).text()).toBe('Пароль')
    expect(user.attributes('aria-required')).toBe('true')
    expect(document.activeElement).toBe(user.element)
  })

  it('на телефоне (< lg) автофокуса нет — клавиатура не закрывает форму', async () => {
    stubWide(false)
    w = mountIt()
    await flushPromises()
    expect(document.activeElement).not.toBe(userInput().element)
  })

  it('порядок Tab: логин → пароль → «Забыли пароль?» (ссылка в DOM после поля пароля)', () => {
    w = mountIt()
    const focusable = [...w.get('form').element.querySelectorAll<HTMLElement>('input, button, a[href]')]
      .filter((el) => el.tabIndex >= 0)
    const user = focusable.indexOf(userInput().element as HTMLElement)
    const pass = focusable.indexOf(passInput().element as HTMLElement)
    const forgot = focusable.indexOf(w.find('a[href="/forgot-password"]').element as HTMLElement)
    expect(user).toBe(0)
    expect(pass).toBe(1)
    expect(forgot).toBeGreaterThan(pass)
    // Визуально ссылка — в строке подписи пароля.
    expect(w.find('a[href="/forgot-password"]').classes()).toEqual(expect.arrayContaining(['absolute', 'right-0', 'top-0']))
  })

  it('ссылки на восстановление пароля и регистрацию', () => {
    w = mountIt()
    expect(w.find('a[href="/forgot-password"]').text()).toBe('Забыли пароль?')
    expect(w.find('a[href="/register"]').text()).toBe('Зарегистрировать компанию')
    // Ссылка в строке текста отличается не только цветом (WCAG 1.4.1).
    expect(w.find('a[href="/register"]').classes()).toContain('underline')
    expect(w.find('h2').text()).toBe('Вход')
  })
})
