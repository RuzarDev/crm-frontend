import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Import40SvhFact } from '@/api/import40'
import { USERS } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ updateSvhFact: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<object>()), import40Api: api }))

import SvhFactCard from '../steps/SvhFactCard.vue'

const fact = (o: Partial<Import40SvhFact> = {}): Import40SvhFact => ({
  enteredAtUtc: '2026-10-18T04:00:00Z', leftAtUtc: '2026-10-20T06:00:00Z', factPackages: 90, factGrossKg: 1776.6, tariffPerDay: 5000,
  freeDays: 1, delayReason: 'customs', note: 'ждали досмотр', dtPackages: 94, dtGrossKg: 1776.6, packagesDiffer: true,
  weightDiffers: false, days: 3, paidDays: 2, demurrageKzt: 10000, ...o,
})

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('SvhFactCard', () => {
  it('факт против ДТ: места расходятся, вес сходится, платные сутки и простой, причина', () => {
    w = mountStep(SvhFactCard, { user: USERS.kpp, step: 4, kase: { status: 4, svhFact: fact() } }).w
    expect(w.get('[data-svh-fact-packages]').text()).toContain('по СВХ 90, по ДТ 94 — расходится')
    expect(w.get('[data-svh-fact-weight]').text()).not.toContain('расходится')
    expect(w.get('[data-svh-fact-stay]').text()).toContain('на СВХ 3 сут.')
    expect(w.get('[data-svh-fact-demurrage]').text().replace(/\s/g, ' ')).toMatch(/Платных суток: 2 \(бесплатных 1\) · 10 000/)
    expect(w.get('[data-svh-fact-reason]').text()).toBe('Причина простоя: таможня')
  })

  it('пусто — «Внести» у КПП; декларант подстраховывает, только пока КПП не назначен', () => {
    w = mountStep(SvhFactCard, { user: USERS.kpp, step: 2, kase: { status: 2 } }).w
    expect(w.find('[data-svh-fact-empty]').exists()).toBe(true)
    expect(w.get('[data-svh-fact-edit]').text()).toBe('Внести')
    w.unmount()
    // 30.10.2026: подстраховка КПП декларантом (решение владельца) — без назначенного КПП кнопка есть, с назначенным — нет.
    w = mountStep(SvhFactCard, { user: USERS.declarant, step: 2, kase: { status: 2 } }).w
    expect(w.find('[data-svh-fact-edit]').exists()).toBe(true)
    w.unmount()
    w = mountStep(SvhFactCard, { user: USERS.declarant, step: 2, kase: { status: 2, assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' } }).w
    expect(w.find('[data-svh-fact-edit]').exists()).toBe(false)
  })

  it('окно: сохраняет всё целиком и подставляет ответ сервера в заявку', async () => {
    const m = mountStep(SvhFactCard, { user: USERS.kpp, step: 2, kase: { status: 2 }, stubs: { ZModal: { props: ['open'], emits: ['ok'], template: '<div v-if="open" data-modal><slot /><button data-ok @click="$emit(\'ok\')">ok</button></div>' } } })
    w = m.w
    api.updateSvhFact.mockResolvedValue({ ...m.state.kase, svhFact: fact({ delayReason: null }) })
    await w.get('[data-svh-fact-edit]').trigger('click')
    await flushPromises()
    const pk = w.get('[data-svh-packages]')
    await (pk.element.tagName === 'INPUT' ? pk : pk.get('input')).setValue('90')
    await (pk.element.tagName === 'INPUT' ? pk : pk.get('input')).trigger('blur')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    const [id, body] = api.updateSvhFact.mock.calls[0]
    expect(id).toBe(m.state.kase.id)
    expect(body).toMatchObject({ enteredAtUtc: null, leftAtUtc: null, delayReason: null, note: null })
    expect(m.state.kase.svhFact?.factPackages).toBe(90)
  })
})
