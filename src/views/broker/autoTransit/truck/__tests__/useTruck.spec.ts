import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { card, file, httpError } from './truckFixtures'

const api = vi.hoisted(() => ({
  getTruck: vi.fn(), markStage: vi.fn(), undoStage: vi.fn(), updateParty: vi.fn(), uploadFile: vi.fn(), setTd: vi.fn(), patchFile: vi.fn(),
}))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

import { fieldErrorsOf, useTruck, type TruckState } from '../useTruck'

let w: VueWrapper
let s: TruckState
const id = ref('t1')
const paused = ref(false)
let hidden = false
const mountHost = async () => {
  const Host = defineComponent({
    setup() {
      s = useTruck(() => id.value, { paused: () => paused.value })
      return () => null
    },
  })
  w = mountWithI18n(Host)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  hidden = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  id.value = 't1'
  paused.value = false
  api.getTruck.mockResolvedValue(card())
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useTruck: загрузка и правки', () => {
  it('загружает карточку; правка заменяет card ответом сервера', async () => {
    await mountHost()
    expect(api.getTruck).toHaveBeenCalledWith('t1')
    expect(s.card.value?.currentStage).toBe(3)
    api.markStage.mockResolvedValue(card({ currentStage: 4 }))
    const res = await s.mark(3)
    expect(api.markStage).toHaveBeenCalledWith('t1', 3, undefined)
    expect(res.ok).toBe(true)
    expect(s.card.value?.currentStage).toBe(4)
  })

  it('409 stage_order — тост с текстом кода и перечитывание карточки', async () => {
    await mountHost()
    api.markStage.mockRejectedValue(httpError(409, { code: 'stage_order' }))
    api.getTruck.mockResolvedValue(card({ currentStage: 5 }))
    const res = await s.mark(3)
    await flushPromises()
    expect(res).toMatchObject({ ok: false, status: 409, code: 'stage_order' })
    expect(msg.error).toHaveBeenCalledWith('Этапы отмечаются по порядку.')
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    expect(s.card.value?.currentStage).toBe(5)
  })

  it('409 conflict — текст просит повторить; неизвестный код — общий текст', async () => {
    await mountHost()
    api.undoStage.mockRejectedValueOnce(httpError(409, { code: 'conflict' })).mockRejectedValueOnce(httpError(409, { code: 'zzz' }))
    await s.undo()
    expect(msg.error).toHaveBeenLastCalledWith('Машину только что изменил другой сотрудник. Карточка обновлена — повторите действие.')
    await s.undo()
    expect(msg.error).toHaveBeenLastCalledWith('Действие не выполнено. Обновите карточку и попробуйте ещё раз.')
  })

  it('400 — первая строка каждого поля уходит форме, без тоста; без полей — тост', async () => {
    await mountHost()
    api.updateParty.mockRejectedValueOnce(httpError(400, { errors: { RecipientEmail: ['Проверьте адрес почты.', 'ещё'], currency: ['Трёхбуквенный код'] } }))
    const res = await s.updateParty('p1', { recipientEmail: 'x' })
    expect(res).toEqual({ ok: false, status: 400, fieldErrors: { recipientEmail: 'Проверьте адрес почты.', currency: 'Трёхбуквенный код' } })
    expect(msg.error).not.toHaveBeenCalled()
    api.setTd.mockRejectedValueOnce(httpError(400, { error: 'Номер ТД слишком длинный' }))
    await s.setTd('p1', { tdNumber: 'x', tdDate: null })
    expect(msg.error).toHaveBeenCalledWith('Номер ТД слишком длинный')
    expect(fieldErrorsOf(new Error('x'))).toEqual({})
  })

  it('404 — «не найдена»; другая ошибка первой загрузки — loadError', async () => {
    api.getTruck.mockRejectedValueOnce(httpError(404, {}))
    await mountHost()
    expect(s.notFound.value).toBe(true)
    w.unmount()
    api.getTruck.mockRejectedValueOnce(httpError(500, {}))
    await mountHost()
    expect(s.loadError.value).toBe(true)
    expect(s.notFound.value).toBe(false)
  })

  it('смена id — карточка другой машины', async () => {
    await mountHost()
    api.getTruck.mockResolvedValue(card({ id: 't2', plate: '787 ABD 05' }))
    id.value = 't2'
    await flushPromises()
    expect(api.getTruck).toHaveBeenLastCalledWith('t2')
    expect(s.card.value?.plate).toBe('787 ABD 05')
  })
})

