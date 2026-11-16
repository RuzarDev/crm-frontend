import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { PrefillDto } from '@/api/autoTransit'
import { card, httpError } from '../../truck/__tests__/truckFixtures'

const api = vi.hoisted(() => ({ prefill: vi.fn(), createTruck: vi.fn(), uploadFile: vi.fn() }))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/composables/useCountryAlpha2Options', () => ({ useCountryAlpha2Options: () => ref([{ value: 'KZ', label: 'KZ — Казахстан' }]) }))

import NewTruckPage from '../NewTruckPage.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
const App = defineComponent({ render: () => h(RouterView) })
let pinia: Pinia
let router: Router
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const POST_KEY = 'zircon.autoTransit.lastPost.u1'
const NONE: PrefillDto = {
  existingTruckId: null, trailerPlate: null, trailerCountry: null, plateCountry: null, driverName: null, driverDoc: null,
  carrierName: null, carrierCountry: null, carrierRegNumber: null,
}
const MEMORY: PrefillDto = {
  ...NONE, trailerPlate: '02 BCA 19', trailerCountry: 'KZ', plateCountry: 'KZ', driverName: 'Ван Лэй', carrierName: 'Khorgos Trans Ltd', carrierCountry: 'CN',
}
const mountPage = async (perms: string[] = ['autotransit.read', 'autotransit.border']) => {
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.userId = 'u1'
  auth.permissions = perms
  await router.push('/auto-transit/new')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const plateInput = () => w.find<HTMLInputElement>('input[data-new-plate]')
const field = (k: string) => w.find<HTMLInputElement>(`input[data-new-field="${k}"]`)
const typePlate = async (v: string) => {
  await plateInput().setValue(v)
  vi.advanceTimersByTime(400)
  await flushPromises()
}
const pick = async (list: File[]) => {
  const input = w.find<HTMLInputElement>('[data-upload-camera-input]')
  Object.defineProperty(input.element, 'files', { value: list, configurable: true })
  await input.trigger('change')
  await flushPromises()
}
const files = (...names: string[]) => names.map((n) => new File(['x'], n))
const submit = async () => {
  await w.find('[data-new-submit]').trigger('click')
  await flushPromises()
}
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit', name: 'auto-transit', component: { template: '<div/>' } },
      { path: '/auto-transit/new', name: 'auto-transit-new', component: NewTruckPage },
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: { template: '<div/>' } },
    ],
  })
  api.prefill.mockResolvedValue(NONE)
  localStorage.removeItem(POST_KEY)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('NewTruckPage: номер и подстановка', () => {
  it('поле номера в фокусе, с настройками телефонной клавиатуры', async () => {
    await mountPage()
    const el = plateInput().element
    expect(document.activeElement).toBe(el)
    expect(el.getAttribute('autocapitalize')).toBe('characters')
    expect(el.getAttribute('autocomplete')).toBe('off')
    expect(el.getAttribute('autocorrect')).toBe('off')
    expect(el.getAttribute('spellcheck')).toBe('false')
    expect(el.getAttribute('enterkeyhint')).toBe('next')
  })

  it('prefill — через 400 мс после ввода и только от 4 знаков', async () => {
    await mountPage()
    await plateInput().setValue('A3 1')
    vi.advanceTimersByTime(1000)
    await plateInput().setValue('a 318 kz')
    vi.advanceTimersByTime(399)
    expect(api.prefill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(api.prefill).toHaveBeenCalledTimes(1)
    expect(api.prefill).toHaveBeenCalledWith('a 318 kz')
  })

  it('машина в работе: «Открыть» ведёт в карточку, «Завести ещё одну» — force', async () => {
    await mountPage()
    api.prefill.mockResolvedValue({ ...NONE, existingTruckId: 'x1' })
    await typePlate('A 318 KZ 19')
    const warn = w.find('[data-new-duplicate]')
    expect(warn.text()).toContain('Эта машина уже в работе')
    await w.find('[data-new-add-another]').trigger('click')
    expect(w.find('[data-new-duplicate]').exists()).toBe(false)
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    await submit()
    expect(api.createTruck).toHaveBeenCalledWith({ plate: 'A 318 KZ 19', force: true })
  })

  it('«Открыть» — карточка той машины', async () => {
    await mountPage()
    api.prefill.mockResolvedValue({ ...NONE, existingTruckId: 'x1' })
    await typePlate('A 318 KZ 19')
    await w.find('[data-new-open-existing]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/x1')
  })

  it('машина уже была: подсказка, поля заполнены и свёрнуты, их можно исправить', async () => {
    await mountPage()
    expect(w.find('[data-new-details-body]').isVisible()).toBe(true)
    api.prefill.mockResolvedValue(MEMORY)
    await typePlate('A 318 KZ 19')
    expect(text(w.find('[data-new-remembered]').text()))
      .toBe('Машина уже была. Подставили прицеп 02 BCA 19, водителя Ван Лэй, перевозчика Khorgos Trans Ltd.')
    expect(w.find('[data-new-details-body]').isVisible()).toBe(false)
    await w.find('[data-new-details-toggle]').trigger('click')
    expect(w.find('[data-new-details-body]').isVisible()).toBe(true)
    expect(field('trailerPlate').element.value).toBe('02 BCA 19')
    expect(field('driverName').element.value).toBe('Ван Лэй')
    expect(field('carrierName').element.value).toBe('Khorgos Trans Ltd')
    await field('driverName').setValue('Ли Мин')
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    await submit()
    expect(api.createTruck).toHaveBeenCalledWith({
      plate: 'A 318 KZ 19', plateCountry: 'KZ', trailerPlate: '02 BCA 19', trailerCountry: 'KZ', driverName: 'Ли Мин',
      carrierName: 'Khorgos Trans Ltd', carrierCountry: 'CN',
    })
  })

  it('поле, исправленное руками, следующая подстановка не трогает', async () => {
    await mountPage()
    await field('driverName').setValue('Ли Мин')
    api.prefill.mockResolvedValue(MEMORY)
    await typePlate('A 318 KZ 19')
    expect(field('driverName').element.value).toBe('Ли Мин')
    expect(field('trailerPlate').element.value).toBe('02 BCA 19')
  })

  it('устаревший ответ подстановки отбрасывается', async () => {
    await mountPage()
    const slow = deferred<PrefillDto>()
    api.prefill.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ ...NONE, driverName: 'Второй' })
    await typePlate('111 AAA 01')
    await typePlate('222 BBB 02')
    slow.resolve({ ...NONE, driverName: 'Первый', existingTruckId: 'old' })
    await flushPromises()
    expect(field('driverName').element.value).toBe('Второй')
    expect(w.find('[data-new-duplicate]').exists()).toBe(false)
  })

  it('номер стёрли — подставленное убирается, исправленное руками остаётся', async () => {
    await mountPage()
    api.prefill.mockResolvedValue(MEMORY)
    await typePlate('A 318 KZ 19')
    await field('carrierName').setValue('Своя фирма')
    await typePlate('')
    expect(w.find('[data-new-remembered]').exists()).toBe(false)
    expect(field('trailerPlate').element.value).toBe('')
    expect(field('driverName').element.value).toBe('')
    expect(field('carrierName').element.value).toBe('Своя фирма')
  })

  it('ошибка подстановки — молча', async () => {
    await mountPage()
    api.prefill.mockRejectedValue(httpError(500, {}))
    await typePlate('A 318 KZ 19')
    expect(msg.error).not.toHaveBeenCalled()
    expect(w.find('[data-new-remembered]').exists()).toBe(false)
  })

  it('без права «Граница» — короткое «нет прав» со ссылкой к списку', async () => {
    await mountPage(['autotransit.read'])
    expect(w.find('[data-new-no-rights]').exists()).toBe(true)
    expect(w.find('[data-new-form]').exists()).toBe(false)
    expect(w.find('[data-new-no-rights] a').attributes('href')).toBe('/auto-transit')
  })
})

