import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import RegisterView from '@/views/RegisterView.vue'
import ForgotPasswordView from '@/views/ForgotPasswordView.vue'
import ResetPasswordView from '@/views/ResetPasswordView.vue'
import InviteAcceptView from '@/views/InviteAcceptView.vue'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/passwordReset'
import { clientsOnboardingApi } from '@/api/clientsOnboarding'
import { companyLookupApi, type CompanyLookupDto } from '@/api/companyLookup'
import type { LoginResponse } from '@/types/api'

const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

let w: VueWrapper
let pinia: Pinia
let router: Router

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const page = { template: '<div/>' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/login', '/register', '/forgot-password', '/reset-password/:token', '/invite/:token', '/import-40/company']
      .map((path) => ({ path, component: page })),
  })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.values(msg).forEach((f) => f.mockReset())
  localStorage.clear()
})

const open = async (view: Component, path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(view, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
/** Поле по тексту своей подписи (<label for>). */
const field = (label: string): DOMWrapper<HTMLInputElement> => {
  const l = w.findAll('label').find((x) => x.text().startsWith(label))
  if (!l) throw new Error(`нет подписи «${label}»`)
  return w.get<HTMLInputElement>(`[id="${l.attributes('for')}"]`)
}
/** Текст ошибки/подсказки, связанной с полем через aria-describedby. */
const described = (input: DOMWrapper<Element>) =>
  (input.attributes('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
const submit = async () => {
  await w.get('form').trigger('submit')
  await flushPromises()
}

describe('RegisterView', () => {
  const fill = async (o: { confirm?: string } = {}) => {
    await field('Email').setValue('Office@Argyn.KZ ')
    await field('БИН компании').setValue('123456789012')
    await field('Наименование компании').setValue('ТОО «Аргын»')
    await field('Пароль').setValue('secret123')
    await field('Повторите пароль').setValue(o.confirm ?? 'secret123')
  }

  it('пароли не совпадают — ошибка под полем повтора, регистрация не вызывается', async () => {
    const reg = vi.spyOn(useAuthStore(), 'registerClient').mockResolvedValue(true)
    await open(RegisterView, '/register')
    await fill({ confirm: 'secret124' })
    await submit()
    const confirm = field('Повторите пароль')
    expect(confirm.attributes('aria-invalid')).toBe('true')
    expect(described(confirm)).toContain('Пароли не совпадают')
    expect(reg).not.toHaveBeenCalled()
    expect(msg.error).not.toHaveBeenCalled()
    // Исправили пароль под повтор — ошибка у повтора снимается.
    await field('Пароль').setValue('secret124')
    await flushPromises()
    expect(described(confirm)).not.toContain('Пароли не совпадают')
  })

  it('пустая отправка — ошибки под обязательными полями, телефон необязателен', async () => {
    await open(RegisterView, '/register')
    await submit()
    expect(described(field('Email'))).toContain('Введите email')
    expect(described(field('БИН компании'))).toContain('Введите БИН')
    expect(described(field('Наименование компании'))).toContain('Укажите наименование компании')
    expect(described(field('Пароль'))).toContain('Введите пароль')
    expect(described(field('Повторите пароль'))).toContain('Повторите пароль')
    expect(field('Телефон').attributes('aria-invalid')).toBeUndefined()
    expect(document.activeElement).toBe(field('Email').element)
  })

  it('успех — registerClient с полями формы, тост и переход в «Моя компания»', async () => {
    const reg = vi.spyOn(useAuthStore(), 'registerClient').mockResolvedValue(true)
    const push = vi.spyOn(router, 'push')
    await open(RegisterView, '/register')
    await fill()
    // ZPhone в форме: номер форматируется на вводе.
    await field('Телефон').setValue('87014821937')
    expect(field('Телефон').element.value).toBe('+7 701 482 19 37')
    await submit()
    expect(reg).toHaveBeenCalledWith({
      email: 'office@argyn.kz', password: 'secret123', bin: '123456789012', phone: '+7 701 482 19 37',
      companyName: 'ТОО «Аргын»', legalAddress: null, directorName: null,
    })
    expect(msg.success).toHaveBeenCalledWith('Компания зарегистрирована. Осталось заполнить реквизиты, договор и доверенность')
    expect(push).toHaveBeenCalledWith('/import-40/company')
  })

  it('неудачная регистрация — остаёмся на странице', async () => {
    vi.spyOn(useAuthStore(), 'registerClient').mockResolvedValue(false)
    await open(RegisterView, '/register')
    const push = vi.spyOn(router, 'push')
    await fill()
    await submit()
    expect(push).not.toHaveBeenCalled()
    expect(msg.success).not.toHaveBeenCalled()
  })

  it('«Найти по БИН/ИИН»: доступна при 12 цифрах, подставляет наименование, адрес и руководителя', async () => {
    const card: CompanyLookupDto = {
      bin: '123456789012', nameRu: 'ТОО «Аргын Логистик»', nameKz: null, addressRu: 'Астана, Мәңгілік Ел 55', addressKz: null,
      director: 'Сейтов А.', okedRu: null, statusRu: null, dateReg: null, source: 'gbd_ul', fetchedAtUtc: '2026-10-08T00:00:00Z',
    }
    const byBin = vi.spyOn(companyLookupApi, 'byBin').mockResolvedValue(card)
    const reg = vi.spyOn(useAuthStore(), 'registerClient').mockResolvedValue(true)
    await open(RegisterView, '/register')
    const find = w.findAll('button').find((b) => b.text() === 'Найти по БИН/ИИН')!
    expect(find.attributes('type')).toBe('button')
    expect(find.attributes('disabled')).toBeDefined()
    await field('БИН компании').setValue('123456789012')
    expect(find.attributes('disabled')).toBeUndefined()
    await find.trigger('click')
    await flushPromises()
    expect(byBin).toHaveBeenCalledWith('123456789012', true)
    expect(field('Наименование компании').element.value).toBe('ТОО «Аргын Логистик»')
    await field('Email').setValue('office@argyn.kz')
    await field('Пароль').setValue('secret123')
    await field('Повторите пароль').setValue('secret123')
    await submit()
    expect(reg).toHaveBeenCalledWith(expect.objectContaining({
      companyName: 'ТОО «Аргын Логистик»', legalAddress: 'Астана, Мәңгілік Ел 55', directorName: 'Сейтов А.', phone: null,
    }))
  })

  it('герой регистрации и ссылка «Войти» в подвале', async () => {
    await open(RegisterView, '/register')
    expect(w.find('h2').text()).toBe('Регистрация')
    expect(w.text()).toContain('Начните работу с AQNIET')
    expect(w.text()).toContain('Подпишите документы')
    const login = w.get('a[href="/login"]')
    expect(login.text()).toBe('Войти')
    expect(login.classes()).toContain('underline')
  })
})

describe('ForgotPasswordView', () => {
  it('успех — состояние «отправлено» со ссылкой ко входу', async () => {
    const forgot = vi.spyOn(authApi, 'forgotPassword').mockResolvedValue()
    await open(ForgotPasswordView, '/forgot-password')
    await field('Email или логин').setValue(' office@argyn.kz ')
    await submit()
    expect(forgot).toHaveBeenCalledWith('office@argyn.kz')
    expect(w.find('h2').text()).toBe('Письмо отправлено')
    expect(w.text()).toContain('Если такой адрес зарегистрирован')
    expect(w.find('form').exists()).toBe(false)
    const back = w.get('a[href="/login"]')
    expect(back.text()).toBe('Вернуться ко входу')
    // Форма исчезла вместе с кнопкой в фокусе — фокус на действии нового состояния.
    expect(document.activeElement).toBe(back.element)
  })

  it('пустой логин — ошибка под полем, запроса нет', async () => {
    const forgot = vi.spyOn(authApi, 'forgotPassword')
    await open(ForgotPasswordView, '/forgot-password')
    // «@» в словаре экранирован ({'@'}) — иначе vue-i18n принимает его за ссылку на ключ.
    expect(field('Email или логин').attributes('placeholder')).toBe('client@company.kz')
    await submit()
    expect(described(field('Email или логин'))).toContain('Укажите email или логин')
    expect(forgot).not.toHaveBeenCalled()
  })

  it('ошибка — плашка с текстом сервера (или своим), форма остаётся', async () => {
    vi.spyOn(authApi, 'forgotPassword')
      .mockRejectedValueOnce({ response: { status: 503, data: { error: 'Почта не настроена' } } })
      .mockRejectedValueOnce({ response: { status: 500 } })
    await open(ForgotPasswordView, '/forgot-password')
    await field('Email или логин').setValue('office@argyn.kz')
    await submit()
    expect(w.get('[role="alert"]').text()).toBe('Почта не настроена')
    await submit()
    expect(w.get('[role="alert"]').text()).toBe('Не удалось выполнить запрос')
    expect(w.find('form').exists()).toBe(true)
  })
})

describe('ResetPasswordView', () => {
  it('ссылка недействительна (404) — состояние invalid со ссылкой на /forgot-password', async () => {
    vi.spyOn(authApi, 'checkResetToken').mockRejectedValue({ response: { status: 404 } })
    await open(ResetPasswordView, '/reset-password/abc')
    expect(w.find('h2').text()).toBe('Ссылка недействительна')
    expect(w.get('a[href="/forgot-password"]').text()).toBe('Запросить новую')
    expect(w.find('form').exists()).toBe(false)
  })

  it('пока проверяется ссылка — скелетон, затем форма с e-mail в подзаголовке', async () => {
    let resolve!: (v: { email: string }) => void
    const check = vi.spyOn(authApi, 'checkResetToken').mockReturnValue(new Promise((r) => { resolve = r }))
    await open(ResetPasswordView, '/reset-password/abc')
    expect(check).toHaveBeenCalledWith('abc')
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
    expect(w.find('form').exists()).toBe(false)
    resolve({ email: 'o***@argyn.kz' })
    await flushPromises()
    expect(w.text()).toContain('Для аккаунта o***@argyn.kz')
    expect(w.find('form').exists()).toBe(true)
  })

  it('несовпадение — ошибка под повтором; успех — «Пароль изменён» и вход', async () => {
    vi.spyOn(authApi, 'checkResetToken').mockResolvedValue({ email: 'o***@argyn.kz' })
    const reset = vi.spyOn(authApi, 'resetPassword').mockResolvedValue()
    await open(ResetPasswordView, '/reset-password/abc')
    await field('Новый пароль').setValue('secret123')
    await field('Повторите пароль').setValue('secret12')
    await submit()
    expect(described(field('Повторите пароль'))).toContain('Пароли не совпадают')
    expect(reset).not.toHaveBeenCalled()
    await field('Повторите пароль').setValue('secret123')
    await submit()
    expect(reset).toHaveBeenCalledWith('abc', 'secret123')
    expect(w.find('h2').text()).toBe('Пароль изменён')
    expect(w.get('a[href="/login"]').text()).toBe('Войти')
  })

  it('ссылка истекла при сохранении (404) — invalid; прочая ошибка — тост', async () => {
    vi.spyOn(authApi, 'checkResetToken').mockResolvedValue({ email: 'o***@argyn.kz' })
    vi.spyOn(authApi, 'resetPassword')
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ response: { status: 404 } })
    await open(ResetPasswordView, '/reset-password/abc')
    await field('Новый пароль').setValue('secret123')
    await field('Повторите пароль').setValue('secret123')
    await submit()
    expect(msg.error).toHaveBeenCalledWith('Не удалось выполнить запрос')
    await submit()
    expect(w.find('h2').text()).toBe('Ссылка недействительна')
  })
})

describe('InviteAcceptView', () => {
  const info = { email: 'office@argyn.kz', companyName: 'ТОО «Аргын»', bin: '123456789012', expiresAtUtc: '2026-10-15T00:00:00Z' }
  const response = { token: 't' } as unknown as LoginResponse

  it('компания и логин в подзаголовке; успех — авто-вход и «Моя компания»', async () => {
    vi.spyOn(clientsOnboardingApi, 'inviteInfo').mockResolvedValue(info)
    const accept = vi.spyOn(clientsOnboardingApi, 'acceptInvite').mockResolvedValue(response)
    const loginFrom = vi.spyOn(useAuthStore(), 'loginFromResponse').mockReturnValue(true)
    const push = vi.spyOn(router, 'push')
    await open(InviteAcceptView, '/invite/tok')
    expect(w.text()).toContain('Вас пригласили в Zircon CRM для ТОО «Аргын».')
    expect(w.text()).toContain('Логин — office@argyn.kz.')
    await field('Пароль').setValue('secret123')
    await field('Повторите пароль').setValue('secret123')
    await submit()
    expect(accept).toHaveBeenCalledWith('tok', 'secret123')
    expect(loginFrom).toHaveBeenCalledWith(response, 'office@argyn.kz')
    expect(push).toHaveBeenCalledWith('/import-40/company')
  })

  it('несовпадение паролей — ошибка под повтором, приглашение не принимается', async () => {
    vi.spyOn(clientsOnboardingApi, 'inviteInfo').mockResolvedValue(info)
    const accept = vi.spyOn(clientsOnboardingApi, 'acceptInvite')
    await open(InviteAcceptView, '/invite/tok')
    await field('Пароль').setValue('secret123')
    await field('Повторите пароль').setValue('secret321')
    await submit()
    expect(described(field('Повторите пароль'))).toContain('Пароли не совпадают')
    expect(accept).not.toHaveBeenCalled()
  })

  it('авто-вход не удался — запасное состояние «Пароль задан» со входом', async () => {
    vi.spyOn(clientsOnboardingApi, 'inviteInfo').mockResolvedValue(info)
    vi.spyOn(clientsOnboardingApi, 'acceptInvite').mockResolvedValue(response)
    vi.spyOn(useAuthStore(), 'loginFromResponse').mockReturnValue(false)
    await open(InviteAcceptView, '/invite/tok')
    await field('Пароль').setValue('secret123')
    await field('Повторите пароль').setValue('secret123')
    await submit()
    expect(w.find('h2').text()).toBe('Пароль задан')
    expect(w.text()).toContain('Теперь войдите с логином office@argyn.kz.')
    expect(w.get('a[href="/login"]').text()).toBe('Войти')
  })

  it('приглашение недействительно — текст и ссылка на вход', async () => {
    vi.spyOn(clientsOnboardingApi, 'inviteInfo').mockRejectedValue({ response: { status: 404 } })
    await open(InviteAcceptView, '/invite/tok')
    expect(w.find('h2').text()).toBe('Ссылка недействительна')
    expect(w.get('a[href="/login"]').text()).toBe('На страницу входа')
  })
})
