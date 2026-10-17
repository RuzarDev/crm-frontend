import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { KedenCandidateDto, KedenLinkDto } from '@/api/kedenLink'

const api = vi.hoisted(() => ({ candidates: vi.fn(), link: vi.fn(), unlink: vi.fn(), confirm: vi.fn() }))
vi.mock('@/api/kedenLink', async (orig) => ({
  ...(await orig<object>()),
  kedenLinkApi: { candidates: api.candidates, link: api.link, unlink: api.unlink },
}))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import DtKedenChip from '../DtKedenChip.vue'

const link = (o: Partial<KedenLinkDto> = {}): KedenLinkDto => ({
  linked: true, kedenDeclarationId: 'k1', source: 'number', linkedAtUtc: '2026-10-17T08:00:00Z',
  registrationNumber: '55302/171026/0000001', statusCode: 'X', statusName: 'Выпущена', statusKind: 'released',
  statusAtUtc: '2026-10-17T09:00:00Z', corridor: 'yellow', dhtNumber: null, numberConflict: null, ...o,
})
const unlinked: KedenLinkDto = {
  linked: false, kedenDeclarationId: null, source: null, linkedAtUtc: null, registrationNumber: null, statusCode: null,
  statusName: null, statusKind: null, statusAtUtc: null, corridor: null, dhtNumber: null, numberConflict: null,
}
const cand = (o: Partial<KedenCandidateDto> = {}): KedenCandidateDto => ({
  id: 'k9', declarationType: 'DT', registrationNumber: '55302/171026/0000009', statusName: 'Зарегистрирована',
  statusDateTimeUtc: null, registeredDateTimeUtc: '2026-10-16T09:00:00Z', declarantXin: '123456789012', declarantName: 'ТОО',
  customsPost: '55302', linkedDeclarationId: null, linkedCaseNumber: null, ...o,
})

let w: VueWrapper
afterEach(() => { w?.unmount(); vi.clearAllMocks(); document.body.innerHTML = '' })
const mountWith = (props: Record<string, unknown>) => {
  w = mountWithI18n(DtKedenChip, { props: { caseId: 'c1', dtId: 'd1', keden: link(), canLink: true, ...props }, attachTo: document.body })
  return w
}
const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)
const openPanel = async () => {
  await w.get('[data-dt-keden-chip]').trigger('click')
  await nextTick(); await nextTick()
}

describe('DtKedenChip', () => {
  it('чип: статус КЕДЕН и тон; без связи — «нет связи»', () => {
    mountWith({})
    expect(w.get('[data-dt-keden-status]').text()).toBe('Выпущена')
    expect(w.get('[data-dt-keden-chip]').attributes('data-keden-tone')).toBe('done')
    w.unmount()
    mountWith({ keden: null })
    expect(w.get('[data-dt-keden-status]').text()).toBe('нет связи')
    expect(w.get('[data-dt-keden-chip]').attributes('data-keden-tone')).toBe('neutral')
  })

  it('окно: дата, коридор, ДХТ подписан пустым, конфликт номера', async () => {
    mountWith({ keden: link({ numberConflict: '55302/171026/0000777' }) })
    await openPanel()
    expect(q('[data-dt-keden-row="corridor"]')!.textContent).toBe('жёлтый')
    expect(q('[data-dt-keden-row="dht"]')!.textContent).toBe('КЕДЕН не передаёт')
    expect(q('[data-dt-keden-row="reg"]')!.textContent).toBe('55302/171026/0000001')
    expect(q('[data-dt-keden-row="how"]')!.textContent).toContain('по рег. номеру')
    expect(q('[data-dt-keden-conflict]')!.textContent).toContain('55302/171026/0000777')
  })

  it('без права — без кнопок связи', async () => {
    mountWith({ canLink: false, keden: unlinked })
    await openPanel()
    expect(q('[data-dt-keden-unlinked]')).not.toBeNull()
    expect(q('[data-dt-keden-link]')).toBeNull()
  })

  it('отвязать — после подтверждения, событие changed', async () => {
    api.confirm.mockResolvedValue(true)
    api.unlink.mockResolvedValue(unlinked)
    mountWith({})
    await openPanel()
    q<HTMLButtonElement>('[data-dt-keden-unlink]')!.click()
    await flushPromises()
    expect(api.unlink).toHaveBeenCalledWith('c1', 'd1')
    expect(w.emitted('changed')?.[0]).toEqual([unlinked])
    expect(w.get('[data-dt-keden-status]').text()).toBe('нет связи')
  })

  it('связать вручную: поиск по умолчанию, занятая другой ДТ — недоступна, выбор → link', async () => {
    api.candidates.mockResolvedValue([cand(), cand({ id: 'k8', linkedDeclarationId: 'other', linkedCaseNumber: 'ИМ-2026-0001' })])
    api.link.mockResolvedValue(link({ kedenDeclarationId: 'k9', source: 'manual' }))
    mountWith({ keden: unlinked })
    await openPanel()
    q<HTMLButtonElement>('[data-dt-keden-link]')!.click()
    await flushPromises()
    expect(api.candidates).toHaveBeenCalledWith('c1', 'd1', { q: undefined, bin: undefined, from: undefined, to: undefined })
    const taken = q('[data-keden-candidate="k8"]')!
    expect(taken.textContent).toContain('уже связана с заявкой ИМ-2026-0001')
    expect(taken.querySelector<HTMLButtonElement>('[data-keden-candidate-pick]')!.disabled).toBe(true)
    q('[data-keden-candidate="k9"]')!.querySelector<HTMLButtonElement>('[data-keden-candidate-pick]')!.click()
    await flushPromises()
    expect(api.link).toHaveBeenCalledWith('c1', 'd1', 'k9')
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.get('[data-dt-keden-status]').text()).toBe('Выпущена')
  })
})
