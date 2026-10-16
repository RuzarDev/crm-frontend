import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import type { EecCodeChange, EecEditionDetail } from '@/api/tnvedEec'

const api = vi.hoisted(() => ({
  edition: vi.fn(), apply: vi.fn(), reject: vi.fn(), restage: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/tnvedEec', () => ({ tnvedEecApi: api }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import EecEditionPage from '../EecEditionPage.vue'

const ModalStub = {
  props: ['open', 'title'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}

const state = (rateText: string, refs: string[] = [], name = '– – бензин') => ({ rateText, kedenRate: null, footnoteRefs: refs, addUnit: null, nameRu: name })
const change = (code: string, kind: string, before: ReturnType<typeof state> | null, after: ReturnType<typeof state> | null): EecCodeChange =>
  ({ code, kind, before, after, kedenRate: '5%' })
const detail = (o: { status?: string; kind?: 'group' | 'ettNotes'; reason?: string; from?: number } = {}): EecEditionDetail => ({
  edition: {
    id: 3, kind: o.kind ?? 'group', group: o.kind === 'ettNotes' ? null : '22', fileName: 'ru.22_2022_01.10.2026.pdf', editionDate: '2026-10-01',
    status: (o.status ?? 'held') as never, stagedAtUtc: '2026-10-16T03:00:00Z', appliedAtUtc: null, statusChangedAtUtc: '2026-10-16T03:00:02Z',
    statusChangedBy: 'system', statusReason: o.reason ?? 'ушло 7 % кодов', restagedFromEditionId: o.from ?? null, isClean: false, leafCount: 120, unparsedCount: 1, addedCount: 1, removedCount: 9, changedCount: 2,
  },
  diff: {
    editionId: 3, kind: o.kind ?? 'group', group: '22', baselineEditionId: 1, isBaseline: false, codesBefore: 128, codesAfter: 120,
    codes: [
      change('2203000100', 'rate', state('5'), state('0', ['109С'])),
      change('2203000900', 'added', null, state('10', [], '– – прочее пиво')),
      change('2204100000', 'removed', state('12,5'), null),
      change('2205100000', 'footnotes, unit', state('5'), state('5', ['12'])),
    ],
    newTreeCodes: ['2203000900'], endedInTree: [], missingFootnoteRefs: ['12'], unrecognizedRates: 0, unparsed: 1,
    footnotes: o.kind === 'ettNotes' ? [{ number: '109С', kind: 'changed', before: 'до 31.12.2026', after: 'до 31.12.2028', codes: 14 }] : [],
    newDecisions: [], added: 1, removed: 1, changed: 2, rateChanged: 1, removedShare: 0.0703,
  },
  report: { unparsed: [{ page: 4, reason: 'rate-not-recognized', text: '2203 00 010 0 бензин 12,588С)' }], pageCount: 9, detectedGroup: '22', footnoteFlags: null },
  suspicionReasons: ['ушло кодов 7 % > 5 %'],
})

let w: VueWrapper
let router: Router
const mountAt = async (id = 3) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  await router.push(`/tnved/eec/editions/${id}`)
  await router.isReady()
  w = mountWithI18n(EecEditionPage, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZModal: ModalStub } } })
  await flushPromises()
}

