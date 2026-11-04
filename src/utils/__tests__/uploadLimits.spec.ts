import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { AI_BUSY, AI_PACKAGE_TOO_LARGE, aiBusyText, DOC_MAX_BYTES, DOC_MAX_MB, extractionRefusalText, isDocTooBig, uploadTooLargeText } from '@/utils/uploadLimits'
import { DOC_MAX_MB as WIZARD_MAX_MB } from '@/views/client/wizard/useShipmentFiles'

// Лимит загрузки документов 100 МБ (02.11.2026, владелец: «ограничение 25, больше файлы не даёт загрузить»).
const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string
const MB = 1024 * 1024

describe('сервис занят (04.11.2026)', () => {
  const busy = (data: Record<string, unknown>) => ({ response: { status: 422, data: { title: AI_BUSY, ...data } } })

  it('текст с минутами на трёх языках; файлы сохранены — так и сказано', () => {
    i18n.global.locale.value = 'ru'
    expect(aiBusyText(busy({ retryAfterMin: 2, filesSaved: false }), t)).toBe('Сервис занят разбором другого пакета, повторите через 2 мин')
    expect(aiBusyText(busy({ retryAfterMin: 2, filesSaved: true }), t)).toBe('Сервис занят разбором другого пакета, повторите через 2 мин. Загруженные файлы сохранены в заявке')
    expect(aiBusyText(busy({}), t)).toContain('через 1 мин')
    for (const locale of ['kk', 'en'] as const) {
      i18n.global.locale.value = locale
      expect(aiBusyText(busy({ retryAfterMin: 3 }), t)).toContain('3')
      expect(aiBusyText(busy({ retryAfterMin: 3 }), t)).not.toContain('broker.case')
    }
    i18n.global.locale.value = 'ru'
  })

  it('другие отказы — не «занят»; extractionRefusalText объясняет оба случая', () => {
    expect(aiBusyText({ response: { status: 422, data: { title: AI_PACKAGE_TOO_LARGE } } }, t)).toBeNull()
    expect(aiBusyText({ response: { status: 502, data: { title: AI_BUSY } } }, t)).toBeNull()
    expect(aiBusyText(new Error('x'), t)).toBeNull()
    expect(extractionRefusalText(busy({ retryAfterMin: 1 }), t)).toContain('Сервис занят')
    expect(extractionRefusalText({ response: { status: 422, data: { title: AI_PACKAGE_TOO_LARGE } } }, t)).toContain('слишком большой')
    expect(extractionRefusalText({ response: { status: 502 } }, t)).toBeNull()
  })
})

describe('лимит файла документа', () => {
  it('100 МБ — одна константа, мастер клиента берёт её же', () => {
    expect(DOC_MAX_MB).toBe(100)
    expect(DOC_MAX_BYTES).toBe(100 * MB)
    expect(WIZARD_MAX_MB).toBe(DOC_MAX_MB)
  })

  it('30 и 100 МБ проходят, 100 МБ + 1 байт — нет', () => {
    expect(isDocTooBig({ size: 30 * MB })).toBe(false)
    expect(isDocTooBig({ size: 100 * MB })).toBe(false)
    expect(isDocTooBig({ size: 100 * MB + 1 })).toBe(true)
  })

  it('подсказки «до N МБ» — с числом из константы, без старых 25 МБ, на трёх языках', () => {
    for (const locale of ['ru', 'kk', 'en'] as const) {
      i18n.global.locale.value = locale
      for (const key of ['broker.packageWorkspace.files.dropHint', 'broker.packages.create.filesHint', 'client.wizard.docs.formats',
        'clientRegistry.form.formats', 'errors.fileTooLarge', 'broker.partia.invoices.tooBig']) {
        const text = t(key, { mb: DOC_MAX_MB })
        expect(text, `${locale} ${key}`).toContain('100')
        expect(text, `${locale} ${key}`).not.toContain('25')
      }
    }
    i18n.global.locale.value = 'ru'
  })
})

describe('uploadTooLargeText: отказ по размеру при распознавании', () => {
  const err = (status: number, data: unknown) => ({ response: { status, data } })

  it('422 AiExtraction.PackageTooLarge — «уберите крупные сканы», с пределом Zircon AI и пометкой о сохранённых файлах', () => {
    expect(uploadTooLargeText(err(422, { title: AI_PACKAGE_TOO_LARGE, limitMb: 64, filesSaved: false }), t))
      .toBe('Пакет слишком большой для распознавания — уберите крупные сканы (каждый файл — не больше 64 МБ) или сожмите их и повторите')
    expect(uploadTooLargeText(err(422, { title: AI_PACKAGE_TOO_LARGE, limitMb: null, filesSaved: true }), t))
      .toBe('Пакет слишком большой для распознавания — уберите крупные сканы или сожмите их и повторите. Загруженные файлы сохранены в заявке')
  })

  it('413 (сервер или nginx не принял запрос) — лимит файла', () => {
    expect(uploadTooLargeText(err(413, '<html>413</html>'), t)).toBe('Файл слишком большой — загрузите файл до 100 МБ')
  })

  it('прочие ошибки — null: экран показывает свой общий текст', () => {
    expect(uploadTooLargeText(err(502, { detail: 'x' }), t)).toBeNull()
    expect(uploadTooLargeText(err(422, { title: 'Other' }), t)).toBeNull()
    expect(uploadTooLargeText(new Error('network'), t)).toBeNull()
    expect(uploadTooLargeText(null, t)).toBeNull()
  })
})
