import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'

// Отказы перевода (аудит 22.10, раунд правок): окно показывает текст по коду ответа на языке интерфейса (ru/kk/en),
// а не русскую строку сервера; незнакомый код — текст сервера как есть.
const tr = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), translate: vi.fn() }))
vi.mock('@/api/preBorder', async (orig) => ({ ...(await orig<typeof import('@/api/preBorder')>()), translationApi: tr }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))
vi.mock('@/ui/download', () => ({ saveBlob: vi.fn() }))
// Кнопка скрыта флагом (@/config/features, 23.10.2026); здесь проверяется сама кнопка — флаг включён.
const feat = vi.hoisted(() => ({ FILE_TRANSLATE_ENABLED: true }))
vi.mock('@/config/features', () => feat)

import FileTranslateButton from '../FileTranslateButton.vue'

const SERVER_RU = 'Слишком много запросов перевода — подождите минуту и повторите.'

const openWithError = async (locale: 'ru' | 'kk' | 'en', data: { error?: string; code?: string }, status = 429) => {
  tr.translate.mockReset().mockRejectedValue({ response: { status, data } })
  const i18n = createI18n({ legacy: false, locale, messages: { ru, kk, en } })
  const w = mount(FileTranslateButton, {
    props: { caseId: 'c1', fileId: 'f1', fileName: 'invoice.xlsx' },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
  await w.find('[data-file-translate]').trigger('click')
  await flushPromises()
  const text = document.body.querySelector('[data-translate-error]')?.textContent ?? ''
  w.unmount()
  document.body.innerHTML = ''
  return text
}

describe('FileTranslateButton: отказ по коду', () => {
  it('частота запросов и «слишком большой файл» — на языке интерфейса, а не русским текстом сервера', async () => {
    expect(await openWithError('en', { error: SERVER_RU, code: 'rate' })).toContain(en.translate.errors.rate)
    expect(await openWithError('en', { error: SERVER_RU, code: 'rate' })).not.toContain('подождите')
    expect(await openWithError('kk', { error: 'Файл слишком большой…', code: 'tooLarge' }, 422)).toContain(kk.translate.errors.tooLarge)
    expect(await openWithError('ru', { error: 'Сервер занят', code: 'busy' }, 503)).toContain(ru.translate.errors.busy)
  })

  it('дневной лимит ИИ («limit») и частота («rate») — разные тексты', async () => {
    const daily = await openWithError('ru', { error: 'Дневной лимит…', code: 'limit' })
    const rate = await openWithError('ru', { error: SERVER_RU, code: 'rate' })
    expect(daily).toContain('попробуйте завтра')
    expect(rate).toContain('подождите минуту')
  })

  it('незнакомый код — текст сервера; без ответа — «нет связи»', async () => {
    expect(await openWithError('en', { error: 'Новый отказ сервера', code: 'somethingNew' }, 422)).toContain('Новый отказ сервера')
    tr.translate.mockReset().mockRejectedValue(new Error('network'))
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { ru, kk, en } })
    const w = mount(FileTranslateButton, { props: { caseId: 'c1', fileId: 'f1', fileName: 'a.pdf' }, attachTo: document.body, global: { plugins: [i18n] } })
    await w.find('[data-file-translate]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-translate-error]')?.textContent).toContain(en.translate.network)
    w.unmount()
    document.body.innerHTML = ''
  })

  it('у всех кодов есть текст в ru, kk и en', () => {
    const keys = Object.keys(ru.translate.errors).sort()
    expect(keys).toEqual(['alreadyRussian', 'busy', 'disabled', 'limit', 'modelError', 'noText', 'rate', 'tooLarge', 'unreadable'])
    expect(Object.keys(kk.translate.errors).sort()).toEqual(keys)
    expect(Object.keys(en.translate.errors).sort()).toEqual(keys)
  })
})

describe('FileTranslateButton: флаг', () => {
  it('по умолчанию перевод выключен — кнопки и окна нет', async () => {
    const actual = await vi.importActual<typeof import('@/config/features')>('@/config/features')
    expect(actual.FILE_TRANSLATE_ENABLED).toBe(false)
    feat.FILE_TRANSLATE_ENABLED = false
    try {
      const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
      const w = mount(FileTranslateButton, { props: { caseId: 'c1', fileId: 'f1', fileName: 'invoice.pdf', variant: 'icon' }, global: { plugins: [i18n] } })
      expect(w.find('[data-file-translate]').exists()).toBe(false)
      expect(w.html()).not.toContain('data-translate-modal')
      w.unmount()
    } finally {
      feat.FILE_TRANSLATE_ENABLED = true
    }
  })
})