describe('NewTruckPage: создание и файлы', () => {
  it('«Готово» недоступно без номера', async () => {
    await mountPage()
    expect(w.find('[data-new-submit]').attributes('disabled')).toBeDefined()
    await plateInput().setValue('  ')
    expect(w.find('[data-new-submit]').attributes('disabled')).toBeDefined()
    await plateInput().setValue('A 318')
    expect(w.find('[data-new-submit]').attributes('disabled')).toBeUndefined()
  })

  it('файлы выбираются до создания, после него уходят по одному, затем — карточка (replace)', async () => {
    await mountPage()
    await typePlate('a 318 kz 19')
    await pick(files('cmr.jpg', 'inv.jpg'))
    expect(w.findAll('[data-upload-row="queued"]')).toHaveLength(2)
    expect(api.uploadFile).not.toHaveBeenCalled()
    await w.findAll('[data-upload-remove]')[1]!.trigger('click')
    await pick(files('pass.heic'))
    expect(w.findAll('[data-upload-name]').map((x) => x.text())).toEqual(['cmr.jpg', 'pass.heic'])

    const order: string[] = []
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    api.uploadFile.mockImplementation(async (id: string, f: File, opts: unknown) => {
      order.push(`${id}:${f.name}`)
      expect(opts).toEqual({})
      return card({ id: 'n1' })
    })
    const replace = vi.spyOn(router, 'replace')
    await submit()
    expect(api.createTruck).toHaveBeenCalledWith({ plate: 'A 318 KZ 19' })
    expect(order).toEqual(['n1:cmr.jpg', 'n1:pass.heic'])
    expect(replace).toHaveBeenCalledWith({ name: 'auto-transit-truck', params: { id: 'n1' } })
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/n1')
    expect(confirmState.open).toBe(false)
  })

  it('без файлов — карточка сразу после создания', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    await submit()
    expect(api.uploadFile).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/n1')
  })

  it('файл больше лимита и недопустимый тип отклоняются при выборе строкой рядом', async () => {
    await mountPage()
    const big = new File(['x'], 'big.jpg')
    Object.defineProperty(big, 'size', { value: 31 * 1024 * 1024 })
    await pick([big, ...files('notes.txt', 'ok.jpg')])
    const rejected = w.find('[data-new-rejected]').text()
    expect(rejected).toContain('big.jpg: больше 30 МБ, не добавлен')
    expect(rejected).toContain('notes.txt: такой файл не принимается')
    expect(w.findAll('[data-upload-name]').map((x) => x.text())).toEqual(['ok.jpg'])
  })

  it('часть файлов не загрузилась: остаёмся, «Повторить все» не заводит вторую машину', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg', 'b.jpg', 'c.jpg'))
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    api.uploadFile.mockImplementation(async (_id: string, f: File) => {
      if (f.name === 'b.jpg') throw new Error('Network Error')
      return card({ id: 'n1' })
    })
    await submit()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')
    expect(text(w.find('[data-new-partial]').text())).toContain('Машина заведена. Не загрузилось файлов: 1')
    expect(w.find('[data-upload-row="failed"]').text()).toContain('Не загрузился: нет связи или ошибка сервера')
    expect(w.find('[data-new-submit]').exists()).toBe(false)
    expect(plateInput().attributes('disabled')).toBeDefined()

    api.uploadFile.mockResolvedValue(card({ id: 'n1' }))
    await w.find('[data-new-retry-all]').trigger('click')
    await flushPromises()
    expect(api.createTruck).toHaveBeenCalledTimes(1)
    expect(api.uploadFile).toHaveBeenCalledTimes(4)
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/n1')
  })

  it('«Повторить» в строке и «Перейти к машине» с подтверждением', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg', 'b.jpg'))
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    api.uploadFile.mockRejectedValue(httpError(503, {}))
    await submit()
    expect(w.findAll('[data-upload-row="failed"]')).toHaveLength(2)
    api.uploadFile.mockResolvedValueOnce(card({ id: 'n1' }))
    await w.findAll('[data-upload-retry]')[0]!.trigger('click')
    await flushPromises()
    expect(w.findAll('[data-upload-row="failed"]')).toHaveLength(1)
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')

    await w.find('[data-new-go-truck]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Перейти без этих файлов?')
    confirmState.resolve(true)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/n1')
  })

  it('убрали последний упавший файл — сразу в карточку', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg', 'b.jpg'))
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    api.uploadFile.mockResolvedValueOnce(card({ id: 'n1' })).mockRejectedValueOnce(new Error('Network Error'))
    await submit()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')
    await w.find('[data-upload-row="failed"] [data-upload-remove]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/n1')
  })

  it('409 duplicate_plate при создании — блок «уже в работе» с машиной из ответа', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    api.createTruck.mockRejectedValue(httpError(409, { code: 'duplicate_plate', existingTruckId: 'x7' }))
    await submit()
    expect(w.find('[data-new-duplicate]').exists()).toBe(true)
    await w.find('[data-new-open-existing]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/x7')
  })

  it('400 — ошибки под полями, свёрнутые данные раскрываются', async () => {
    await mountPage()
    api.prefill.mockResolvedValue(MEMORY)
    await typePlate('A 318 KZ 19')
    expect(w.find('[data-new-details-body]').isVisible()).toBe(false)
    api.createTruck.mockRejectedValue(httpError(400, { errors: { Plate: ['Слишком длинный номер'], DriverName: ['Не больше 300 знаков'] } }))
    await submit()
    expect(w.text()).toContain('Слишком длинный номер')
    expect(w.text()).toContain('Не больше 300 знаков')
    expect(w.find('[data-new-details-body]').isVisible()).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')
  })

  it('пост по умолчанию — последний выбранный, сохраняется после создания', async () => {
    localStorage.setItem(POST_KEY, '50509')
    await mountPage()
    expect(field('customsPostCode').element.value).toBe('50509')
    await field('customsPostCode').setValue('50510')
    await typePlate('A 318 KZ 19')
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    await submit()
    expect(api.createTruck).toHaveBeenCalledWith({ plate: 'A 318 KZ 19', customsPostCode: '50510' })
    expect(localStorage.getItem(POST_KEY)).toBe('50510')
  })
})

