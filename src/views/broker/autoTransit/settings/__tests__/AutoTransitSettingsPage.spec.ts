import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { AutoTransitSettings } from '@/api/autoTransit'
import { useAuthStore } from '@/stores/auth'
import { ComboStub, SelectStub } from '@/views/broker/transit/record/sections/__tests__/harness'

const api = vi.hoisted(() => ({ getSettings: vi.fn(), saveSettings: vi.fn() }))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

import AutoTransitSettingsPage from '../AutoTransitSettingsPage.vue'

// Значения по умолчанию — из контракта (план 2026-11-25): основание 103, шесть строк шаблона гр. 44.
const DEFAULTS = (): AutoTransitSettings => ({
  guaranteeTypeCode: null, guaranteeBasisCode: '103', aeoCertificateNumber: null, aeoCertificateDate: null,
  doc44Template: [
    { code: '02015', name: 'CMR', fileKind: 'cmr' },
    { code: '04021', name: 'Инвойс', fileKind: 'invoice' },
    { code: '04131', name: 'Упаковочный лист', fileKind: 'packing' },
    { code: '09011', name: 'Свидетельство УЭО', fileKind: null },
    { code: '11005', name: 'Договор транспортной экспедиции', fileKind: null },
    { code: '10022', name: 'Паспорт водителя', fileKind: 'passport' },
  ],
})

let w: VueWrapper
const mountAs = async (perms: string[]) => {
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = perms
  w = mountWithI18n(AutoTransitSettingsPage, { attachTo: document.body, global: { stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } } })
  await flushPromises()
}
const setInput = async (sel: string, v: string) => {
  const el = w.get(sel)
  const input = el.element.tagName === 'INPUT' ? el : el.get('input')
  await input.setValue(v)
}