describe('useTruck: загрузка файлов', () => {
  it('по одному файлу за запрос, по очереди; ход загрузки; ошибка одного не останавливает остальные', async () => {
    await mountHost()
    const order: string[] = []
    api.uploadFile.mockImplementation(async (_id: string, f: File, _o: unknown, onProgress?: (x: number) => void) => {
      order.push(f.name)
      onProgress?.(0.5)
      expect(s.uploading.value).toMatchObject({ name: f.name, fraction: 0.5, total: 3 })
      if (f.name === 'b.jpg') throw httpError(500, {})
      return card({ files: [] })
    })
    const files = ['a.jpg', 'b.jpg', 'c.pdf'].map((n) => new File(['x'], n))
    const res = await s.upload(files, { partyId: 'p1' })
    expect(order).toEqual(['a.jpg', 'b.jpg', 'c.pdf'])
    expect(api.uploadFile.mock.calls[0]![2]).toEqual({ partyId: 'p1' })
    expect(res).toEqual({ done: 2, failed: ['b.jpg'] })
    expect(s.uploading.value).toBeNull()
    // Загружены прямо в партию без вида («прочее») — один тост партии: получателю не видны.
    expect(msg.success).toHaveBeenCalledWith('Загружено файлов в партию 1: 2. Получателю не видны')
  })

  it('без партии — «Загружено файлов: N»; в партию с видом для получателя — «Видны получателю партии N»', async () => {
    await mountHost()
    api.uploadFile.mockResolvedValue(card())
    await s.upload([new File(['x'], 'a.jpg')])
    expect(msg.success).toHaveBeenLastCalledWith('Загружено файлов: 1')
    await s.upload([new File(['x'], 'b.jpg'), new File(['x'], 'c.jpg')], { partyId: 'p1', kind: 'packingList' })
    expect(api.uploadFile.mock.calls.at(-1)![2]).toEqual({ partyId: 'p1', kind: 'packingList' })
    expect(msg.success).toHaveBeenLastCalledWith('Загружено файлов: 2. Видны получателю партии 1')
    expect(msg.success).toHaveBeenCalledTimes(2)
  })

  it('чип «нет инвойса с печатью»: после загрузки новый инвойс отмечается «с печатью»', async () => {
    await mountHost()
    api.uploadFile.mockResolvedValue(card({ files: [file('f1', { kind: 'driverPassport' }), file('n1', { kind: 'invoice', partyId: 'p1' })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'driverPassport' }), file('n1', { kind: 'invoice', partyId: 'p1', stamped: true })] }))
    await s.upload([new File(['x'], 'inv.jpg')], { partyId: 'p1', kind: 'invoice' }, { stamped: true })
    await flushPromises()
    expect(api.uploadFile.mock.calls[0]![2]).toEqual({ partyId: 'p1', kind: 'invoice' })
    expect(api.patchFile).toHaveBeenCalledTimes(1)
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'n1', { stamped: true })
  })

  it('файл больше лимита пропускается с тостом', async () => {
    await mountHost()
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 31 * 1024 * 1024 })
    const res = await s.upload([big])
    expect(api.uploadFile).not.toHaveBeenCalled()
    expect(res).toEqual({ done: 0, failed: [] })
    expect(msg.error).toHaveBeenCalledWith('Файл big.pdf больше 30 МБ')
  })
})

describe('useTruck: фоновое перечитывание', () => {
  it('раз в 60 с без тоста; не при паузе (окно), не во время правки; скрытая вкладка — стоит', async () => {
    await mountHost()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    expect(api.getTruck).toHaveBeenLastCalledWith('t1', { silent: true })
    paused.value = true
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    paused.value = false
    let release!: (v: unknown) => void
    api.markStage.mockReturnValue(new Promise((r) => { release = r }))
    const pending = s.mark(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    release(card({ currentStage: 4 }))
    await pending
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(180_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(api.getTruck).toHaveBeenCalledTimes(3)
  })

  it('сбой фонового перечитывания — reloadError, карточка остаётся; после ухода таймер снят', async () => {
    await mountHost()
    api.getTruck.mockRejectedValueOnce(httpError(500, {}))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(s.reloadError.value).toBe(true)
    expect(s.card.value).not.toBeNull()
    w.unmount()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
  })

  it('ответ перечитывания, начатого до правки, не перезаписывает свежую карточку', async () => {
    await mountHost()
    let late!: (v: unknown) => void
    api.getTruck.mockReturnValueOnce(new Promise((r) => { late = r }))
    const reloading = s.reload()
    api.markStage.mockResolvedValue(card({ currentStage: 4 }))
    await s.mark(3)
    late(card({ currentStage: 3 }))
    await reloading
    expect(s.card.value?.currentStage).toBe(4)
  })
})