describe('NewTruckPage: потерянный ответ при создании', () => {
  it('сеть пропала → строка у кнопки; второй «Готово» → 409 → «Загрузить фото в эту машину» грузит в неё без force', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg', 'b.jpg'))
    api.createTruck.mockRejectedValueOnce(new Error('Network Error'))
    await submit()
    expect(w.find('[data-new-net-error]').text())
      .toBe('Не удалось связаться с сервером. Машина могла уже создаться — нажмите «Готово» ещё раз, мы проверим.')
    expect(w.findAll('[data-upload-row="queued"]')).toHaveLength(2)
    expect(plateInput().element.value).toBe('A 318 KZ 19')
    expect(w.find('[data-new-submit]').attributes('disabled')).toBeUndefined()

    api.createTruck.mockRejectedValueOnce(httpError(409, { code: 'duplicate_plate', existingTruckId: 't9' }))
    await submit()
    expect(w.find('[data-new-net-error]').exists()).toBe(false)
    const bind = w.find('[data-new-bind-existing]')
    expect(bind.text()).toBe('Загрузить фото в эту машину')
    expect(bind.classes().join(' ')).toContain('bg-navy')
    expect(w.find('[data-new-open-existing]').classes().join(' ')).not.toContain('bg-navy')

    api.uploadFile.mockResolvedValue(card({ id: 't9' }))
    await bind.trigger('click')
    await flushPromises()
    expect(api.uploadFile.mock.calls.map((c) => [c[0], (c[1] as File).name])).toEqual([['t9', 'a.jpg'], ['t9', 'b.jpg']])
    expect(api.createTruck).toHaveBeenCalledTimes(2)
    expect(api.createTruck.mock.calls.every((c) => !c[0].force)).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/t9')
    expect(confirmState.open).toBe(false)
  })

  it('дубль из подстановки при выбранных файлах: главное — «Загрузить фото в эту машину»; уход — «файлы пропадут»', async () => {
    await mountPage()
    api.prefill.mockResolvedValue({ ...NONE, existingTruckId: 'x1' })
    await typePlate('A 318 KZ 19')
    expect(w.find('[data-new-bind-existing]').exists()).toBe(false)
    expect(w.find('[data-new-open-existing]').classes().join(' ')).toContain('bg-navy')
    await pick(files('a.jpg'))
    expect(w.find('[data-new-bind-existing]').exists()).toBe(true)

    const nav = router.push('/auto-transit')
    await flushPromises()
    expect(confirmState.content).toBe('Выбранные файлы не загружены и пропадут.')
    confirmState.resolve(false)
    await nav

    api.uploadFile.mockRejectedValueOnce(new Error('Network Error'))
    await w.find('[data-new-bind-existing]').trigger('click')
    await flushPromises()
    expect(api.createTruck).not.toHaveBeenCalled()
    expect(api.uploadFile.mock.calls[0]![0]).toBe('x1')
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')
    expect(text(w.find('[data-new-partial]').text())).toContain('Не загрузилось файлов: 1')
    expect(plateInput().attributes('disabled')).toBeDefined()
  })

  it('пока идёт создание, поля выключены', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    let done!: (v: unknown) => void
    api.createTruck.mockReturnValue(new Promise((res) => { done = res }))
    await w.find('[data-new-submit]').trigger('click')
    await flushPromises()
    expect(plateInput().attributes('disabled')).toBeDefined()
    expect(field('driverName').attributes('disabled')).toBeDefined()
    done(card({ id: 'n1' }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/n1')
  })
})

