import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import type { OrganizationSettings } from '@/api/billing'

const api = vi.hoisted(() => ({
  organization: vi.fn(), saveOrganization: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/billing', async (orig) => ({
  ...(await orig<typeof import('@/api/billing')>()),
  billingApi: { organization: api.organization, saveOrganization: api.saveOrganization },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import OrganizationPage from '../OrganizationPage.vue'
import { useAuthStore } from '@/stores/auth'

const SAVED_AT = '2026-10-02T09:20:00Z'
const dto = (over: Partial<OrganizationSettings> = {}): OrganizationSettings => ({
  companyName: 'ТОО «AQNIET Customs»', shortName: 'AQNIET', bin: '180940012345', legalAddress: 'Алматы, пр. Абая 52, оф. 305',
  bank: 'АО «Kaspi Bank»', iik: 'KZ72722S000012345678', bik: 'CASPKZKA', kbe: '17',
  directorName: 'Ахметов К. С.', directorBasis: 'устава', accountantName: 'Жумабек А. Е.', phone: '+7 727 355 12 40', email: 'office@aqniet.kz',
  vatPayer: true, vatRate: 16, updatedAtUtc: SAVED_AT, updatedByName: 'Ахметов К.',
  ...over,
})

let w: VueWrapper
let router: Router
const App = { render: () => h(RouterView) }
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const open = async () => {
  await router.push('/settings/organization')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const field = (k: string) => w.get(`[data-org="${k}"]`)
const input = (k: string) => field(k).element as HTMLInputElement
const type = async (k: string, v: string) => { await field(k).setValue(v); await flushPromises() }
const bar = () => w.find('[data-savebar]')
const saveBtn = () => w.get('[data-savebar-save]')

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/organization', component: OrganizationPage },
      { path: '/:p(.*)*', component: { template: '<div data-other />' } },
    ],
  })
  api.organization.mockImplementation(async () => dto())
  api.saveOrganization.mockImplementation(async (d: OrganizationSettings) => ({ ...d, updatedAtUtc: '2026-10-09T10:00:00Z', updatedByName: 'Жумабек А.' }))
  as('accountant', ['finance.read', 'finance.write'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('OrganizationPage: состав', () => {
  it('шапка, подзаголовок с кратким названием, «Сохранено … · Имя», запрос silent', async () => {
    await open()
    expect(w.get('h1').text()).toBe('Организация')
    expect(w.get('[data-org-hint]').text()).toBe('Реквизиты AQNIET · попадают в счета, акты, договоры и доверенности')
    const d = new Date(SAVED_AT)
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(w.get('[data-org-saved]').text()).toBe(`Сохранено 02.10, ${hm} · Ахметов К.`)
    expect(api.organization).toHaveBeenCalledWith({ silent: true })
  })
  it('нет краткого названия — подзаголовок без него; нет имени — «Сохранено …» без «·»', async () => {
    api.organization.mockResolvedValue(dto({ shortName: '', updatedByName: null }))
    await open()
    expect(w.get('[data-org-hint]').text()).toBe('Реквизиты · попадают в счета, акты, договоры и доверенности')
    expect(w.get('[data-org-saved]').text()).not.toContain('·')
  })
  it('шесть секций и поля с данными; ИИК показан группами', async () => {
    await open()
    expect(w.findAll('[data-org-section]').map((s) => s.attributes('data-org-section'))).toEqual(['company', 'signers', 'bank', 'vat', 'customsRep', 'notify'])
    expect(w.findAll('h2').map((h) => h.text())).toEqual(['Компания', 'Подписанты', 'Банк', 'НДС', 'Таможенный представитель', 'Уведомления'])
    expect(input('companyName').value).toBe('ТОО «AQNIET Customs»')
    expect(input('bin').value).toBe('180940012345')
    expect(input('iik').value).toBe('KZ72 722S 0000 1234 5678')
    expect(input('phone').value).toBe('+7 727 355 12 40')
    expect(input('vatRate').value).toBe('16')
    expect(bar().exists()).toBe(false)
  })
  it('ошибка загрузки — «Не удалось загрузить» и «Повторить», один тост не нужен', async () => {
    api.organization.mockRejectedValueOnce(new Error('x'))
    await open()
    expect(w.get('[data-org-load-error]').text()).toContain('Не удалось загрузить')
    await w.get('[data-org-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-org-form]').exists()).toBe(true)
    expect(api.toast.error).not.toHaveBeenCalled()
  })
})

describe('OrganizationPage: проверки на месте', () => {
  it('пустое полное наименование — ошибка под полем, сохранение недоступно', async () => {
    await open()
    await type('companyName', '')
    expect(w.text()).toContain('Укажите полное наименование')
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })
  it.each([
    ['bin', '1234', 'БИН — 12 цифр'],
    ['iik', 'KZ1234', 'ИИК — KZ и ещё 18 знаков'],
    ['bik', 'ABC', 'БИК — 8 латинских букв или цифр'],
    ['kbe', '1', 'Кбе — 2 цифры'],
    ['email', 'abc', 'Неверный формат email'],
  ])('%s = «%s» → «%s», «Сохранить» недоступна', async (k, v, msg) => {
    await open()
    await type(k, v)
    expect(w.text()).toContain(msg)
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })
  it('исправили — ошибка уходит, сохранение доступно', async () => {
    await open()
    await type('bin', '12')
    expect(saveBtn().attributes('disabled')).toBeDefined()
    await type('bin', '180940012346')
    expect(w.text()).not.toContain('БИН — 12 цифр')
    expect(saveBtn().attributes('disabled')).toBeUndefined()
  })
  it('БИК набирается в верхнем регистре, ИИК — тоже', async () => {
    await open()
    await type('bik', 'caspkzka')
    await type('iik', 'kz72722s000012345678')
    expect(input('bik').value).toBe('CASPKZKA')
    expect(input('iik').value).toBe('KZ72722S000012345678')
  })
})

describe('OrganizationPage: панель несохранённых изменений', () => {
  it('называет изменённые секции; «Отменить» возвращает как было', async () => {
    await open()
    await type('bank', 'Halyk')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · банк')
    await type('legalAddress', 'Астана')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · компания, банк')
    await w.get('[data-savebar-cancel]').trigger('click')
    await flushPromises()
    expect(bar().exists()).toBe(false)
    expect(input('bank').value).toBe('АО «Kaspi Bank»')
    expect(input('legalAddress').value).toBe('Алматы, пр. Абая 52, оф. 305')
  })
  it('правка и возврат прежнего значения — панель исчезает', async () => {
    await open()
    await type('bank', 'Halyk')
    await type('bank', 'АО «Kaspi Bank»')
    expect(bar().exists()).toBe(false)
  })
  it('переключатель НДС: «Нет» блокирует ставку; секция «ндс» в панели', async () => {
    await open()
    expect(input('vatRate').disabled).toBe(false)
    await field('vatPayer').trigger('click')
    await flushPromises()
    expect(input('vatRate').disabled).toBe(true)
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · ндс')
  })
  it('своё основание: поле ввода появляется, пустое — ошибка', async () => {
    api.organization.mockResolvedValue(dto({ directorBasis: 'приказа № 5' }))
    await open()
    expect(input('directorBasisChoice').value).toBe('Другое…')
    expect(input('directorBasis').value).toBe('приказа № 5')
    await type('directorBasis', '')
    expect(w.text()).toContain('Укажите основание')
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })
  it('сохранено «Устава» с заглавной — это «устава», а не «Другое…»; выбор того же пункта правкой не считается', async () => {
    api.organization.mockResolvedValue(dto({ directorBasis: ' Устава ' }))
    await open()
    expect(input('directorBasisChoice').value).toBe('устава')
    expect(w.find('[data-org="directorBasis"]').exists()).toBe(false)
    await field('directorBasisChoice').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const pick = (label: string) => ([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.trim() === label) as HTMLElement).click()
    pick('устава')
    await flushPromises()
    expect(bar().exists()).toBe(false)
    // другое основание — правка; вернули прежний вариант — снова нет правки
    await field('directorBasisChoice').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    pick('доверенности')
    await flushPromises()
    expect(bar().exists()).toBe(true)
    await field('directorBasisChoice').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    pick('устава')
    await flushPromises()
    expect(bar().exists()).toBe(false)
  })
  it('выбор «доверенности» из списка меняет основание', async () => {
    await open()
    expect(input('directorBasisChoice').value).toBe('устава')
    await field('directorBasisChoice').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const opt = [...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.trim() === 'доверенности') as HTMLElement
    opt.click()
    await flushPromises()
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · подписанты')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(api.saveOrganization.mock.calls[0][0].directorBasis).toBe('доверенности')
  })
})

describe('OrganizationPage: ошибки не прячутся', () => {
  it('в данных с сервера есть ошибки, правим банк — все ошибки видны, панель говорит, что мешает сохранить', async () => {
    api.organization.mockResolvedValue(dto({ companyName: '', bin: '123' }))
    await open()
    expect(w.text()).not.toContain('Укажите полное наименование') // нетронутая форма не «краснеет»
    expect(bar().exists()).toBe(false)
    await type('bank', 'Halyk')
    expect(w.text()).toContain('Укажите полное наименование')
    expect(w.text()).toContain('БИН — 12 цифр')
    expect(saveBtn().attributes('disabled')).toBeDefined()
    expect(w.get('[data-savebar-text]').text()).toBe('Нельзя сохранить · Укажите полное наименование')
    await type('companyName', 'ТОО')
    await type('bin', '180940012345')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · компания, банк')
    expect(saveBtn().attributes('disabled')).toBeUndefined()
  })
  it('вставка БИК и БИН с пробелами не обрезается', async () => {
    await open()
    await type('bik', 'casp kzka')
    await type('bin', '1809 4001 2346')
    expect(input('bik').value).toBe('CASPKZKA')
    expect(input('bin').value).toBe('180940012346')
    expect(w.text()).not.toContain('БИК — 8')
    expect(w.text()).not.toContain('БИН — 12 цифр')
  })
})

describe('OrganizationPage: сохранение', () => {
  it('ошибка сохранения краснит панель и уходит со следующей правкой', async () => {
    api.saveOrganization.mockRejectedValueOnce({ response: { data: { error: 'БИН уже занят' } } })
    await open()
    await type('bank', 'Halyk')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(w.get('[data-savebar-text]').classes()).toContain('text-danger')
    await type('bank', 'Halyk Bank')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · банк')
    expect(w.get('[data-savebar-text]').classes()).not.toContain('text-danger')
  })
  it('отправляет весь DTO (строки без null, ИИК без пробелов, updatedAtUtc; адреса КЕДЕН не трогали — null), обновляет «Сохранено», тост', async () => {
    await open()
    await type('bank', '  Halyk  ')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(api.saveOrganization).toHaveBeenCalledTimes(1)
    const [sent, opts] = api.saveOrganization.mock.calls[0]
    expect(opts).toEqual({ silent: true })
    expect(sent).toEqual({
      companyName: 'ТОО «AQNIET Customs»', shortName: 'AQNIET', bin: '180940012345', legalAddress: 'Алматы, пр. Абая 52, оф. 305',
      bank: 'Halyk', iik: 'KZ72722S000012345678', bik: 'CASPKZKA', kbe: '17',
      directorName: 'Ахметов К. С.', directorBasis: 'устава', accountantName: 'Жумабек А. Е.', phone: '+7 727 355 12 40', email: 'office@aqniet.kz',
      vatPayer: true, vatRate: 16, kedenStatusEmails: null, serviceAlertEmails: null, customsRepRegistryNumber: null, customsRepRegistryDate: null, updatedAtUtc: SAVED_AT,
    })
    expect(api.toast.success).toHaveBeenCalledTimes(1)
    expect(bar().exists()).toBe(false)
    expect(w.get('[data-org-saved]').text()).toContain('Жумабек А.')
  })
  it('ошибка сохранения — одно сообщение на странице (в панели), без тоста; правки остаются', async () => {
    api.saveOrganization.mockRejectedValueOnce({ response: { data: { error: 'БИН уже занят' } } })
    await open()
    await type('bank', 'Halyk')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(w.get('[data-savebar-text]').text()).toBe('БИН уже занят')
    expect(api.toast.error).not.toHaveBeenCalled()
    expect(bar().exists()).toBe(true)
    expect(input('bank').value).toBe('Halyk')
    expect(saveBtn().attributes('disabled')).toBeUndefined() // можно повторить
  })
  it('ответ сервера без текста — общая фраза', async () => {
    api.saveOrganization.mockRejectedValueOnce(new Error('boom'))
    await open()
    await type('bank', 'Halyk')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(w.get('[data-savebar-text]').text()).toBe('Не удалось сохранить реквизиты')
  })
})

// Свидетельство таможенного представителя: из него сервер ставит 09034 в гр.44 новых ДТ (05.11.2026).
describe('OrganizationPage: свидетельство таможенного представителя', () => {
  const section = () => w.get('[data-org-section="customsRep"]')

  it('подпись и подсказка; значения с сервера в полях', async () => {
    api.organization.mockResolvedValue(dto({ customsRepRegistryNumber: 'N-1', customsRepRegistryDate: '2024-02-03' }))
    await open()
    expect(section().text()).toContain('Номер свидетельства')
    expect(section().text()).toContain('Попадает в гр.44 каждой новой ДТ')
    expect(input('customsRepRegistryNumber').value).toBe('N-1')
    expect(input('customsRepRegistryDate').value).toBe('03.02.2024')
    expect(bar().exists()).toBe(false)
  })
  it('номер без даты не сохраняется: ошибка у даты, «Сохранить» заблокирована', async () => {
    await open()
    await type('customsRepRegistryNumber', 'N-1')
    expect(section().text()).toContain('Укажите дату свидетельства')
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })
  it('новый номер уходит в PUT; дата не менялась — null', async () => {
    api.organization.mockResolvedValue(dto({ customsRepRegistryNumber: 'N-1', customsRepRegistryDate: '2024-02-03' }))
    api.saveOrganization.mockImplementation(async (d: OrganizationSettings) => dto({ ...d, customsRepRegistryDate: '2024-02-03' }))
    await open()
    await type('customsRepRegistryNumber', ' N-2 ')
    expect(bar().text()).toContain('таможенный представитель')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(api.saveOrganization.mock.calls[0][0]).toMatchObject({ customsRepRegistryNumber: 'N-2', customsRepRegistryDate: null })
  })
  it('без права правки поля заблокированы', async () => {
    as('declarant', [])
    await open()
    expect(input('customsRepRegistryNumber').disabled).toBe(true)
    expect(input('customsRepRegistryDate').disabled).toBe(true)
  })
})

// Почта для писем о смене статуса ДТ в КЕДЕН (23.10.2026).
describe('OrganizationPage: почта для уведомлений КЕДЕН', () => {
  const area = () => field('kedenStatusEmails').element as HTMLTextAreaElement
  const box = () => w.get('[data-org-section="notify"] [data-z-field]')

  it('поле с подписью и подсказкой; адреса с сервера — по одному на строку', async () => {
    api.organization.mockResolvedValue(dto({ kedenStatusEmails: 'chief@example.com,duty@example.org' }))
    await open()
    expect(field('kedenStatusEmails').element.tagName).toBe('TEXTAREA')
    expect(box().text()).toContain('Почта для уведомлений КЕДЕН')
    expect(box().text()).toContain('Письмо о любой смене статуса ДТ в КЕДЕН. Несколько адресов — через запятую или с новой строки')
    expect(area().value).toBe('chief@example.com\nduty@example.org')
    expect(bar().exists()).toBe(false)
  })

  it('сохраняется тем же «Сохранить»: адреса через запятую, нижний регистр, без повторов', async () => {
    api.organization.mockResolvedValue(dto({ kedenStatusEmails: 'chief@example.com' }))
    await open()
    await type('kedenStatusEmails', 'chief@example.com\nDuty@Example.org; chief@example.com')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · уведомления')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(api.saveOrganization).toHaveBeenCalledTimes(1)
    expect(api.saveOrganization.mock.calls[0][0].kedenStatusEmails).toBe('chief@example.com,duty@example.org')
    expect(area().value).toBe('chief@example.com\nduty@example.org')
    expect(bar().exists()).toBe(false)
  })

  // Ревью 23.10.2026: давно открытая вкладка с пустым списком при правке реквизитов не должна стирать адреса,
  // добавленные с тех пор в другой вкладке (сервер версию записи не сверяет; null — «не менять»).
  it('правили только реквизиты — адреса не отправляются (null), список на сервере не трогается', async () => {
    api.organization.mockResolvedValue(dto({ kedenStatusEmails: 'chief@example.com' }))
    await open()
    await type('bank', 'Halyk')
    await type('kedenStatusEmails', 'Chief@Example.com;')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · банк')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(api.saveOrganization.mock.calls[0][0].kedenStatusEmails).toBeNull()
  })

  it('очистили — уходит пустая строка', async () => {
    api.organization.mockResolvedValue(dto({ kedenStatusEmails: 'chief@example.com' }))
    await open()
    await type('kedenStatusEmails', '')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(api.saveOrganization.mock.calls[0][0].kedenStatusEmails).toBe('')
  })

  it('неверный адрес — ошибка у поля с этим адресом, «Сохранить» недоступна', async () => {
    await open()
    await type('kedenStatusEmails', 'chief@example.com, chief-at-example.com')
    expect(box().text()).toContain('Неверный адрес: chief-at-example.com')
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })

  it('больше 20 адресов — ошибка лимита', async () => {
    await open()
    await type('kedenStatusEmails', Array.from({ length: 21 }, (_, i) => `u${i}@example.com`).join('\n'))
    expect(box().text()).toContain('Не больше 20 адресов')
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })

  it('400 сервера по адресам — текст у поля и в панели; правка адресов снимает ошибку у поля', async () => {
    api.saveOrganization.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'Неверный адрес: duty@example', errors: { kedenStatusEmails: ['Неверный адрес: duty@example'] } } },
    })
    await open()
    await type('kedenStatusEmails', 'duty@example.org')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(box().get('[data-z-status="error"]').text()).toBe('Неверный адрес: duty@example')
    expect(area().getAttribute('aria-invalid')).toBe('true')
    expect(w.get('[data-savebar-text]').text()).toBe('Неверный адрес: duty@example')
    expect(api.toast.error).not.toHaveBeenCalled()
    await type('kedenStatusEmails', 'duty@example.net')
    expect(box().find('[data-z-status="error"]').exists()).toBe(false)
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · уведомления')
  })

  it('400 при неизменённых адресах — ошибка только в панели, поле не краснеет', async () => {
    api.saveOrganization.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Неверные данные' } } })
    await open()
    await type('bank', 'Halyk')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(w.get('[data-savebar-text]').text()).toBe('Неверные данные')
    expect(box().find('[data-z-status="error"]').exists()).toBe(false)
  })

  it('только чтение — поле недоступно', async () => {
    as('sales', ['finance.read'])
    await open()
    expect(area().disabled).toBe(true)
  })
})