beforeEach(() => {
  setActivePinia(createPinia())
  api.getSettings.mockResolvedValue(DEFAULTS())
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('AutoTransitSettingsPage', () => {
  it('показывает обеспечение и шаблон гр. 44 из ответа', async () => {
    await mountAs(['autotransit.read', 'autotransit.manage'])
    expect(w.get('h1').text()).toBe('Авто-транзит')
    expect((w.get('[data-f="guaranteeBasisCode"]').element as HTMLInputElement).value).toBe('103')
    const rows = w.findAll('[data-doc44-row]')
    expect(rows).toHaveLength(6)
    expect((rows[0]!.get('[data-f="code"]').element as HTMLInputElement).value).toBe('02015')
    expect(rows[0]!.get('[data-f="fileKind"]').attributes('data-value')).toBe('cmr')
    expect(rows[3]!.get('[data-f="fileKind"]').attributes('data-value')).toBe('')
    expect(w.get('[data-settings-save]').attributes('disabled')).toBeDefined()
  })

  it('правка и сохранение: PUT целиком, без лишних пробелов; тост', async () => {
    await mountAs(['autotransit.read', 'autotransit.manage'])
    await setInput('[data-f="aeoCertificateNumber"]', ' KZ/УЭО/0001 ')
    await w.get('[data-doc44-row]:last-child [data-doc44-delete]').trigger('click')
    const saved = { ...DEFAULTS(), aeoCertificateNumber: 'KZ/УЭО/0001' }
    api.saveSettings.mockResolvedValue(saved)
    await w.get('[data-settings-form]').trigger('submit')
    await flushPromises()
    const body = api.saveSettings.mock.calls[0]![0] as AutoTransitSettings
    expect(body.aeoCertificateNumber).toBe('KZ/УЭО/0001')
    expect(body.guaranteeBasisCode).toBe('103')
    expect(body.doc44Template.map((d) => d.code)).toEqual(['02015', '04021', '04131', '09011', '11005'])
    expect(msg.success).toHaveBeenCalledWith('Настройки авто-транзита сохранены')
  })

  it('код вида не из 5 цифр или пустое название — ошибка под строкой, запрос не уходит', async () => {
    await mountAs(['autotransit.read', 'autotransit.manage'])
    await w.get('[data-doc44-add]').trigger('click')
    const last = () => w.findAll('[data-doc44-row]').at(-1)!
    await last().get('[data-f="code"]').setValue('123')
    await w.get('[data-settings-form]').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).not.toHaveBeenCalled()
    expect(last().text()).toContain('Код вида — 5 цифр')
    expect(last().text()).toContain('Введите название')
  })

  it('без права manage — только чтение', async () => {
    await mountAs(['autotransit.read'])
    expect(w.find('[data-settings-readonly]').exists()).toBe(true)
    expect(w.find('[data-settings-save]').exists()).toBe(false)
    expect(w.find('[data-doc44-add]').exists()).toBe(false)
    expect(w.get('[data-f="guaranteeBasisCode"]').attributes('disabled')).toBeDefined()
  })

  it('сбой загрузки — сообщение и «Повторить»', async () => {
    api.getSettings.mockRejectedValueOnce(new Error('net'))
    await mountAs(['autotransit.manage'])
    expect(w.find('[data-settings-error]').exists()).toBe(true)
    await w.get('[data-settings-retry]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-doc44-row]')).toHaveLength(6)
  })
  it('ревью M7: вид файла модуля (packingList) показывается и сохраняется как есть', async () => {
    api.getSettings.mockResolvedValue({ ...DEFAULTS(), doc44Template: [{ code: '04131', name: 'Упаковочный', fileKind: 'packingList' }] })
    await mountAs(['autotransit.read', 'autotransit.manage'])
    const sel = w.get('[data-doc44-row] [data-f="fileKind"]')
    expect(sel.attributes('data-value')).toBe('packingList')
    expect(sel.get('[data-option="packingList"]').text()).toBe('Упаковочный лист')
    await setInput('[data-f="aeoCertificateNumber"]', 'N1')
    api.saveSettings.mockResolvedValue(DEFAULTS())
    await w.get('[data-settings-form]').trigger('submit')
    await flushPromises()
    expect((api.saveSettings.mock.calls[0]![0] as AutoTransitSettings).doc44Template[0]!.fileKind).toBe('packingList')
  })

  it('ревью M1: общий ключ doc44Template и ключи строк сервера видны; больше 30 строк не добавить', async () => {
    await mountAs(['autotransit.read', 'autotransit.manage'])
    await setInput('[data-f="aeoCertificateNumber"]', 'N1')
    api.saveSettings.mockRejectedValue(Object.assign(new Error('400'), { response: { status: 400, data: { errors: {
      doc44Template: ['Не больше 30 документов в шаблоне.'], 'doc44Template.1.fileKind': ['Неизвестный вид файла «x».'],
    } } } }))
    await w.get('[data-settings-form]').trigger('submit')
    await flushPromises()
    expect(w.get('[data-doc44-error]').text()).toBe('Не больше 30 документов в шаблоне.')
    expect(w.findAll('[data-doc44-row]')[1]!.text()).toContain('Неизвестный вид файла «x».')
    for (let i = 0; i < 30; i++) {
      const add = w.find('[data-doc44-add]')
      if (add.attributes('disabled') !== undefined) break
      await add.trigger('click')
    }
    expect(w.findAll('[data-doc44-row]')).toHaveLength(30)
    expect(w.get('[data-doc44-add]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Не больше 30 строк')
  })

  it('ревью M4: 409 conflict — свой текст', async () => {
    await mountAs(['autotransit.read', 'autotransit.manage'])
    await setInput('[data-f="aeoCertificateNumber"]', 'N1')
    api.saveSettings.mockRejectedValue(Object.assign(new Error('409'), { response: { status: 409, data: { code: 'conflict' } } }))
    await w.get('[data-settings-form]').trigger('submit')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('Настройки только что сохранил другой пользователь. Обновите страницу и повторите.')
  })
})

