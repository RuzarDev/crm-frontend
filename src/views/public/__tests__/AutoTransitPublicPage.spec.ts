import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { PublicTruckView } from '@/api/autoTransit'

const api = vi.hoisted(() => ({ publicGet: vi.fn(), publicImportInterest: vi.fn() }))
vi.mock('@/api/autoTransit', async (orig) => ({ ...(await orig<typeof import('@/api/autoTransit')>()), ...api }))
const setLocale = vi.hoisted(() => vi.fn())
vi.mock('@/i18n', async (orig) => ({ ...(await orig<typeof import('@/i18n')>()), setLocale }))

import AutoTransitPublicPage from '../AutoTransitPublicPage.vue'

const NOW = new Date('2026-11-16T12:00:00Z')
const VIEW: PublicTruckView = {
  plate: '787 ABD 05', currentStage: 3, released: false, updatedAtUtc: '2026-11-16T11:57:00Z',
  recipientName: 'ИП «Сейткали»', invoiceNumber: 'KT-2611-08', tdNumber: '',
  files: [
    { id: 'f1', fileName: 'Инвойс с печатью.pdf', kind: 'invoice' },
    { id: 'f2', fileName: 'scan 7.jpg', kind: 'cmr' },
    { id: 'f3', fileName: 'Прочее.pdf', kind: 'other' },
  ],
}
const httpError = (status: number, data: unknown = '') => Object.assign(new Error('http'), { response: { status, data }, isAxiosError: true })