describe('OrganizationPage: только чтение', () => {
  it('finance.read без права менять — поля недоступны, панели нет', async () => {
    as('sales', ['finance.read'])
    await open()
    expect(input('companyName').disabled).toBe(true)
    expect(input('bank').disabled).toBe(true)
    expect(input('phone').disabled).toBe(true)
    // Список основания не открывается (у доступного поля тот же жест открывает его — см. тест выбора «доверенности»).
    await field('directorBasisChoice').trigger('keydown', { key: 'ArrowDown' })
    await field('directorBasisChoice').trigger('click')
    await nextTick()
    expect(document.body.querySelectorAll('[role="option"]').length).toBe(0)
    expect(field('vatPayer').attributes('disabled')).toBeDefined()
    expect(bar().exists()).toBe(false)
  })
  it('без права менять: подсказка, кто может; с правом — подсказки нет', async () => {
    as('kpp', ['finance.read'])
    await open()
    expect(w.get('[data-org-readonly]').text()).toBe('Только просмотр. Менять реквизиты может бухгалтер или администратор.')
    w.unmount()
    as('accountant', ['finance.write'])
    await open()
    expect(w.find('[data-org-readonly]').exists()).toBe(false)
  })

  it('users.write, finance.write и администратор могут менять', async () => {
    for (const [role, perms] of [['sales', ['users.write']], ['accountant', ['finance.write']], ['administrator', []]] as const) {
      as(role, [...perms])
      await open()
      expect(input('companyName').disabled, role).toBe(false)
      w.unmount()
      document.body.innerHTML = ''
    }
  })
})

