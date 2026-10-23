import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { PreBorder } from '@/api/preBorder'
import { setLocale } from '@/i18n'

const api = vi.hoisted(() => ({
  get: vi.fn(), save: vi.fn(), uploadPhoto: vi.fn(), deletePhoto: vi.fn(), serials: vi.fn(), saveSerials: vi.fn(), clearSerials: vi.fn(),
  addMark: vi.fn(), deleteMark: vi.fn(),
}))
const tr = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), translate: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/preBorder', async (orig) => ({ ...(await orig<typeof import('@/api/preBorder')>()), preBorderApi: api, translationApi: tr }))
vi.mock('@/api/carriers', async (orig) => ({ ...(await orig<typeof import('@/api/carriers')>()), carriersApi: { caseCarriers: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => ({ saveBlob: vi.fn() }))
const heic = vi.hoisted(() => ({ forUpload: vi.fn() }))
vi.mock('@/utils/heic', async (orig) => ({ ...(await orig<typeof import('@/utils/heic')>()), heicForUpload: heic.forUpload }))

// «Перевести (ИИ)» скрыт флагом (23.10.2026); тесты кнопки — с включённым флагом.
const feat = vi.hoisted(() => ({ FILE_TRANSLATE_ENABLED: true }))
vi.mock('@/config/features', () => feat)

import PreBorderPanel from '../PreBorderPanel.vue'
import FileTranslateButton from '../FileTranslateButton.vue'
import ZUpload from '@/components/z/ZUpload.vue'

const pb = (p: Partial<PreBorder> = {}): PreBorder => ({
  caseId: 'c1', started: true, canEdit: true, status: 1, transportMode: 1, supplierPaymentDeferred: false, payments: [], availablePayments: [],
  loadingDate: '2026-10-10', loadingCity: 'Урумчи', loadingWarehouse: 'Склад 3', sealNumbers: 'A1, A2', photos: [], serialCount: 12, imeiCount: 10,
  carrierId: 'k1', carrierName: 'Trans Asia', carrierArchived: false, vehicleNumber: '123ABC02', trailerNumber: '45XY02', containerNumber: null,
  wagonNumber: '', expectedBorderDate: '2026-10-20',
  marks: [{ id: 'm1', atUtc: '2026-10-15T05:00:00Z', place: 'Хоргос', comment: 'очередь', byClient: false, canDelete: false }],
  borderArrivedAtUtc: null, borderArrivalPost: null, missing: ['payment'], updatedAtUtc: null, ...p,
})

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('PreBorderPanel', () => {
  it('сводка по подшагам и «нужно от вас» у клиента', () => {
    const w = mountWithI18n(PreBorderPanel, { props: { caseId: 'c1', data: pb(), state: 'ready', audience: 'client' }, attachTo: document.body })
    expect(w.find('[data-pre-border-missing]').text()).toContain('оплата поставщику')
    expect(w.find('[data-pb-loading]').text()).toBe('10.10 · Урумчи · Склад 3')
    expect(w.find('[data-pb-transport]').text()).toContain('123ABC02 / 45XY02')
    expect(w.find('[data-pb-serial-count]').text()).toContain('12')
    // Отметку сотрудника клиент не удаляет.
    expect(w.find('[data-pb-mark]').text()).toContain('AQNIET')
    expect(w.find('[data-pb-mark-delete]').exists()).toBe(false)
    expect(w.find('[data-pre-border-edit]').exists()).toBe(true)
    w.unmount()
  })

  it('без права правки — только просмотр; прибытие — с постом', () => {
    const w = mountWithI18n(PreBorderPanel, {
      props: { caseId: 'c1', data: pb({ canEdit: false, missing: [], borderArrivedAtUtc: '2026-10-20T05:00:00Z', borderArrivalPost: 'Нур Жолы' }), state: 'ready', audience: 'staff' },
    })
    expect(w.find('[data-pre-border-edit]').exists()).toBe(false)
    expect(w.find('[data-pb-photo-upload]').exists()).toBe(false)
    expect(w.find('[data-pb-serials-upload]').exists()).toBe(false)
    expect(w.find('[data-pb-arrived]').text()).toContain('Нур Жолы')
    expect(w.find('[data-pre-border-missing]').exists()).toBe(false)
  })

  it('фото уходят по одному запросу на файл', async () => {
    api.uploadPhoto.mockImplementation(async () => pb())
    const w = mountWithI18n(PreBorderPanel, { props: { caseId: 'c1', data: pb(), state: 'ready', audience: 'client' } })
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.png', { type: 'image/png' })]
    w.findComponent(ZUpload).vm.$emit('select', files)
    await flushPromises()
    expect(api.uploadPhoto).toHaveBeenCalledTimes(2)
    expect(api.uploadPhoto.mock.calls.map((c) => (c[1] as File).name)).toEqual(['a.jpg', 'b.png'])
    expect(w.emitted('changed')).toHaveLength(2)
    expect(msg.success).toHaveBeenCalledOnce()
  })

  it('фото с iPhone (HEIC): Safari переводит в JPEG сам, иначе исходник уходит на сервер', async () => {
    api.uploadPhoto.mockImplementation(async () => pb())
    heic.forUpload.mockImplementation(async (f: File) => new File(['j'], f.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' }))
    const w = mountWithI18n(PreBorderPanel, { props: { caseId: 'c1', data: pb(), state: 'ready', audience: 'staff' } })
    const input = w.find('[data-pb-photos] input[type="file"]')
    expect(input.attributes('accept')).toContain('.heic')
    Object.defineProperty(input.element, 'files', { value: [new File(['h'], 'IMG_0042.HEIC')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(heic.forUpload).toHaveBeenCalledOnce()
    const sent = api.uploadPhoto.mock.calls[0][1] as File
    expect(sent.name).toBe('IMG_0042.jpg')
    expect(sent.type).toBe('image/jpeg')

    // Chrome/Firefox: браузер HEIC не открыл — уходит исходник (в JPEG переведёт сервер), без сообщения об ошибке.
    heic.forUpload.mockImplementation(async (f: File) => f)
    const original = new File(['h'], 'IMG_0043.HEIC')
    Object.defineProperty(input.element, 'files', { value: [original], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(api.uploadPhoto.mock.calls[1][1]).toBe(original)
    expect(msg.error).not.toHaveBeenCalled()
  })

  it('сервер не перевёл фото HEIC (400 { code: "heic" }) — текст на языке интерфейса, а не русский текст сервера', async () => {
    // Сценарий e2e-1 (ревью 22.10): uploadPhoto глушит 400 у общего перехватчика, и панель показывала data.error как есть.
    heic.forUpload.mockImplementation(async (f: File) => f)
    api.uploadPhoto.mockRejectedValue({ response: { status: 400, data: {
      error: 'Не удалось перевести фото «IMG_0001.HEIC» из HEIC в JPEG: файл повреждён', code: 'heic', reason: 'unreadable', name: 'IMG_0001.HEIC',
    } } })
    const w = mountWithI18n(PreBorderPanel, { props: { caseId: 'c1', data: pb(), state: 'ready', audience: 'client' } })
    try {
      await setLocale('en')
      w.findComponent(ZUpload).vm.$emit('select', [new File(['h'], 'IMG_0001.HEIC')])
      await flushPromises()
      expect(msg.error).toHaveBeenLastCalledWith(expect.stringContaining('Could not convert the photo IMG_0001.HEIC from HEIC to JPEG'))

      await setLocale('kk')
      w.findComponent(ZUpload).vm.$emit('select', [new File(['h'], 'IMG_0001.HEIC')])
      await flushPromises()
      expect(msg.error).toHaveBeenLastCalledWith(expect.stringContaining('IMG_0001.HEIC фотосын HEIC-тен JPEG-ке айналдыру мүмкін болмады'))
      expect(msg.error.mock.calls.flat().join(' ')).not.toContain('файл повреждён')

      // Прочие отказы 400 — текст сервера, как раньше.
      api.uploadPhoto.mockRejectedValue({ response: { status: 400, data: { error: 'Не больше 30 фото погрузки' } } })
      w.findComponent(ZUpload).vm.$emit('select', [new File(['j'], 'a.jpg', { type: 'image/jpeg' })])
      await flushPromises()
      expect(msg.error).toHaveBeenLastCalledWith('Не больше 30 фото погрузки')
    } finally {
      await setLocale('ru')
      w.unmount()
    }
  })

  it('ошибка загрузки — «Повторить»', async () => {
    const w = mountWithI18n(PreBorderPanel, { props: { caseId: 'c1', data: null, state: 'error', audience: 'client' } })
    await w.find('[data-pre-border-retry]').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })
})

describe('FileTranslateButton', () => {
  it('скан без текста — честный ответ сервера, без выдумок', async () => {
    tr.translate.mockRejectedValue({ response: { status: 422, data: { error: 'В файле нет текста — нужен текстовый PDF или фото с распознаванием (OCR).', code: 'noText' } } })
    const w = mountWithI18n(FileTranslateButton, { props: { caseId: 'c1', fileId: 'f1', fileName: 'scan.pdf' }, attachTo: document.body })
    await w.find('[data-file-translate]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-translate-error]')?.textContent).toContain('нужен текстовый PDF')
    expect(document.body.querySelector('[data-translate-text]')).toBeNull()
    w.unmount()
  })

  it('перевод показывается и сообщает о себе; сохранённый открывается без нового перевода', async () => {
    tr.get.mockResolvedValue({ fileId: 'f1', fileName: 'inv.pdf', sourceLanguage: 'zh', text: 'Коммерческий инвойс', truncated: true, createdAtUtc: '' })
    const w = mountWithI18n(FileTranslateButton, { props: { caseId: 'c1', fileId: 'f1', fileName: 'inv.pdf', translated: true }, attachTo: document.body })
    expect(w.find('[data-file-translate]').text()).toContain('Перевод')
    await w.find('[data-file-translate]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-translate-text]')?.textContent).toBe('Коммерческий инвойс')
    expect(document.body.querySelector('[data-translate-meta]')?.textContent).toContain('китайский')
    expect(tr.translate).not.toHaveBeenCalled()
    expect(w.emitted('translated')?.[0]).toEqual(['f1'])
    w.unmount()
  })
})