describe('NewTruckPage: уход со страницы', () => {
  it('выбраны файлы, машина не заведена — уход спрашивает подтверждение; beforeunload тоже', async () => {
    await mountPage()
    await pick(files('a.jpg'))
    const ev = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)

    const nav = router.push('/auto-transit')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.content).toBe('Машина ещё не заведена: номер и выбранные файлы пропадут.')
    confirmState.resolve(false)
    await nav
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')
  })

  it('машина заведена, часть файлов упала — «Назад» тоже спрашивает', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg'))
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    api.uploadFile.mockRejectedValue(new Error('Network Error'))
    await submit()
    const ev = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    const nav = router.push('/auto-transit')
    await flushPromises()
    expect(confirmState.content).toBe('Не загрузилось файлов: 1. Если уйти, их не будет в машине.')
    confirmState.resolve(false)
    await nav
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/new')
  })

  it('без файлов уходим без вопросов; слушатель beforeunload снимается при уходе', async () => {
    await mountPage()
    const remove = vi.spyOn(window, 'removeEventListener')
    await router.push('/auto-transit')
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit')
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(w.find('[data-new-truck]').exists()).toBe(false)
  })

  it('уход во время загрузки — подтверждение; после размонтирования загрузка не продолжается', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg', 'b.jpg'))
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    const first = deferred<ReturnType<typeof card>>()
    api.uploadFile.mockReturnValueOnce(first.promise).mockResolvedValue(card({ id: 'n1' }))
    await submit()
    const nav = router.push('/auto-transit')
    await flushPromises()
    expect(confirmState.content).toBe('Файлы ещё загружаются. Если уйти, оставшиеся не загрузятся.')
    confirmState.resolve(true)
    await nav
    expect(w.find('[data-new-truck]').exists()).toBe(false)
    first.resolve(card({ id: 'n1' }))
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit')
  })
})

