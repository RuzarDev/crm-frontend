import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCaseFile, ClientDocuments } from '@/api/clientDocuments'
import type { Import40DocumentDto } from '@/api/import40Contract'

const api = vi.hoisted(() => ({ list: vi.fn() }))
const imp = vi.hoisted(() => ({ downloadFile: vi.fn() }))
const save = vi.hoisted(() => ({ saveBlob: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/clientDocuments', () => ({ clientDocumentsApi: api }))
vi.mock('@/api/import40', () => ({ import40Api: imp }))
vi.mock('@/views/client/shipment/util', async (orig) => ({ ...(await orig<object>()), saveBlob: save.saveBlob }))
vi.mock('@/ui/message', () => ({ message: msg }))

import ClientDocumentsView from '../ClientDocumentsView.vue'
import { useAuthStore } from '@/stores/auth'

const file = (o: Partial<ClientCaseFile>): ClientCaseFile => ({
  id: 'f1', caseId: 'c1', caseNumber: 'ИМ-2026-0166', cargo: 'Серверы', section: 'documents', docKind: null,
  fileName: 'file.pdf', sizeBytes: 100, createdAtUtc: '2026-10-01T06:00:00Z', fromClient: true,
  ...o,
})
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'cl', kind: 'contract', number: '12', year: 2026, generatedAtUtc: '2026-10-08T06:00:00Z',
  status: 2, clientSigned: true, clientSignedAtUtc: null, providerSigned: true, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: '2099-10-08T23:59:59Z',
  consumedByCaseId: null, files: [],
  ...o,
})

// Свежие сверху: f-svh, f-dt-stamp, f-inv, f-cmr, f-pi, f-poa, f-check.
const FILES = [
  file({ id: 'f-inv', section: 'documents', docKind: 'invoice', fileName: 'invoice_DE-4471.pdf', createdAtUtc: '2026-09-24T07:00:00Z' }),
  file({ id: 'f-svh', section: 'svh-invoice', fileName: 'svh_1187.pdf', fromClient: false, createdAtUtc: '2026-10-07T06:00:00Z' }),
  file({ id: 'f-stamp', section: 'declaration-stamp', fileName: 'stamp.pdf', fromClient: false, createdAtUtc: '2026-10-02T06:00:00Z' }),
  file({ id: 'f-cmr', section: 'documents', docKind: null, fileName: 'cmr_0921.pdf', createdAtUtc: '2026-09-24T06:00:00Z' }),
  file({ id: 'f-pi', caseId: 'c2', caseNumber: 'ИМ-2026-0182', section: 'documents', docKind: 'packing', fileName: 'packing_HK.xlsx', createdAtUtc: '2026-09-20T06:00:00Z' }),
  file({ id: 'f-poa', caseId: 'c2', caseNumber: 'ИМ-2026-0182', section: 'power-of-attorney', fileName: 'poa.pdf', createdAtUtc: '2025-03-02T06:00:00Z' }),
  file({ id: 'f-check', caseId: 'c3', caseNumber: 'ИМ-2026-0158', section: 'payment-check', fileName: 'kaspi_check_0930.jpg', createdAtUtc: '2025-03-01T06:00:00Z' }),
]
const DATA = (o: Partial<ClientDocuments> = {}): ClientDocuments => ({
  company: [doc({ status: 1, clientSigned: false, providerSigned: false, validUntilUtc: '2027-10-08T23:59:59Z' })],
  files: FILES,
  ...o,
})

let w: VueWrapper
let pinia: Pinia
let router: Router
const stub = { template: '<div/>' }

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientDocumentsView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const rowIds = () => w.findAll('[data-doc-row]').map((r) => r.attributes('data-doc-row'))
const kindOf = (id: string) => w.get(`[data-doc-row="${id}"] [data-doc-kind]`).text()
const company = (kind: string) => w.get(`[data-company-card="${kind}"]`)

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: stub }] })
  const auth = useAuthStore()
  auth.role = 'Client'
  auth.modules = ['import40']
  api.list.mockResolvedValue(DATA())
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientDocumentsView', () => {
  it('файлы поставок — свежие сверху; подписи видов: из чек-листа, иначе по разделу', async () => {
    await mountAt('/documents')
    expect(api.list).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Документы')
    expect(rowIds()).toEqual(['f-svh', 'f-stamp', 'f-inv', 'f-cmr', 'f-pi', 'f-poa', 'f-check'])
    expect(kindOf('f-svh')).toBe('Счёт СВХ')
    expect(kindOf('f-stamp')).toBe('Отметка о выпуске')
    expect(kindOf('f-inv')).toBe('Инвойс (коммерческий счёт)')
    expect(kindOf('f-cmr')).toBe('Документ')
    expect(kindOf('f-pi')).toBe('Упаковочный лист')
    expect(kindOf('f-poa')).toBe('Доверенность')
    expect(kindOf('f-check')).toBe('Чек об оплате СВХ')

    const row = w.get('[data-doc-row="f-svh"]')
    expect(row.get('[data-doc-name]').text()).toBe('svh_1187.pdf')
    expect(row.get('[data-doc-from]').text()).toBe('AQNIET')
    expect(row.get('[data-doc-case]').text()).toBe('ИМ-2026-0166')
    expect(row.get('[data-doc-case]').attributes('href')).toBe('/import-40/c1')
    expect(w.get('[data-doc-row="f-inv"] [data-doc-from]').text()).toBe('Вы')
    // Прошлый год — с годом.
    expect(w.get('[data-doc-row="f-poa"] [data-doc-date]').text()).toBe('02.03.2025')
    // Телефонные карточки — тот же список.
    expect(w.findAll('[data-doc-card]').map((c) => c.attributes('data-doc-card'))).toEqual(rowIds())
  })

  it('документы компании: актуальный договор со сроком и статусом, доверенности нет — «Нет»; ведут в «Мою компанию»', async () => {
    await mountAt('/documents')
    const c = company('contract')
    expect(c.text()).toContain('Договор № 12/2026')
    expect(c.get('[data-company-meta]').text()).toBe('Многоразовый · до 08.10.2027')
    expect(c.get('[data-company-tag]').text()).toBe('Ждёт подписи')
    expect(c.attributes('href')).toBe('/import-40/company?step=contract')
    const p = company('poa')
    expect(p.text()).toContain('Доверенность')
    expect(p.get('[data-company-tag]').text()).toBe('Нет')
    expect(p.attributes('href')).toBe('/import-40/company?step=poa')
  })

  it('отозванный документ уступает свежему неотозванному: истёкшая доверенность — «Истёк»', async () => {
    api.list.mockResolvedValue(DATA({
      company: [
        doc({ id: 'c', status: 2, validUntilUtc: '2099-01-01T23:59:59Z' }),
        doc({ id: 'p-old', kind: 'poa', number: '3', status: 2, validUntilUtc: '2026-01-01T23:59:59Z', generatedAtUtc: '2025-06-01T06:00:00Z' }),
        doc({ id: 'p-rev', kind: 'poa', number: '7', status: 4, generatedAtUtc: '2026-09-01T06:00:00Z' }),
      ],
    }))
    await mountAt('/documents')
    expect(company('contract').get('[data-company-tag]').text()).toBe('Действует')
    const p = company('poa')
    expect(p.text()).toContain('Доверенность № 3/2026')
    expect(p.attributes('data-company-status')).toBe('expired')
    expect(p.get('[data-company-tag]').text()).toBe('Истёк')
  })

  it('поиск по имени файла, номеру поставки и виду; ?q= — replace; ничего не нашлось', async () => {
    await mountAt('/documents?q=0182')
    expect(rowIds()).toEqual(['f-pi', 'f-poa'])

    const replace = vi.spyOn(router, 'replace')
    await w.get('input[data-docs-search]').setValue('счёт свх')
    await flushPromises()
    expect(replace).toHaveBeenCalled()
    expect(router.currentRoute.value.query.q).toBe('счёт свх')
    expect(rowIds()).toEqual(['f-svh'])

    await w.get('input[data-docs-search]').setValue('kaspi')
    await flushPromises()
    expect(rowIds()).toEqual(['f-check'])

    await w.get('input[data-docs-search]').setValue('нет-такого')
    await flushPromises()
    expect(rowIds()).toEqual([])
    expect(w.get('[data-docs-empty]').attributes('data-docs-empty')).toBe('search')
    expect(w.get('[data-docs-empty]').text()).toContain('По запросу «нет-такого» ничего не нашлось')
  })

  it('фильтр «От AQNIET» — только выданные брокером; «Ваши» — загруженные клиентом; в адресе ?from=', async () => {
    await mountAt('/documents')
    expect(w.get('[data-docs-filter="all"]').attributes('aria-pressed')).toBe('true')
    await w.get('[data-docs-filter="aqniet"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.from).toBe('aqniet')
    expect(w.get('[data-docs-filter="aqniet"]').attributes('aria-pressed')).toBe('true')
    expect(rowIds()).toEqual(['f-svh', 'f-stamp'])

    await w.get('[data-docs-filter="client"]').trigger('click')
    await flushPromises()
    expect(rowIds()).toEqual(['f-inv', 'f-cmr', 'f-pi', 'f-poa', 'f-check'])

    await w.get('[data-docs-filter="all"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.from).toBeUndefined()
    expect(rowIds()).toHaveLength(7)
  })

  it('фильтр без совпадений — пустое состояние своего вида', async () => {
    api.list.mockResolvedValue(DATA({ files: FILES.filter((f) => f.fromClient) }))
    await mountAt('/documents?from=aqniet')
    expect(w.get('[data-docs-empty]').attributes('data-docs-empty')).toBe('aqniet')
    expect(w.get('[data-docs-empty]').text()).toContain('От AQNIET документов пока нет')
  })

  it('«Скачать» берёт файл заявки через API и отдаёт браузеру под исходным именем', async () => {
    const blob = new Blob(['x'])
    imp.downloadFile.mockResolvedValue(blob)
    await mountAt('/documents')
    const btn = w.get('[data-doc-row="f-pi"] [data-doc-download]')
    expect(btn.attributes('aria-label')).toBe('Скачать packing_HK.xlsx')
    await btn.trigger('click')
    await flushPromises()
    expect(imp.downloadFile).toHaveBeenCalledWith('c2', 'f-pi')
    expect(save.saveBlob).toHaveBeenCalledWith(blob, 'packing_HK.xlsx')
    expect(msg.error).not.toHaveBeenCalled()
  })

  it('сбой скачивания без ответа сервера — сообщение', async () => {
    imp.downloadFile.mockRejectedValue(new Error('network'))
    await mountAt('/documents')
    await w.get('[data-doc-row="f-svh"] [data-doc-download]').trigger('click')
    await flushPromises()
    expect(save.saveBlob).not.toHaveBeenCalled()
    expect(msg.error).toHaveBeenCalledWith('Не удалось скачать файл — проверьте связь и повторите')
  })

  it('ссылка «Документы транзита» — только при модуле транзита', async () => {
    await mountAt('/documents')
    expect(w.find('[data-docs-transit]').exists()).toBe(false)
    w.unmount()

    useAuthStore().modules = ['import40', 'transit']
    await mountAt('/documents')
    const link = w.get('[data-docs-transit]')
    expect(link.text()).toBe('Документы транзита')
    expect(link.attributes('href')).toBe('/my-documents')
  })

  it('ошибка загрузки — текст и «Повторить», который перечитывает список', async () => {
    api.list.mockRejectedValueOnce(new Error('boom'))
    await mountAt('/documents')
    expect(w.get('[data-docs-error]').text()).toContain('Не удалось загрузить документы')
    expect(w.find('[data-company-card]').exists()).toBe(false)

    await w.get('[data-docs-retry]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(w.find('[data-docs-error]').exists()).toBe(false)
    expect(rowIds()).toHaveLength(7)
  })

  it('пока грузится — скелетон; файлов нет — «Документов пока нет» и ссылка на поставки, без фильтра', async () => {
    let resolve!: (v: ClientDocuments) => void
    api.list.mockReturnValueOnce(new Promise<ClientDocuments>((r) => { resolve = r }))
    await mountAt('/documents')
    expect(w.find('[data-docs-skeleton]').exists()).toBe(true)

    resolve(DATA({ company: [], files: [] }))
    await flushPromises()
    expect(w.find('[data-docs-skeleton]').exists()).toBe(false)
    expect(w.get('[data-docs-empty]').attributes('data-docs-empty')).toBe('none')
    expect(w.get('[data-docs-empty]').text()).toContain('Документов пока нет')
    expect(w.get('[data-docs-empty] a').attributes('href')).toBe('/import-40')
    expect(w.find('[data-docs-filter]').exists()).toBe(false)
    expect(company('contract').get('[data-company-tag]').text()).toBe('Нет')
  })
})
