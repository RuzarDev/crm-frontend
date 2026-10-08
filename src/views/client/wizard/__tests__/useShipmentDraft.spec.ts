import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { Import40CaseDto, Import40ContainerDto } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import { caseDto } from '@/views/client/__tests__/caseFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), create: vi.fn(), update: vi.fn(),
  addContainer: vi.fn(), updateContainer: vi.fn(), deleteContainer: vi.fn(),
}))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: msg }))

import { AUTOSAVE_DELAY_MS, useShipmentDraft } from '../useShipmentDraft'

const container = (id: string, containerNumber: string, containerType = ''): Import40ContainerDto =>
  ({ id, containerNumber, containerType, notes: '' })

// «Сервер»: контейнеры живут здесь, ответы на запросы — вся заявка, как у настоящего API.
let server: Import40CaseDto
let seq = 0

const setup = () => {
  const scope = effectScope()
  const d = scope.run(() => useShipmentDraft())!
  return { d, scope }
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.userId = 'u1'
  auth.username = 'romashka'
  seq = 0
  server = caseDto({ id: 'c1', number: 'ИМ-2026-0184', status: 0, containers: [] })
  refs.listCountries.mockResolvedValue([{ id: 'r1', code: '398', name: 'Казахстан', alpha2: 'KZ', isActive: true }])
  api.get.mockImplementation(async () => server)
  api.create.mockImplementation(async () => {
    await Promise.resolve()
    return server
  })
  api.update.mockImplementation(async () => server)
  api.addContainer.mockImplementation(async (_id: string, body: { containerNumber: string; containerType?: string }) => {
    server = { ...server, containers: [...server.containers, container(`n${++seq}`, body.containerNumber, body.containerType)] }
    return server
  })
  api.updateContainer.mockImplementation(async () => server)
  api.deleteContainer.mockImplementation(async (_id: string, cid: string) => {
    server = { ...server, containers: server.containers.filter((c) => c.id !== cid) }
    return server
  })
})
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useShipmentDraft', () => {
  it('ensureCreated: два параллельных вызова — один POST, один id', async () => {
    const { d, scope } = setup()
    d.draft.cargo = 'Ноутбуки Lenovo, 120 шт.'
    d.draft.post = 'Хоргос — ЦТО'
    const [a, b] = await Promise.all([d.ensureCreated(), d.ensureCreated()])
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.create).toHaveBeenCalledWith({ clientId: 'u1', clientName: 'romashka', cargo: 'Ноутбуки Lenovo, 120 шт.', post: 'Хоргос — ЦТО' })
    expect(a).toBe('c1')
    expect(b).toBe('c1')
    expect(d.number.value).toBe('ИМ-2026-0184')
    await d.ensureCreated()
    expect(api.create).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('save: PUT с полями шагов 1–3', async () => {
    const { d, scope } = setup()
    Object.assign(d.draft, {
      cargo: ' Ноутбуки ', post: 'Хоргос — ЦТО', transportMode: 1, vehicleNumber: '123ABC01', trailerNumber: '456DEF01',
      driverPhone: '+7 700 000 00 00', senderName: 'Lenovo', senderCountry: '156', receiverName: 'ТОО «Ромашка»',
      receiverBin: '123456789012', receiverCountry: '398', currency: 'USD', estimatedValue: 25000,
    })
    await d.ensureCreated()
    expect(await d.save()).toBe(true)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update).toHaveBeenCalledWith('c1', {
      cargo: 'Ноутбуки', post: 'Хоргос — ЦТО', transportMode: 1, vehicleNumber: '123ABC01', trailerNumber: '456DEF01',
      driverPhone: '+7 700 000 00 00', wagonNumber: '', station: '', flightNumber: '', airWaybill: '', vesselName: '',
      billOfLading: '', clientSenderName: 'Lenovo', clientSenderCountryCode: '156', clientReceiverName: 'ТОО «Ромашка»',
      clientReceiverBin: '123456789012', clientReceiverCountryCode: '398', clientCurrencyCode: 'USD', clientEstimatedValue: 25000,
    }, { silent: true })
    expect(d.savedAt.value).toBeInstanceOf(Date)
    expect(d.saveError.value).toBe(false)
    // Без правок — без запросов.
    await d.save()
    expect(api.update).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('save: ошибка — saveError, повтор после исправления сети', async () => {
    const { d, scope } = setup()
    d.draft.cargo = 'Ноутбуки'
    await d.ensureCreated()
    api.update.mockRejectedValueOnce(new Error('network'))
    expect(await d.save()).toBe(false)
    expect(d.saveError.value).toBe(true)
    expect(await d.save()).toBe(true)
    expect(d.saveError.value).toBe(false)
    expect(api.update).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('контейнеры по различию: продолжение черновика не дублирует, удалили один и добавили новый — один DELETE и один POST', async () => {
    server = caseDto({ id: 'c1', status: 0, containers: [container('k1', 'MSKU1234567', '40HC'), container('k2', 'TGHU7654321', '20DC')] })
    const { d, scope } = setup()
    await d.load('c1')
    expect(d.draft.containers).toEqual([
      { id: 'k1', number: 'MSKU1234567', type: '40HC' },
      { id: 'k2', number: 'TGHU7654321', type: '20DC' },
    ])

    // Только что загруженный черновик: сохранение ничего не шлёт (раньше — POST на каждую строку).
    await d.save()
    expect(api.addContainer).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()

    d.draft.containers.splice(1, 1)
    d.draft.containers.push({ number: 'CMAU0000001', type: '40HC' })
    await d.save()
    expect(api.deleteContainer).toHaveBeenCalledTimes(1)
    expect(api.deleteContainer).toHaveBeenCalledWith('c1', 'k2', { silent: true })
    expect(api.addContainer).toHaveBeenCalledTimes(1)
    expect(api.addContainer).toHaveBeenCalledWith('c1', { containerNumber: 'CMAU0000001', containerType: '40HC' }, { silent: true })
    expect(api.updateContainer).not.toHaveBeenCalled()
    // Новая строка получила id с сервера.
    expect(d.draft.containers[1].id).toBe('n1')
    expect(server.containers.map((c) => c.containerNumber)).toEqual(['MSKU1234567', 'CMAU0000001'])

    // Второе сохранение без правок — ноль запросов к контейнерам.
    vi.clearAllMocks()
    await d.save()
    expect(api.addContainer).not.toHaveBeenCalled()
    expect(api.deleteContainer).not.toHaveBeenCalled()
    expect(api.updateContainer).not.toHaveBeenCalled()
    scope.stop()
  })

  it('контейнеры: правка строки с id — PUT; стёртый тип — замена строки; строка без номера не уходит', async () => {
    server = caseDto({ id: 'c1', status: 0, containers: [container('k1', 'MSKU1234567', '40HC'), container('k2', 'TGHU7654321', '20DC')] })
    const { d, scope } = setup()
    await d.load('c1')
    d.draft.containers[0].number = 'MSKU1234568'
    d.draft.containers[1].type = ''
    d.draft.containers.push({ number: '  ', type: '40HC' })
    await d.save()
    expect(api.updateContainer).toHaveBeenCalledTimes(1)
    expect(api.updateContainer).toHaveBeenCalledWith('c1', 'k1', { containerNumber: 'MSKU1234568', containerType: '40HC' }, { silent: true })
    expect(api.deleteContainer).toHaveBeenCalledWith('c1', 'k2', { silent: true })
    expect(api.addContainer).toHaveBeenCalledTimes(1)
    expect(api.addContainer).toHaveBeenCalledWith('c1', { containerNumber: 'TGHU7654321', containerType: '' }, { silent: true })
    scope.stop()
  })

  it('load: легаси-коды стран приводятся к ОКСМ, номер и статус — с сервера', async () => {
    server = caseDto({ id: 'c1', number: 'ИМ-2026-0190', status: 0, clientReceiverCountryCode: 'KZ', clientSenderCountryCode: '' })
    const { d, scope } = setup()
    await d.load('c1')
    expect(d.draft.receiverCountry).toBe('398')
    expect(d.draft.senderCountry).toBeNull()
    expect(d.number.value).toBe('ИМ-2026-0190')
    expect(d.status.value).toBe(0)
    expect(d.caseId.value).toBe('c1')
    scope.stop()
  })

  it('scheduleSave: серия правок — один PUT через 800 мс после последней', async () => {
    vi.useFakeTimers()
    const { d, scope } = setup()
    d.draft.cargo = 'Ноутбуки'
    await d.ensureCreated()
    for (const v of ['1', '12', '123ABC']) {
      d.draft.vehicleNumber = v
      d.scheduleSave()
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    }
    expect(api.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][1]).toMatchObject({ vehicleNumber: '123ABC' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3)
    expect(api.update).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('save во время сохранения — ещё один проход после него, а не параллельный', async () => {
    const { d, scope } = setup()
    d.draft.cargo = 'Ноутбуки'
    await d.ensureCreated()
    let release!: () => void
    api.update.mockImplementationOnce(() => new Promise((r) => { release = () => r(server) }))
    const first = d.save()
    await Promise.resolve()
    d.draft.station = 'Достык'
    const second = d.save()
    const third = d.save()
    expect(api.update).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second, third])
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(api.update.mock.calls[1][1]).toMatchObject({ station: 'Достык' })
    scope.stop()
  })

  it('сбой синхронизации контейнеров посередине (DELETE прошёл, POST упал) — повтор шлёт ровно один POST', async () => {
    server = caseDto({ id: 'c1', status: 0, containers: [container('k1', 'MSKU1234567', '40HC'), container('k2', 'TGHU7654321', '20DC')] })
    const { d, scope } = setup()
    await d.load('c1')
    d.draft.containers.splice(1, 1)
    d.draft.containers.push({ number: 'CMAU0000001', type: '40HC' })
    api.addContainer.mockRejectedValueOnce(new Error('network'))
    expect(await d.save()).toBe(false)
    expect(d.saveError.value).toBe(true)
    expect(d.dirty.value).toBe(true)
    expect(api.deleteContainer).toHaveBeenCalledTimes(1)
    expect(api.addContainer).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    expect(await d.save()).toBe(true)
    expect(api.deleteContainer).not.toHaveBeenCalled()
    expect(api.addContainer).toHaveBeenCalledTimes(1)
    expect(api.addContainer).toHaveBeenCalledWith('c1', { containerNumber: 'CMAU0000001', containerType: '40HC' }, { silent: true })
    expect(server.containers.map((c) => c.containerNumber)).toEqual(['MSKU1234567', 'CMAU0000001'])
    expect(d.dirty.value).toBe(false)
    scope.stop()
  })

  it('id новой строки — только по номеру; нет в ответе — перечитываем заявку', async () => {
    server = caseDto({ id: 'c1', status: 0, containers: [] })
    const { d, scope } = setup()
    await d.load('c1')
    // Ответ POST без новой строки, зато с чужим незнакомым контейнером — его id брать нельзя.
    api.addContainer.mockImplementationOnce(async () => {
      server = { ...server, containers: [container('x9', 'FOREIGN0001'), container('n7', 'CMAU0000001')] }
      return { ...server, containers: [container('x9', 'FOREIGN0001')] }
    })
    d.draft.containers.push({ number: 'CMAU0000001', type: '' })
    expect(await d.save()).toBe(true)
    expect(api.get).toHaveBeenLastCalledWith('c1', { silent: true })
    expect(d.draft.containers[0].id).toBe('n7')
    scope.stop()
  })

  it('dirty реактивен: правка — true, после сохранения — false', async () => {
    const { d, scope } = setup()
    d.draft.cargo = 'Ноутбуки'
    expect(d.dirty.value).toBe(false)
    await d.ensureCreated()
    expect(d.dirty.value).toBe(true)
    await d.save()
    expect(d.dirty.value).toBe(false)
    d.draft.containers.push({ number: 'CMAU0000001', type: '' })
    expect(d.dirty.value).toBe(true)
    await d.save()
    expect(d.dirty.value).toBe(false)
    scope.stop()
  })

  it('ensureCreated без id клиента — без POST, с тостом об ошибке', async () => {
    useAuthStore().userId = null
    const { d, scope } = setup()
    d.draft.cargo = 'Ноутбуки'
    await expect(d.ensureCreated()).rejects.toThrow()
    expect(api.create).not.toHaveBeenCalled()
    expect(msg.error).toHaveBeenCalledWith('Не удалось определить вашу компанию — войдите заново')
    expect(d.caseId.value).toBeNull()
    scope.stop()
  })
})