describe('NewTruckPage: «Завести ещё одну» и обрыв связи', () => {
  it('«Завести ещё одну» → сеть пропала → повторный «Готово» уходит без force (409, а не вторая машина)', async () => {
    await mountPage()
    api.prefill.mockResolvedValue({ ...NONE, existingTruckId: 'x1' })
    await typePlate('A 318 KZ 19')
    await w.find('[data-new-add-another]').trigger('click')
    api.createTruck.mockRejectedValueOnce(new Error('Network Error'))
    await submit()
    expect(api.createTruck.mock.calls[0]![0].force).toBe(true)
    expect(w.find('[data-new-net-error]').exists()).toBe(true)
    api.createTruck.mockRejectedValueOnce(httpError(409, { code: 'duplicate_plate', existingTruckId: 'x2' }))
    await submit()
    expect(api.createTruck).toHaveBeenCalledTimes(2)
    expect(api.createTruck.mock.calls[1]![0].force).toBeUndefined()
    expect(w.find('[data-new-duplicate]').exists()).toBe(true)
  })
})

describe('NewTruckPage: порядок экрана', () => {
  it('фото сразу под номером и подсказками, данные машины — ниже, поля в порядке прицеп, водитель, перевозчик…', async () => {
    await mountPage()
    const form = w.find('[data-new-form]').element
    const photos = form.querySelector('[data-new-photos]')!
    const details = form.querySelector('[data-new-details]')!
    expect(photos.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const labels = Array.from(form.querySelectorAll('[data-new-details-body] label')).map((l) => l.textContent?.replace(/\s+/g, ' ').trim())
    expect(labels.map((l) => l?.replace(/\*$/, '').trim())).toEqual([
      'Госномер прицепа', 'Водитель', 'Перевозчик', 'Страна прицепа', 'Документ водителя', 'Страна перевозчика',
      'БИН / рег. номер перевозчика', 'Страна тягача', 'Код поста',
    ])
  })

  it('телефон: «Данные машины» свёрнуты сразу; открываются по нажатию и сами при 400 по их полю', async () => {
    const mm = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const prev = window.matchMedia
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: mm })
    try {
      await mountPage()
      expect(w.find('[data-new-details-body]').isVisible()).toBe(false)
      await typePlate('A 318 KZ 19') // подстановка без памяти на телефоне не раскрывает
      expect(w.find('[data-new-details-body]').isVisible()).toBe(false)
      await w.find('[data-new-details-toggle]').trigger('click')
      expect(w.find('[data-new-details-body]').isVisible()).toBe(true)
      await w.find('[data-new-details-toggle]').trigger('click')
      api.createTruck.mockRejectedValue(httpError(400, { errors: { DriverName: ['Не больше 300 знаков'] } }))
      await submit()
      expect(w.find('[data-new-details-body]').isVisible()).toBe(true)
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: prev })
    }
  })
})

describe('NewTruckPage: привязка к машине, в которую грузить нельзя', () => {
  it('все упавшие не повторить (машина в архиве) — без «нажмите Повторить»', async () => {
    await mountPage()
    api.prefill.mockResolvedValue({ ...NONE, existingTruckId: 'x1' })
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg'))
    api.uploadFile.mockRejectedValueOnce(httpError(409, { code: 'archived' }))
    await w.find('[data-new-bind-existing]').trigger('click')
    await flushPromises()
    expect(w.find('[data-new-partial]').exists()).toBe(true)
    expect(w.find('[data-new-partial]').text()).not.toContain('Повторить')
    expect(w.find('[data-new-retry-all]').exists()).toBe(false)
  })

  it('повторить можно — подсказка есть', async () => {
    await mountPage()
    await typePlate('A 318 KZ 19')
    await pick(files('a.jpg'))
    api.createTruck.mockResolvedValue(card({ id: 'n1' }))
    api.uploadFile.mockRejectedValue(new Error('Network Error'))
    await submit()
    expect(w.find('[data-new-partial]').text()).toContain('нажмите «Повторить»')
  })
})