describe('OrganizationPage: уход со страницы', () => {
  it('с несохранёнными правками — вопрос; «Остаться» не пускает, «Уйти» пускает', async () => {
    await open()
    await type('bank', 'Halyk')
    const go = router.push('/elsewhere')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Уйти без сохранения?')
    confirmState.resolve(false)
    await go
    expect(router.currentRoute.value.path).toBe('/settings/organization')
    const go2 = router.push('/elsewhere')
    await flushPromises()
    confirmState.resolve(true)
    await go2
    expect(router.currentRoute.value.path).toBe('/elsewhere')
  })
  it('без правок — уходит без вопроса', async () => {
    await open()
    await router.push('/elsewhere')
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.path).toBe('/elsewhere')
  })
})

// Адреса для оповещений о сбоях (09.11.2026): второе поле секции «Уведомления», рядом с адресами КЕДЕН.
describe('OrganizationPage: адреса для оповещений о сбоях', () => {
  const boxes = () => w.findAll('[data-org-section="notify"] [data-z-field]')
  const alertBox = () => boxes()[1]

  it('поле после адресов КЕДЕН, с подписью и подсказкой; адреса с сервера — по одному на строку', async () => {
    api.organization.mockResolvedValue(dto({ serviceAlertEmails: 'admin@example.com,ops@example.org' }))
    await open()
    expect(boxes()).toHaveLength(2)
    expect(alertBox().text()).toContain('Адреса для оповещений о сбоях')
    expect(alertBox().text()).toContain('Письмо, если перестанет работать ИИ-подбор ТН ВЭД или разбор документов')
    expect((field('serviceAlertEmails').element as HTMLTextAreaElement).value).toBe('admin@example.com\nops@example.org')
  })

  it('сохраняется тем же «Сохранить», адреса КЕДЕН при этом не отправляются', async () => {
    await open()
    await type('serviceAlertEmails', 'Admin@Example.com; ops@example.org')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · уведомления')
    await saveBtn().trigger('click')
    await flushPromises()
    const [sent] = api.saveOrganization.mock.calls[0]
    expect(sent.serviceAlertEmails).toBe('admin@example.com,ops@example.org')
    expect(sent.kedenStatusEmails).toBeNull()
  })

  it('неверный адрес — ошибка у этого поля, «Сохранить» недоступна', async () => {
    await open()
    await type('serviceAlertEmails', 'admin@example.com, admin-at-example')
    expect(alertBox().text()).toContain('Неверный адрес: admin-at-example')
    expect(boxes()[0].find('[data-z-status="error"]').exists()).toBe(false)
    expect(saveBtn().attributes('disabled')).toBeDefined()
  })

  it('400 сервера с errors.serviceAlertEmails — текст у своего поля, поле КЕДЕН не краснеет', async () => {
    api.saveOrganization.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'Неверный адрес почты: ops@example', errors: { serviceAlertEmails: ['Неверный адрес почты: ops@example'] } } },
    })
    await open()
    await type('kedenStatusEmails', 'duty@example.org')
    await type('serviceAlertEmails', 'ops@example.org')
    await saveBtn().trigger('click')
    await flushPromises()
    expect(alertBox().get('[data-z-status="error"]').text()).toBe('Неверный адрес почты: ops@example')
    expect(boxes()[0].find('[data-z-status="error"]').exists()).toBe(false)
    await type('serviceAlertEmails', 'ops@example.net')
    expect(alertBox().find('[data-z-status="error"]').exists()).toBe(false)
  })
})
