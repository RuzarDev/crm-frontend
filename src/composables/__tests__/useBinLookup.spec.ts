import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { companyLookupApi, type CompanyLookupDto } from '@/api/companyLookup'
import { useBinLookup } from '../useBinLookup'

const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

const company = (over: Partial<CompanyLookupDto> = {}): CompanyLookupDto => ({
  bin: '123456789012', nameRu: 'ТОО «Аргын»', nameKz: null, addressRu: 'Астана', addressKz: null, director: 'Сейтов А.',
  okedRu: null, statusRu: null, dateReg: null, source: 'gbd_ul', fetchedAtUtc: '2026-10-08T00:00:00Z', ...over,
})
const httpError = (status: number, error?: string) => Object.assign(new Error('http'), { response: { status, data: error ? { error } : {} } })

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  vi.restoreAllMocks()
  Object.values(msg).forEach((f) => f.mockReset())
})

// useI18n нужен компонент — composable зовём из setup хоста.
const setup = (opts: { anonymous?: boolean } = {}) => {
  let api!: ReturnType<typeof useBinLookup>
  w = mountWithI18n(defineComponent({
    setup() {
      api = useBinLookup(opts)
      return () => null
    },
  }))
  return api
}

describe('useBinLookup', () => {
  it('200 — возвращает карточку, тост «Найдено», loading на время запроса', async () => {
    let resolve!: (c: CompanyLookupDto) => void
    const byBin = vi.spyOn(companyLookupApi, 'byBin').mockReturnValue(new Promise((r) => { resolve = r }))
    const { loading, lookup } = setup({ anonymous: true })
    const p = lookup('1234 5678 9012')
    expect(loading.value).toBe(true)
    resolve(company({ statusRu: 'Действующее' }))
    expect(await p).toMatchObject({ nameRu: 'ТОО «Аргын»' })
    expect(loading.value).toBe(false)
    expect(byBin).toHaveBeenCalledWith('1234 5678 9012', true)
    expect(msg.success).toHaveBeenCalledWith('Найдено: ТОО «Аргын» · Действующее. Проверьте адрес — данные реестра могут отставать.')
  })

  it('ИП — свой текст «адрес заполните вручную»', async () => {
    vi.spyOn(companyLookupApi, 'byBin').mockResolvedValue(company({ kind: 'ip', nameRu: 'ИП Ахметов' }))
    const { lookup } = setup()
    await lookup('123456789012')
    expect(msg.success).toHaveBeenCalledWith(expect.stringContaining('Адрес ИП заполните вручную'))
  })

  it('isActive: false — предупреждение на 8 секунд, карточка всё равно возвращается', async () => {
    vi.spyOn(companyLookupApi, 'byBin').mockResolvedValue(company({ isActive: false, statusRu: 'Ликвидировано' }))
    const { lookup } = setup()
    expect(await lookup('123456789012')).not.toBeNull()
    expect(msg.warning).toHaveBeenCalledWith({ content: 'ТОО «Аргын»: Ликвидировано. Проверьте, можно ли работать с этим контрагентом.', duration: 8 })
    expect(msg.success).not.toHaveBeenCalled()
  })

  it('404 — null и предупреждение (текст сервера важнее своего)', async () => {
    vi.spyOn(companyLookupApi, 'byBin').mockRejectedValueOnce(httpError(404)).mockRejectedValueOnce(httpError(404, 'Нет в реестре'))
    const { lookup, loading } = setup()
    expect(await lookup('123456789012')).toBeNull()
    expect(msg.warning).toHaveBeenLastCalledWith('Ни юрлица, ни ИП с таким БИН/ИИН не найдено')
    expect(await lookup('123456789012')).toBeNull()
    expect(msg.warning).toHaveBeenLastCalledWith('Нет в реестре')
    expect(loading.value).toBe(false)
  })

  it('503 — ошибка «не настроен», 400 — предупреждение, прочее — «недоступен»', async () => {
    vi.spyOn(companyLookupApi, 'byBin')
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(400))
      .mockRejectedValueOnce(httpError(502))
    const { lookup } = setup()
    await lookup('123456789012')
    expect(msg.error).toHaveBeenLastCalledWith('Поиск по БИН не настроен (нет API-ключа data.egov.kz)')
    await lookup('123456789012')
    expect(msg.warning).toHaveBeenLastCalledWith('БИН/ИИН должен содержать 12 цифр')
    await lookup('123456789012')
    expect(msg.error).toHaveBeenLastCalledWith('data.egov.kz временно недоступен')
  })

  it('не БИН — null без запроса и без тостов', async () => {
    const byBin = vi.spyOn(companyLookupApi, 'byBin')
    const { lookup } = setup()
    for (const bin of ['12345', '', null, undefined]) expect(await lookup(bin)).toBeNull()
    expect(byBin).not.toHaveBeenCalled()
    expect(Object.values(msg).every((f) => f.mock.calls.length === 0)).toBe(true)
  })

  it('anonymous читается при каждом поиске (объект с геттером на prop)', async () => {
    const byBin = vi.spyOn(companyLookupApi, 'byBin').mockResolvedValue(company())
    let anon = false
    const { lookup } = setup({ get anonymous() { return anon } })
    await lookup('123456789012')
    anon = true
    await lookup('123456789012')
    expect(byBin.mock.calls.map((c) => c[1])).toEqual([false, true])
  })
})
