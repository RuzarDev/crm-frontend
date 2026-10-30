import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ExpeditorImport40, ExpeditorShipment } from '@/api/expeditorImport40'

const api = vi.hoisted(() => ({ overview: vi.fn() }))
vi.mock('@/api/expeditorImport40', () => ({ expeditorImport40Api: api }))

import ExpeditorImport40View from '../ExpeditorImport40View.vue'
import { contractState, filterCounts, filterShipments, shipmentTone } from '../expeditorImport40'

const ship = (p: Partial<ExpeditorShipment> = {}): ExpeditorShipment => ({
  id: 's1', number: 'ИМ-2026-0166', clientId: 'a', clientName: 'ТОО Альфа', cargo: 'Ноутбуки', post: 'Хоргос', status: 3, step: 3,
  declarationNumbers: ['50408/171026/0001'], releasedAtUtc: null, customsRequestOpen: false,
  createdAtUtc: '2026-10-10T08:00:00Z', updatedAtUtc: '2026-10-16T08:00:00Z', ...p,
})
const DATA: ExpeditorImport40 = {
  clients: [
    {
      clientId: 'a', name: 'ТОО Альфа', innBin: '123456789012',
      contract: {
        id: 'k', number: '7', year: 2026, status: 2, clientSigned: true, providerSigned: false, validUntilUtc: null,
        generatedAtUtc: '2026-10-01T00:00:00Z',
      },
      poa: {
        id: 'p', number: '5', year: 2026, status: 2, clientSigned: true, providerSigned: false, validUntilUtc: '2026-12-31T23:59:59Z',
        generatedAtUtc: '2026-10-02T00:00:00Z',
      },
    },
    { clientId: 'b', name: 'ТОО Бета', innBin: '', contract: null },
  ],
  shipments: [
    ship(),
    ship({ id: 's2', number: 'ИМ-2026-0170', cargo: 'Станки', status: 1, step: 2, declarationNumbers: [], customsRequestOpen: true, post: '' }),
    ship({ id: 's3', number: 'ИМ-2026-0150', cargo: 'Посуда', clientName: 'ТОО Бета', status: 8, step: 0, releasedAtUtc: '2026-10-05T06:00:00Z' }),
  ],
}

let w: VueWrapper
const mountIt = async () => {
  w = mountWithI18n(ExpeditorImport40View, { attachTo: document.body })
  await flushPromises()
}
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('expeditorImport40 (логика)', () => {
  it('фильтры, поиск по ДТ/клиенту, тон статуса и состояние договора', () => {
    expect(filterCounts(DATA.shipments)).toEqual({ active: 2, done: 1, all: 3 })
    expect(filterShipments(DATA.shipments, 'done', '').map((s) => s.id)).toEqual(['s3'])
    expect(filterShipments(DATA.shipments, 'all', '171026').map((s) => s.id)).toEqual(['s1', 's3'])
    expect(filterShipments(DATA.shipments, 'all', 'бета').map((s) => s.id)).toEqual(['s3'])
    expect(shipmentTone({ status: 1, customsRequestOpen: true })).toBe('danger')
    expect(shipmentTone({ status: 4, customsRequestOpen: false })).toBe('done')
    expect(shipmentTone({ status: 9, customsRequestOpen: true })).toBe('neutral')
    const k = DATA.clients[0]!.contract!
    expect(contractState(null)).toBe('none')
    expect(contractState(k)).toBe('active')
    expect(contractState({ ...k, validUntilUtc: '2026-01-01T00:00:00Z' }, new Date('2026-10-17'))).toBe('expired')
    expect(contractState({ ...k, status: 4 })).toBe('revoked')
    expect(contractState({ ...k, status: 1 })).toBe('awaiting')
  })
})

describe('ExpeditorImport40View', () => {
  it('статус груза: по умолчанию «В работе»; таможня ждёт — плашка; «Завершённые» — с датой выпуска', async () => {
    api.overview.mockResolvedValue(DATA)
    await mountIt()
    const rows = () => w.findAll('[data-expeditor40-shipment]')
    expect(rows().map((r) => r.attributes('data-expeditor40-shipment'))).toEqual(['s1', 's2'])
    expect(w.get('[data-expeditor40-shipment="s1"] [data-expeditor40-status]').text()).toBe('ДТ подана, ждёт выпуска')
    expect(w.get('[data-expeditor40-shipment="s1"] [data-expeditor40-dt]').text()).toBe('50408/171026/0001')
    expect(w.get('[data-expeditor40-shipment="s2"] [data-expeditor40-status]').text()).toBe('Таможня ждёт документы')
    const done = [...document.querySelectorAll('[data-expeditor40-filter] button')].find((b) => b.textContent?.includes('Завершённые')) as HTMLButtonElement
    done.click()
    await flushPromises()
    expect(rows().map((r) => r.attributes('data-expeditor40-shipment'))).toEqual(['s3'])
    expect(w.get('[data-expeditor40-released]').text()).toBe('Выпуск: 05.10.2026')
  })

  // Раунд 1 (решение владельца 30.10.2026): только статус договора и доверенности, без скачивания.
  it('документы: состояние договора и подписи, доверенность «действует до …»; скачивания нет', async () => {
    api.overview.mockResolvedValue(DATA)
    await mountIt()
    const a = w.get('[data-expeditor40-client="a"]')
    expect(a.get('[data-expeditor40-contract-state]').text()).toBe('Действует')
    expect(a.get('[data-expeditor40-contract]').text()).toBe('Договор № 7/2026')
    expect(a.text()).toContain('клиент подписал · AQNIET не подписал')
    expect(a.get('[data-expeditor40-poa]').text()).toBe('Доверенность № 5/2026 · действует до 31.12.2026')
    expect(w.find('button[data-expeditor40-download], [data-expeditor40-signed]').exists()).toBe(false)
    const b = w.get('[data-expeditor40-client="b"]')
    expect(b.get('[data-expeditor40-contract-state]').text()).toBe('Нет договора')
    expect(b.get('[data-expeditor40-poa]').text()).toBe('Доверенности нет')
  })

  it('доверенность ждёт подписи — так и написано', async () => {
    api.overview.mockResolvedValue({ ...DATA, clients: [{ ...DATA.clients[0], poa: { ...DATA.clients[0].poa!, status: 1, validUntilUtc: null } }] })
    await mountIt()
    expect(w.get('[data-expeditor40-poa]').text()).toBe('Доверенность № 5/2026 · ждёт подписи клиента')
  })

  it('нет клиентов — пустое состояние; ошибка — «Повторить»', async () => {
    api.overview.mockRejectedValueOnce(new Error('x')).mockResolvedValue({ clients: [], shipments: [] })
    await mountIt()
    expect(w.find('[data-expeditor40-error]').exists()).toBe(true)
    await w.get('[data-expeditor40-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-expeditor40-empty]').exists()).toBe(true)
  })
})
