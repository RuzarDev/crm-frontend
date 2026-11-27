import { describe, expect, it } from 'vitest'
import type { Import40ExtractionResult } from '@/api/import40'
import { historyHsCount } from '@/utils/historyHs'
import { mountWithI18n } from '@/test/mountWithI18n'
import ExtractionIssuesModal from '@/views/broker/case/steps/ExtractionIssuesModal.vue'
import DocsIntoDtModal from '../DocsIntoDtModal.vue'
import type { DocsIntoDtPlan } from '../docsIntoDt'

// История клиента (26.11.2026): позиции с кодом ТН ВЭД из истории — метка «проверьте» в сводке «Из документов» и в окне замечаний.
const ModalStub = { props: ['open', 'title'], template: '<div v-if="open" data-modal><slot /><slot name="footer" /></div>' }
const stubs = { ZModal: ModalStub, ZRadioGroup: true, ZButton: true }

const emptyPlan = {
  goods: { incoming: [], mode: 'fill', plan: { added: 1, updated: 0 }, targetIndex: [], conflicts: [], filled: 0 },
  doc44: { added: 0, filled: 0 },
  header: { groups: [] },
} as unknown as DocsIntoDtPlan

const extracted = (flags: boolean[]): Pick<Import40ExtractionResult, 'extras'> => ({
  extras: { goods: flags.map((f) => ({ hsFromHistory: f })) },
})

describe('код из истории клиента', () => {
  it('historyHsCount считает позиции с hsFromHistory; старый сервер и пусто — 0', () => {
    expect(historyHsCount(extracted([true, false, true]))).toBe(2)
    expect(historyHsCount({ extras: null })).toBe(0)
    expect(historyHsCount({ extras: { goods: [{}, { hsFromHistory: false }] } })).toBe(0)
    expect(historyHsCount(null)).toBe(0)
  })

  it('сводка «Из документов»: строка «проверьте» только когда есть позиции из истории', () => {
    const mount = (historyHs?: number) => mountWithI18n(DocsIntoDtModal, {
      props: { open: true, plan: emptyPlan, remarks: [], conflicts: [], mode: 'fill', existingGoods: 0, historyHs },
      global: { stubs },
    })
    const none = mount()
    expect(none.find('[data-docs-into-history-hs]').exists()).toBe(false)
    const some = mount(2)
    expect(some.get('[data-docs-into-history-hs]').text()).toBe('Код ТН ВЭД подобран по истории клиента у позиций: 2 — проверьте')
  })

  it('окно замечаний новой ДТ: показывает метку при historyHs', () => {
    const w = mountWithI18n(ExtractionIssuesModal, {
      props: { open: true, issues: { warnings: [], conflicts: [], historyHs: 3 } },
      global: { stubs },
    })
    expect(w.get('[data-issues-history-hs]').text()).toContain('3')
    const off = mountWithI18n(ExtractionIssuesModal, { props: { open: true, issues: { warnings: [], conflicts: [] } }, global: { stubs } })
    expect(off.find('[data-issues-history-hs]').exists()).toBe(false)
  })
})

describe('догадка кода Zircon AI (hs_guess, 27.11.2026)', () => {
  it('сводка «Из документов» и окно замечаний показывают строку только когда она есть', () => {
    const line = 'Кода ТН ВЭД нет в документах — Zircon AI предполагает: «Автомобиль» — 8703 23.'
    const into = (hsGuess?: string | null) => mountWithI18n(DocsIntoDtModal, {
      props: { open: true, plan: emptyPlan, remarks: [], conflicts: [], mode: 'fill', existingGoods: 0, hsGuess },
      global: { stubs },
    })
    expect(into(null).find('[data-docs-into-hs-guess]').exists()).toBe(false)
    expect(into(line).get('[data-docs-into-hs-guess]').text()).toBe(line)
    const issues = mountWithI18n(ExtractionIssuesModal, {
      props: { open: true, issues: { warnings: [], conflicts: [], hsGuess: [line, `Вагон 2: ${line}`] } }, global: { stubs },
    })
    expect(issues.findAll('[data-issues-hs-guess]').map((p) => p.text())).toEqual([line, `Вагон 2: ${line}`])
  })
})