beforeEach(() => {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/tnved/eec/editions/:id', component: { template: '<div/>' } },
    { path: '/:p(.*)*', component: { template: '<div/>' } },
  ] })
  api.edition.mockResolvedValue({ data: detail() })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('EecEditionPage', () => {
  it('шапка, причины отложения, счётчики, изменения кодов «было → станет» и КЕДЕН', async () => {
    await mountAt()
    expect(api.edition).toHaveBeenCalledWith(3)
    expect(w.get('[data-eec-ed-title]').text()).toBe('Группа 22')
    expect(w.get('[data-eec-ed-status]').text()).toBe('Ждёт подтверждения')
    expect(w.get('[data-eec-ed-date]').text()).toBe('редакция от 01.10.2026')
    expect(w.get('[data-eec-ed-reasons]').text()).toContain('Почему ждёт подтверждения')
    expect(w.findAll('[data-eec-ed-reason]').map((r) => r.text())).toEqual(['ушло кодов 7 % > 5 %'])
    expect(w.get('[data-stat="codes"] dd').text()).toBe('128 → 120')
    expect(w.get('[data-stat="removed"] dd').text()).toBe('1 (7%)')
    const first = w.get('[data-code="2203000100"]').element.closest('tr')!
    expect(first.querySelector('[data-eec-ed-before]')!.textContent).toBe('5')
    expect(first.querySelector('[data-eec-ed-after]')!.textContent).toBe('0 · сн. 109С')
    expect(first.querySelector('[data-eec-ed-keden]')!.textContent).toBe('5%')
    expect(w.findAll('[data-eec-ed-kind]')[3].findAll('[data-flag]').map((f) => f.text())).toEqual(['сноски', 'единица'])
    expect(w.get('[data-eec-ed-list="newTreeCodes"]').text()).toContain('Новые коды в дереве: 1')
    expect(w.get('[data-eec-ed-list="missingFootnoteRefs"]').text()).toContain('12')
    expect(w.get('[data-eec-ed-unparsed]').text()).toContain('Ставка не распознана')
  })

  it('фильтр изменений — только виды, которые есть; поиск по коду', async () => {
    await mountAt()
    const filters = w.get('[data-eec-ed-filter]').findAll('button')
    expect(filters.map((b) => b.text())).toEqual(['Все 4', 'Ставка 1', 'Новые 1', 'Ушли 1', 'Сноски 1', 'Единица 1'])
    await filters[2].trigger('click')
    expect(w.findAll('[data-code]').map((c) => c.attributes('data-code'))).toEqual(['2203000900'])
    await filters[0].trigger('click')
    const input = w.get('section input[type="search"]')
    await input.setValue('2204')
    expect(w.findAll('[data-code]').map((c) => c.attributes('data-code'))).toEqual(['2204100000'])
  })

  it('«Подтвердить и применить»: комментарий уходит на сервер, итог применения, карточка перечитана', async () => {
    await mountAt()
    await w.get('[data-eec-ed-apply]').trigger('click')
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Применить: Группа 22?')
    await w.get('[data-eec-modal-note]').setValue('проверил вручную')
    api.apply.mockResolvedValue({ data: {
      editionId: 3, ratesAdded: 1, ratesChanged: 2, ratesRemoved: 9, ratesReturned: 0, treeNodesAdded: 1, treeLeavesEnded: 9,
      footnotesAdded: 0, footnotesChanged: 0, footnotesRemoved: 0, decisionsRegistered: 0, warnings: ['сноска 12 не найдена'], treeLeavesReopened: 0, addedLeafCodes: [],
    } })
    api.edition.mockResolvedValue({ data: detail({ status: 'applied' }) })
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.apply).toHaveBeenCalledWith(3, 'проверил вручную')
    expect(api.toast.success).toHaveBeenCalledWith('Группа 22: редакция применена')
    expect(w.get('[data-eec-ed-result]').text()).toContain('Изменено ставок: 2, добавлено кодов: 1, ушло: 9. В дереве — новых узлов: 1, закрыто: 9.')
    expect(w.get('[data-eec-ed-warnings]').text()).toBe('сноска 12 не найдена')
    expect(w.get('[data-eec-ed-status]').text()).toBe('Применена')
    expect(w.find('[data-eec-ed-apply]').exists()).toBe(false)
  })

  it('«Отклонить» с причиной; 409 — окно остаётся', async () => {
    await mountAt()
    await w.get('[data-eec-ed-reject]').trigger('click')
    api.reject.mockRejectedValueOnce(Object.assign(new Error('409'), { response: { status: 409 } }))
    await w.get('[data-eec-modal-note]').setValue('сбой колонок')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.find('[data-modal]').exists()).toBe(true)
    api.reject.mockResolvedValueOnce({ data: undefined })
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.reject).toHaveBeenLastCalledWith(3, 'сбой колонок')
    expect(w.find('[data-modal]').exists()).toBe(false)
  })

  it('применённая — без кнопок; примечания — таблица сносок вместо кодов', async () => {
    api.edition.mockResolvedValue({ data: detail({ status: 'applied', kind: 'ettNotes' }) })
    await mountAt()
    expect(w.get('[data-eec-ed-title]').text()).toBe('Примечания к ЕТТ')
    expect(w.find('[data-eec-ed-apply]').exists()).toBe(false)
    expect(w.find('[data-eec-ed-codes]').exists()).toBe(false)
    expect(w.get('[data-eec-ed-footnotes]').text()).toContain('до 31.12.2028')
  })

  it('404 — «Редакция не найдена»', async () => {
    api.edition.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    await mountAt(99)
    expect(w.get('[data-eec-ed-not-found]').text()).toContain('Редакция не найдена')
  })

  it('отложенная: «Отклонить» с пояснением, что это окончательно; «Повторно разобрать» — подтверждение и переход к новой', async () => {
    await mountAt()
    expect(w.get('[data-eec-ed-reject-hint]').text()).toContain('Отклонение окончательно для этой редакции')
    await w.get('[data-eec-ed-restage]').trigger('click')
    expect(confirmState.title).toBe('Разобрать файл заново?')
    api.restage.mockResolvedValue({ data: { editionId: 8, fromEditionId: 3, status: 'staged', suspicionReasons: [] } })
    confirmState.resolve(true)
    await flushPromises()
    expect(api.restage).toHaveBeenCalledWith(3)
    expect(api.toast.success).toHaveBeenCalledWith('Создана новая редакция №8')
    expect(router.currentRoute.value.path).toBe('/tnved/eec/editions/8')
    expect(api.edition).toHaveBeenLastCalledWith(8)
  })

  it('не разобрана: причина, без сравнения и без «Подтвердить/Отклонить» — только «Повторно разобрать»', async () => {
    api.edition.mockResolvedValue({ data: detail({ status: 'parseFailed', reason: 'файл не разобран: нет таблицы' }) })
    await mountAt()
    expect(w.get('[data-eec-ed-status]').text()).toBe('Не разобрана')
    expect(w.get('[data-eec-ed-reasons]').text()).toContain('Файл не разобран')
    expect(w.find('[data-eec-ed-stats]').exists()).toBe(false)
    expect(w.find('[data-eec-ed-codes]').exists()).toBe(false)
    expect(w.find('[data-eec-ed-apply]').exists()).toBe(false)
    expect(w.find('[data-eec-ed-reject]').exists()).toBe(false)
    expect(w.find('[data-eec-ed-restage]').exists()).toBe(true)
  })

  it('отклонённая — «Повторно разобрать»; новая редакция ссылается на исходную', async () => {
    api.edition.mockResolvedValue({ data: detail({ status: 'rejected' }) })
    await mountAt()
    expect(w.find('[data-eec-ed-restage]').exists()).toBe(true)
    expect(w.find('[data-eec-ed-apply]').exists()).toBe(false)
    w.unmount()
    api.edition.mockResolvedValue({ data: detail({ status: 'staged', from: 3 }) })
    await mountAt(8)
    expect(w.get('[data-eec-ed-origin]').text()).toBe('Повторный разбор файла редакции №3')
    expect(w.get('[data-eec-ed-origin] a').attributes('href')).toBe('/tnved/eec/editions/3')
    expect(w.find('[data-eec-ed-restage]').exists()).toBe(false)
  })
})
