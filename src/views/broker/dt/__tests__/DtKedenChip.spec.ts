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
import ZDate from '@/components/z/ZDate.vue'

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

  it('нет связи, а в КЕДЕН есть свободные ДТ того же поста и ±3 дня — кнопка «Найдено в КЕДЕН» открывает поиск с тем же фильтром', async () => {
    // Сервер: с подсказкой — найденные записи; без неё — 50 последних записей БИН клиента, где найденной может не быть.
    const recent = Array.from({ length: 50 }, (_, i) => cand({ id: `r${i}`, registrationNumber: `55201/011126/${String(i).padStart(7, '0')}` }))
    api.candidates.mockImplementation(async (_c: string, _d: string, query: { hint?: boolean }) =>
      query.hint ? [cand(), cand({ id: 'k8', linkedDeclarationId: 'other' }), cand({ id: 'k7', declarationType: 'PI' })] : recent)
    mountWith({ keden: unlinked, post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    expect(api.candidates).toHaveBeenCalledWith('c1', 'd1', { hint: true, post: '55302', from: '2026-10-17', to: '2026-10-23' })
    const btn = w.get('[data-dt-keden-suggest]')
    expect(btn.text()).toContain('Найдено в КЕДЕН: 1')
    await btn.trigger('click')
    await flushPromises()
    expect(api.candidates).toHaveBeenLastCalledWith('c1', 'd1', {
      q: undefined, bin: undefined, from: '2026-10-17', to: '2026-10-23', post: '55302', hint: true,
    })
    expect(q('[data-keden-candidate="k9"]')).not.toBeNull()
    expect(q('[data-keden-search-hint]')!.textContent).toContain('Свободные ДТ поста 55302')
    expect(q<HTMLInputElement>('input[data-keden-search-from]')!.value).toContain('17.10.2026')

    // «Показать все» — обычный поиск по умолчанию, фильтр снят.
    q<HTMLButtonElement>('[data-keden-search-hint-clear]')!.click()
    await flushPromises()
    expect(api.candidates).toHaveBeenLastCalledWith('c1', 'd1', { q: undefined, bin: undefined, from: undefined, to: undefined })
    expect(q('[data-keden-search-hint]')).toBeNull()
    expect(q('[data-keden-candidate="k9"]')).toBeNull()
    expect(q('[data-keden-candidate="r0"]')).not.toBeNull()
  })

  it('плашка подсказки: даты стёрли или поменяли — текст по датам, ушедшим в запрос, а не «±3 дн. от гр. А»', async () => {
    api.candidates.mockResolvedValue([cand()])
    mountWith({ keden: unlinked, post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    await w.get('[data-dt-keden-suggest]').trigger('click')
    await flushPromises()
    const banner = () => q('[data-keden-search-hint-text]')!.textContent ?? ''
    expect(banner()).toContain('±3 дн. от гр. А')
    const submit = async () => {
      q('[data-keden-search-find]')!.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
      await flushPromises()
    }

    const [fromDate, toDate] = w.findAllComponents(ZDate)
    fromDate.vm.$emit('update:value', null)
    toDate.vm.$emit('update:value', null)
    await nextTick()
    expect(banner()).toContain('±3 дн. от гр. А') // список ещё по окну подсказки — «Найти» не нажимали
    await submit()
    expect(api.candidates).toHaveBeenLastCalledWith('c1', 'd1', {
      q: undefined, bin: undefined, from: undefined, to: undefined, post: '55302', hint: true,
    })
    expect(banner()).not.toContain('±3')
    expect(banner()).toContain('Свободные ДТ поста 55302')
    expect(banner()).toContain('без ограничения по датам')

    fromDate.vm.$emit('update:value', '2026-10-01')
    toDate.vm.$emit('update:value', '2026-10-10')
    await submit()
    expect(api.candidates).toHaveBeenLastCalledWith('c1', 'd1', {
      q: undefined, bin: undefined, from: '2026-10-01', to: '2026-10-10', post: '55302', hint: true,
    })
    expect(banner()).toContain('регистрация 01.10.2026 – 10.10.2026')
    expect(banner()).not.toContain('±3')

    toDate.vm.$emit('update:value', null)
    await submit()
    expect(banner()).toContain('регистрация с 01.10.2026')

    // Вернули ровно окно подсказки — снова «±3 дн. от гр. А».
    fromDate.vm.$emit('update:value', '2026-10-17')
    toDate.vm.$emit('update:value', '2026-10-23')
    await submit()
    expect(banner()).toContain('±3 дн. от гр. А')
  })

  it('«Связать вручную» после подсказки — снова без фильтра подсказки', async () => {
    api.candidates.mockResolvedValue([cand()])
    mountWith({ keden: unlinked, post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    await w.get('[data-dt-keden-suggest]').trigger('click')
    await flushPromises()
    expect(q('[data-keden-search-hint]')).not.toBeNull()
    await openPanel()
    q<HTMLButtonElement>('[data-dt-keden-link]')!.click()
    await flushPromises()
    expect(api.candidates).toHaveBeenLastCalledWith('c1', 'd1', { q: undefined, bin: undefined, from: undefined, to: undefined })
    expect(q('[data-keden-search-hint]')).toBeNull()
  })

  it('кнопки-подсказки нет: связана, нет кандидатов, нет права, нет поста или даты', async () => {
    api.candidates.mockResolvedValue([])
    mountWith({ keden: unlinked, post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    expect(w.find('[data-dt-keden-suggest]').exists()).toBe(false)
    w.unmount()
    api.candidates.mockClear()
    api.candidates.mockResolvedValue([cand()])
    mountWith({ post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    expect(api.candidates).not.toHaveBeenCalled()
    expect(w.find('[data-dt-keden-suggest]').exists()).toBe(false)
    w.unmount()
    mountWith({ keden: unlinked, canLink: false, post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    expect(api.candidates).not.toHaveBeenCalled()
    w.unmount()
    mountWith({ keden: unlinked, post: '', submissionDate: '2026-10-20' })
    await flushPromises()
    w.unmount()
    mountWith({ keden: unlinked, post: '55302', submissionDate: null })
    await flushPromises()
    expect(api.candidates).not.toHaveBeenCalled()
  })

  it('ответ на устаревший запрос не применяется: сменили ДТ — считается по новой', async () => {
    let resolveOld!: (v: KedenCandidateDto[]) => void
    api.candidates
      .mockImplementationOnce(() => new Promise<KedenCandidateDto[]>((r) => { resolveOld = r }))
      .mockResolvedValueOnce([cand({ id: 'n1' }), cand({ id: 'n2' })])
    mountWith({ keden: unlinked, post: '55302', submissionDate: '2026-10-20' })
    await flushPromises()
    await w.setProps({ dtId: 'd2', submissionDate: '2026-10-21' })
    await flushPromises()
    expect(api.candidates).toHaveBeenLastCalledWith('c1', 'd2', { hint: true, post: '55302', from: '2026-10-18', to: '2026-10-24' })
    expect(w.get('[data-dt-keden-suggest]').text()).toContain('Найдено в КЕДЕН: 2')
    resolveOld([cand({ id: 'o1' }), cand({ id: 'o2' }), cand({ id: 'o3' })]) // поздний ответ по прежней ДТ
    await flushPromises()
    expect(w.get('[data-dt-keden-suggest]').text()).toContain('Найдено в КЕДЕН: 2')
  })

  it('отвязка нестрогой связи предупреждает, что номер вернётся к введённому', async () => {
    api.confirm.mockResolvedValue(false)
    mountWith({ keden: link({ source: 'fuzzy', numberOnUnlink: '25831' }) })
    await openPanel()
    q<HTMLButtonElement>('[data-dt-keden-unlink]')!.click()
    await flushPromises()
    expect(api.confirm.mock.calls[0][0].content).toContain('вернётся к введённому — 25831')
    expect(api.confirm.mock.calls[0][0].content).toContain('Коридор и дата выпуска, полученные из КЕДЕН, будут сняты')
    expect(api.unlink).not.toHaveBeenCalled()
  })
})
