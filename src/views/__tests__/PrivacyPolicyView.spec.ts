import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { POLICY, POLICY_VERSION } from '@/views/privacy/policy'

const api = vi.hoisted(() => ({ operator: vi.fn() }))
vi.mock('@/api/privacy', () => ({ privacyApi: api }))

import PrivacyPolicyView from '../PrivacyPolicyView.vue'

// Политика конфиденциальности (30.10.2026): публичная страница — без входа, без роутера и стора.
let w: VueWrapper
afterEach(() => { w?.unmount(); vi.clearAllMocks() })

describe('PrivacyPolicyView', () => {
  it('текст политики, оператор и контакты из настроек организации', async () => {
    api.operator.mockResolvedValue({
      version: POLICY_VERSION, companyName: 'ТОО «AQNIET»', bin: '240640021012', legalAddress: 'г. Астана, ул. Тестовая, 1',
      phone: '+7 700 000 00 00', email: 'info@example.kz',
    })
    w = mountWithI18n(PrivacyPolicyView)
    await flushPromises()
    expect(w.get('h1').text()).toBe('Политика конфиденциальности и обработки персональных данных')
    expect(w.get('[data-privacy-edition]').text()).toBe('Редакция от 30 октября 2026 года')
    const op = w.get('[data-privacy-operator]').text()
    expect(op).toContain('ТОО «AQNIET»')
    expect(op).toContain('240640021012')
    expect(op).toContain('info@example.kz')
    expect(op).toContain('+7 700 000 00 00')
    expect(w.findAll('[data-privacy-section]')).toHaveLength(POLICY.ru.sections.length)
    expect(w.text()).toContain('Anthropic PBC (США)')
    expect(w.text()).toContain('№ 94-V «О персональных данных и их защите»')
  })

  it('настройки не ответили — название и БИН по умолчанию, без пустых строк', async () => {
    api.operator.mockRejectedValue(new Error('offline'))
    w = mountWithI18n(PrivacyPolicyView)
    await flushPromises()
    const op = w.get('[data-privacy-operator]')
    expect(op.text()).toContain('ТОО «AQNIET»')
    expect(op.text()).toContain('240640021012')
    expect(op.findAll('dt').map((d) => d.text())).toEqual(['БИН'])
  })

  it('у всех языков одинаковый состав разделов', () => {
    const ids = POLICY.ru.sections.map((s) => s.id)
    expect(POLICY.kk.sections.map((s) => s.id)).toEqual(ids)
    expect(POLICY.en.sections.map((s) => s.id)).toEqual(ids)
  })
})