let w: VueWrapper
const mount = async (token = 'tok-secret') => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/t/:token', component: AutoTransitPublicPage }] })
  await router.push(`/t/${token}`)
  w = mountWithI18n(AutoTransitPublicPage, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const text = () => w.text()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  localStorage.clear()
  api.publicGet.mockResolvedValue(VIEW)
  api.publicImportInterest.mockResolvedValue(undefined)
})
afterEach(() => {
  w?.unmount()
  vi.useRealTimers()
  vi.clearAllMocks()
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove())
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('AutoTransitPublicPage — данные', () => {
  it('заголовок этапа, строка получателя, полоса и подпись «обновлено»', async () => {
    await mount()
    expect(api.publicGet).toHaveBeenCalledWith('tok-secret')
    expect(w.get('h1').text()).toBe('Идёт транспортный контроль')
    expect(text()).toContain('ИП «Сейткали» · инвойс KT-2611-08')
    const steps = w.findAll('[data-step]').map((s) => s.attributes('data-step'))
    expect(steps).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo', 'todo'])
    expect(text()).toContain('Этап 3 из 7 · обновлено 3 мин назад')
  })

  it('пустые части строки получателя опускаются', async () => {
    api.publicGet.mockResolvedValue({ ...VIEW, recipientName: '', invoiceNumber: 'KT-1' })
    await mount()
    expect(text()).toContain('инвойс KT-1')
    expect(text()).not.toContain(' · инвойс')
    w.unmount()
    api.publicGet.mockResolvedValue({ ...VIEW, recipientName: 'ИП А', invoiceNumber: '' })
    await mount()
    expect(w.get('[data-recipient-line]').text()).toBe('ИП А')
  })

  it('выпущенный груз: «Груз выпущен», все деления пройдены, строка с номером ТД', async () => {
    api.publicGet.mockResolvedValue({ ...VIEW, released: true, currentStage: null, tdNumber: '10001/161126/0001234' })
    await mount()
    expect(w.get('h1').text()).toBe('Груз выпущен')
    expect(w.findAll('[data-step]').every((s) => s.attributes('data-step') === 'done')).toBe(true)
    expect(text()).toContain('Транзитная декларация № 10001/161126/0001234')
    expect(text()).toContain('Все этапы пройдены')
  })

  it('заголовок на каждом этапе 1–7', async () => {
    const want = ['Машина прибыла на границу, принимаем документы', 'Оформляем документы на границе', 'Идёт транспортный контроль', 'Идёт таможенный осмотр', 'Готовим транзитную декларацию', 'Декларация подана, ждём регистрации', 'Оформляем на складе временного хранения']
    for (let i = 1; i <= 7; i++) {
      api.publicGet.mockResolvedValue({ ...VIEW, currentStage: i })
      await mount()
      expect(w.get('h1').text()).toBe(want[i - 1])
      w.unmount()
    }
  })

  it('документы: подписи по виду, ссылки на скачивание, «Скачать всё», строки «появится после этапа»', async () => {
    await mount()
    const rows = w.findAll('[data-doc-row]')
    expect(rows[0].text()).toContain('Инвойс')
    expect(rows[0].text()).toContain('Инвойс с печатью.pdf')
    expect(rows[1].text()).toContain('CMR')
    // «other» — просто имя файла, без дубля
    expect(rows[2].text().match(/Прочее\.pdf/g)).toHaveLength(1)
    const links = w.findAll('[data-doc-row] a')
    expect(links.map((a) => a.attributes('href'))).toEqual([
      '/api/public/auto-transit/tok-secret/files/f1',
      '/api/public/auto-transit/tok-secret/files/f2',
      '/api/public/auto-transit/tok-secret/files/f3',
    ])
    expect(links[0].attributes('rel')).toContain('noopener')
    expect(links[0].attributes('download')).toBeDefined()
    const all = w.get('[data-download-all]')
    expect(all.attributes('href')).toBe('/api/public/auto-transit/tok-secret/all.zip')
    expect(w.get('[data-doc-later="td"]').text()).toContain('Транзитная декларация — появится после этапа 6')
    expect(w.get('[data-doc-later="warehouseReceipt"]').text()).toContain('Чек СВХ — появится после этапа 7')
  })

  it('когда ТД и чек уже есть — строк «после этапа» нет', async () => {
    api.publicGet.mockResolvedValue({ ...VIEW, files: [{ id: 'a', fileName: 'td.pdf', kind: 'td' }, { id: 'b', fileName: 'r.pdf', kind: 'warehouseReceipt' }] })
    await mount()
    expect(w.find('[data-doc-later]').exists()).toBe(false)
    const labels = w.findAll('[data-doc-row]').map((r) => r.text())
    expect(labels[0]).toContain('Транзитная декларация')
    expect(labels[1]).toContain('Чек СВХ')
  })

  it('без файлов: спокойный текст, без «Скачать всё»', async () => {
    api.publicGet.mockResolvedValue({ ...VIEW, files: [] })
    await mount()
    expect(text()).toContain('Документы появятся здесь, как только брокер их загрузит')
    expect(w.find('[data-download-all]').exists()).toBe(false)
  })

  it('токен нигде, кроме адресов API, не отображается; заголовок вкладки без номера', async () => {
    await mount()
    expect(w.html().replace(/\/api\/public\/auto-transit\/tok-secret/g, '')).not.toContain('tok-secret')
    expect(document.title).toBe('Ваш груз — Zircon')
    expect(document.title).not.toContain('787')
    expect(w.html()).not.toContain('787 ABD 05')
  })

  it('noindex ставится и убирается', async () => {
    await mount()
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    w.unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('имена файлов выводятся текстом, не разметкой', async () => {
    api.publicGet.mockResolvedValue({ ...VIEW, files: [{ id: 'x', fileName: '<img src=x onerror=alert(1)>.pdf', kind: 'other' }] })
    await mount()
    expect(w.find('[data-doc-row] img').exists()).toBe(false)
    expect(w.get('[data-doc-row]').text()).toContain('<img src=x')
  })
})

describe('AutoTransitPublicPage — состояния', () => {
  it('404: только нейтральное сообщение, никаких данных', async () => {
    api.publicGet.mockRejectedValue(httpError(404))
    await mount()
    expect(text()).toContain('Ссылка недействительна или срок её действия истёк. Запросите новую у вашего брокера.')
    expect(w.find('h1').exists()).toBe(true)
    expect(w.find('[data-step]').exists()).toBe(false)
    expect(w.find('[data-import]').exists()).toBe(false)
    expect(w.find('button').exists() && w.findAll('button').some((b) => b.text() === 'Повторить')).toBe(false)
  })

  it('429: сообщение и «Повторить»', async () => {
    api.publicGet.mockRejectedValueOnce(httpError(429))
    await mount()
    expect(text()).toContain('Слишком много запросов. Попробуйте через минуту.')
    api.publicGet.mockResolvedValue(VIEW)
    await w.findAll('button').find((b) => b.text() === 'Повторить')!.trigger('click')
    await flushPromises()
    expect(w.get('h1').text()).toBe('Идёт транспортный контроль')
  })

  it('сеть и 5xx: «Не удалось загрузить» и «Повторить»', async () => {
    api.publicGet.mockRejectedValueOnce(new Error('Network Error'))
    await mount()
    expect(text()).toContain('Не удалось загрузить. Проверьте связь.')
    w.unmount()
    api.publicGet.mockRejectedValueOnce(httpError(503))
    await mount()
    expect(text()).toContain('Не удалось загрузить. Проверьте связь.')
  })

  it('скелетон, пока идёт первая загрузка', async () => {
    api.publicGet.mockReturnValue(new Promise(() => {}))
    await mount()
    expect(w.find('[role="status"]').exists()).toBe(true)
    expect(w.find('h1').exists()).toBe(false)
  })
})

describe('AutoTransitPublicPage — обновление раз в 60 с', () => {
  it('перечитывает, пока вкладка видна; заменяет данные', async () => {
    await mount()
    api.publicGet.mockResolvedValue({ ...VIEW, currentStage: 4 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.publicGet).toHaveBeenCalledTimes(2)
    expect(w.get('h1').text()).toBe('Идёт таможенный осмотр')
  })

  it('сбой фонового обновления — старые данные остаются, ничего не показывается', async () => {
    await mount()
    api.publicGet.mockRejectedValue(new Error('Network Error'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(w.get('h1').text()).toBe('Идёт транспортный контроль')
    expect(text()).not.toContain('Не удалось загрузить')
  })

  it('отозванная ссылка при обновлении (404) — экран «недействительна»', async () => {
    await mount()
    api.publicGet.mockRejectedValue(httpError(404))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(text()).toContain('Ссылка недействительна')
    expect(w.find('[data-step]').exists()).toBe(false)
  })

  it('скрытая вкладка — не опрашивает; после unmount таймеры сняты', async () => {
    await mount()
    let vis = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(180_000)
    expect(api.publicGet).toHaveBeenCalledTimes(1)
    vis = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(api.publicGet).toHaveBeenCalledTimes(2)
    w.unmount()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(api.publicGet).toHaveBeenCalledTimes(2)
  })

  it('подпись «N мин назад» идёт вперёд без запроса', async () => {
    api.publicGet.mockResolvedValue(VIEW)
    await mount()
    expect(text()).toContain('обновлено 3 мин назад')
    api.publicGet.mockReturnValue(new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(30_000)
    // за минуту подпись сдвинулась на 1 мин (данные не менялись)
    expect(text()).toMatch(/обновлено 4 мин назад/)
  })
})

describe('AutoTransitPublicPage — «Оформить импорт»', () => {
  const field = () => w.get('[data-import] input')
  const submit = () => w.get('[data-import] button[type="submit"]')

  it('кнопка выключена, пока контакт короче 5 знаков (после trim)', async () => {
    await mount()
    expect(submit().attributes('disabled')).toBeDefined()
    await field().setValue('  12  ')
    expect(submit().attributes('disabled')).toBeDefined()
    await field().setValue('  +7 701  ')
    expect(submit().attributes('disabled')).toBeUndefined()
    expect(field().attributes('maxlength')).toBe('100')
  })

  it('успех: вызов с токеном и контактом, «Мы свяжемся», форма пропала, запомнено на перезагрузку', async () => {
    await mount()
    await field().setValue('+7 701 000 00 00')
    await w.get('[data-import] form').trigger('submit')
    await flushPromises()
    expect(api.publicImportInterest).toHaveBeenCalledWith('tok-secret', '+7 701 000 00 00')
    expect(text()).toContain('Спасибо! Мы свяжемся с вами')
    expect(w.find('[data-import] input').exists()).toBe(false)
    w.unmount()
    await mount()
    expect(text()).toContain('Спасибо! Мы свяжемся с вами')
    expect(w.find('[data-import] input').exists()).toBe(false)
    // для другой ссылки — не запоминается
    w.unmount()
    await mount('other-token')
    expect(w.find('[data-import] input').exists()).toBe(true)
  })

  it('двойная отправка не уходит дважды', async () => {
    let done!: () => void
    api.publicImportInterest.mockReturnValue(new Promise<void>((r) => { done = r }))
    await mount()
    await field().setValue('user@example.com')
    await w.get('[data-import] form').trigger('submit')
    await w.get('[data-import] form').trigger('submit')
    expect(api.publicImportInterest).toHaveBeenCalledTimes(1)
    done()
    await flushPromises()
  })

  it('400: первая ошибка сервера под полем, форма остаётся', async () => {
    api.publicImportInterest.mockRejectedValue(httpError(400, { errors: { contact: ['Недопустимые символы'] } }))
    await mount()
    await field().setValue('user@example.com')
    await w.get('[data-import] form').trigger('submit')
    await flushPromises()
    expect(w.get('[data-import-error]').text()).toBe('Недопустимые символы')
    expect(w.find('[data-import] input').exists()).toBe(true)
    expect(text()).not.toContain('Мы свяжемся')
  })

  it('429 — «Слишком много запросов», а не «Не удалось загрузить»', async () => {
    api.publicImportInterest.mockRejectedValue(httpError(429))
    await mount()
    await field().setValue('user@example.com')
    await w.get('[data-import] form').trigger('submit')
    await flushPromises()
    expect(w.get('[data-import-error]').text()).toBe('Слишком много запросов. Попробуйте через минуту.')
  })

  it('400 без текста — запасное «Укажите телефон или почту»', async () => {
    api.publicImportInterest.mockRejectedValue(httpError(400, {}))
    await mount()
    await field().setValue('user@example.com')
    await w.get('[data-import] form').trigger('submit')
    await flushPromises()
    expect(w.get('[data-import-error]').text()).toBe('Укажите телефон или почту')
  })

  it('прочий сбой отправки — понятная ошибка, повторить можно', async () => {
    api.publicImportInterest.mockRejectedValueOnce(new Error('Network Error'))
    await mount()
    await field().setValue('user@example.com')
    await w.get('[data-import] form').trigger('submit')
    await flushPromises()
    expect(w.get('[data-import-error]').text()).toBe('Не удалось загрузить. Проверьте связь.')
    await w.get('[data-import] form').trigger('submit')
    await flushPromises()
    expect(text()).toContain('Мы свяжемся')
  })
})

describe('AutoTransitPublicPage — язык', () => {
  it('без сохранённого выбора берёт язык браузера', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['kk-KZ'])
    await mount()
    expect(setLocale).toHaveBeenCalledWith('kk')
  })
  it('с сохранённым выбором язык не меняет; переключатель KK/RU/EN есть', async () => {
    localStorage.setItem('appLocale', 'ru')
    await mount()
    expect(setLocale).not.toHaveBeenCalled()
    expect(w.findAll('[role="group"] button').map((b) => b.text())).toEqual(['RU', 'KZ', 'EN'])
  })
})
