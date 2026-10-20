import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import type { AiTnvedCode, AiTnvedSuggestResponse } from '@/api/aiTnved'

const api = vi.hoisted(() => ({ suggest: vi.fn(), select: vi.fn(), status: vi.fn(), settings: vi.fn(), saveSettings: vi.fn(), stats: vi.fn() }))
vi.mock('@/api/aiTnved', async (orig) => ({ ...(await orig<typeof import('@/api/aiTnved')>()), aiTnvedApi: api }))
const tnved = vi.hoisted(() => ({ classify: vi.fn(), semantic: vi.fn() }))
vi.mock('@/api/tnved', async (orig) => ({ ...(await orig<typeof import('@/api/tnved')>()), tnvedApi: tnved }))

import AiTnvedPanel from '../AiTnvedPanel.vue'
import { collectQuestions, confidencePct, confidenceTone, vatKey } from '../aiTnved'

const code = (over: Partial<AiTnvedCode> = {}): AiTnvedCode => ({
  code: '8413708100',
  name: 'насосы центробежные одноступенчатые',
  path: [{ code: '84', name: 'Реакторы, котлы' }, { code: '8413', name: 'Насосы жидкостные' }, { code: '8413708100', name: 'одноступенчатые' }],
  confidence: 0.86,
  opi: 'ОПИ 1 и 6',
  reasoning: 'Центробежный насос для воды',
  differences: 'Одна ступень, в отличие от многоступенчатых',
  questions: ['Мощность двигателя?'],
  fromHistory: true,
  clientHistory: false,
  info: {
    dutyRate: '0%', vtoRate: null, vatStatus: 'none', vatGoods: [], excise: [], antiDumping: ['20% — КИТАЙ'],
    measures: [{ docType: 'RESTRICTION', name: 'Сертификат ЕАЭС', comment: null, resolutionNumber: null, resolutionName: null, resolutionUrl: null }],
    marking: ['Подлежит маркировке с 01.01.2027'], bans: [], unit: 'шт',
  },
  ...over,
})
const answer = (over: Partial<AiTnvedSuggestResponse> = {}): AiTnvedSuggestResponse => ({
  suggestionId: 's1', aiUsed: true, unavailable: null, fromCache: false, model: 'claude-sonnet-5-5',
  suggestions: [code(), code({ code: '8413708200', confidence: 0.4, fromHistory: false, questions: ['Мощность двигателя?', 'Материал корпуса?'] })],
  questions: ['Для бытовых нужд?'], fallback: [], ...over,
})

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
const mount = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(AiTnvedPanel, { props: { initialDescription: 'насос центробежный для воды', source: 'dt', caseId: 'c1', ...props }, attachTo: document.body })
  await flushPromises()
}
const run = async () => {
  await w.get('form').trigger('submit')
  await flushPromises()
}

describe('AiTnvedPanel', () => {
  it('пока ИИ думает — сразу варианты по смыслу, с отметкой «уже выбирали»; поиск по словам не нужен', async () => {
    tnved.semantic.mockResolvedValue({ data: { available: true, model: 'e5', tookMs: 40, matches: [
      { code: '6109100000', description: 'Майки, фуфайки трикотажные', score: 0.86, rateStr: '1,75 EUR/кг', unitName: null, fromHistory: true, path: [] },
      { code: '6109909000', description: 'Майки из прочих материалов', score: 0.81, rateStr: null, unitName: null, fromHistory: false, path: [] },
    ] } })
    api.suggest.mockReturnValue(new Promise<AiTnvedSuggestResponse>(() => {}))
    await mount({ initialDescription: 'футболка хлопковая' })
    await run()
    await flushPromises()
    expect(tnved.semantic).toHaveBeenCalledWith('футболка хлопковая', 8, { silent: true })
    expect(tnved.classify).not.toHaveBeenCalled()
    expect(w.get('[data-ai-quick-kind]').text()).toBe('Пока ИИ думает — похожие по смыслу')
    expect(w.get('[data-ai-quick-row="6109100000"] [data-ai-quick-history]').text()).toBe('уже выбирали')
    expect(w.find('[data-ai-quick-row="6109909000"] [data-ai-quick-history]').exists()).toBe(false)
    await w.get('[data-ai-quick-row="6109909000"] [data-ai-quick-select]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([{ code: '6109909000', name: 'Майки из прочих материалов' }])
  })

  it('смыслового поиска нет на сервере или он упал — варианты по словам', async () => {
    tnved.semantic.mockRejectedValueOnce(new Error('404'))
    tnved.classify.mockResolvedValue({ data: { matches: [{ code: '8413708100', description: 'насосы центробежные', rateStr: null }] } })
    api.suggest.mockReturnValue(new Promise<AiTnvedSuggestResponse>(() => {}))
    await mount()
    await run()
    await flushPromises()
    expect(w.get('[data-ai-quick-kind]').text()).toBe('Пока ИИ думает — варианты по словам')
    expect(w.find('[data-ai-quick-row="8413708100"]').exists()).toBe(true)
  })

  it('пока ИИ думает — сразу варианты по словам, их можно выбрать', async () => {
    tnved.semantic.mockResolvedValue({ data: { available: false, model: null, tookMs: 0, matches: [] } })
    tnved.classify.mockResolvedValue({ data: { matches: [{ code: '6109100000', description: 'из хлопчатобумажной пряжи', rateStr: '1,75 EUR/кг' }] } })
    let finish!: (v: AiTnvedSuggestResponse) => void
    api.suggest.mockReturnValue(new Promise<AiTnvedSuggestResponse>((r) => { finish = r }))
    await mount()
    await run()
    await flushPromises()
    expect(tnved.classify).toHaveBeenCalledWith('насос центробежный для воды', 8, { silent: true })
    const row = w.get('[data-ai-quick-row="6109100000"]')
    expect(row.text()).toContain('6109 10 000 0')
    await row.get('[data-ai-quick-select]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([{ code: '6109100000', name: 'из хлопчатобумажной пряжи' }])
    finish(answer())
    await flushPromises()
    expect(w.find('[data-ai-quick]').exists()).toBe(false)
  })

  it('надпись «Подсказка ИИ — код выбирает декларант» видна всегда', async () => {
    await mount()
    expect(w.get('[data-ai-disclaimer]').text()).toContain('Подсказка ИИ — код выбирает декларант')
  })

  it('карточки: код и путь, уверенность, обоснование, пошлина, НДС, антидемпинг, маркировка, меры', async () => {
    api.suggest.mockResolvedValue(answer())
    await mount()
    await run()
    expect(api.suggest).toHaveBeenCalledWith(expect.objectContaining({ description: 'насос центробежный для воды', source: 'dt', caseId: 'c1', answers: null }))
    expect(w.get('[data-ai-result-disclaimer]').text()).toBe('Подсказка ИИ — код выбирает декларант.')
    const card = w.get('[data-ai-card="8413708100"]')
    expect(card.get('[data-ai-code]').text()).toBe('8413 70 810 0')
    expect(card.get('[data-ai-path]').text()).toBe('84 Реакторы, котлы → 8413 Насосы жидкостные')
    expect(card.get('[data-ai-confidence]').text()).toBe('уверенность 86%')
    expect(card.get('[data-ai-history]').text()).toContain('уже выбирали')
    expect(card.get('[data-ai-reasoning]').text()).toContain('Центробежный насос для воды (ОПИ 1 и 6)')
    expect(card.get('[data-ai-differences]').text()).toContain('Одна ступень')
    expect(card.get('[data-ai-duty]').text()).toContain('0%')
    expect(card.get('[data-ai-vat]').text()).toContain('16%')
    expect(card.get('[data-ai-antidumping]').text()).toContain('20% — КИТАЙ')
    expect(card.get('[data-ai-marking]').text()).toContain('маркировке')
    expect(card.get('[data-ai-measures]').text()).toContain('Сертификат ЕАЭС')
    expect(card.find('[data-ai-bans]').exists()).toBe(false)
  })

  it('уточняющие вопросы — полями без повторов; ответы уходят в повторный запрос', async () => {
    api.suggest.mockResolvedValue(answer())
    await mount()
    await run()
    const fields = w.findAll('[data-ai-questions] input')
    expect(w.findAll('[data-ai-questions] label').map((l) => l.text())).toEqual(['Для бытовых нужд?', 'Мощность двигателя?', 'Материал корпуса?'])
    expect(w.get('[data-ai-refine]').attributes('disabled')).toBeDefined()
    await fields[1].setValue('5 кВт')
    await w.get('[data-ai-refine]').trigger('click')
    await flushPromises()
    expect(api.suggest).toHaveBeenLastCalledWith(expect.objectContaining({ answers: [{ question: 'Мощность двигателя?', answer: '5 кВт' }] }))
  })

  it('«Выбрать» записывает подтверждение и отдаёт код', async () => {
    api.suggest.mockResolvedValue(answer())
    api.select.mockResolvedValue(undefined)
    await mount()
    await run()
    await w.get('[data-ai-card="8413708200"] [data-ai-select]').trigger('click')
    expect(api.select).toHaveBeenCalledWith('s1', '8413708200')
    expect(w.emitted('select')).toEqual([[{ code: '8413708200', name: 'насосы центробежные одноступенчатые' }]])
  })

  it('ИИ недоступен — плашка и обычный поиск по словам с «Выбрать»', async () => {
    api.suggest.mockResolvedValue(answer({
      aiUsed: false, unavailable: 'off', suggestions: [], questions: [],
      fallback: [{ code: '8413708100', description: 'насосы центробежные', probability: 0.8, rateStr: '0%', unitName: null }],
    }))
    await mount()
    await run()
    expect(w.get('[data-ai-unavailable]').text()).toContain('ИИ недоступен.')
    expect(w.get('[data-ai-unavailable]').text()).toContain('обычный поиск по словам')
    await w.get('[data-ai-fallback-select]').trigger('click')
    expect(w.emitted('select')).toEqual([[{ code: '8413708100', name: 'насосы центробежные' }]])
    expect(api.select).toHaveBeenCalledWith('s1', '8413708100')
  })

  it('характеристики уходят в запрос; короткое описание — кнопка выключена', async () => {
    api.suggest.mockResolvedValue(answer())
    await mount({ initialDescription: 'ab' })
    expect(w.get('[data-ai-run]').attributes('disabled')).toBeDefined()
    await w.get('[data-ai-description]').setValue('насос центробежный')
    await w.get('[data-ai-more]').trigger('click')
    await w.get('[data-ai-ch="material"] input, input[data-ai-ch="material"]').setValue('чугун')
    await run()
    expect(api.suggest).toHaveBeenCalledWith(expect.objectContaining({
      characteristics: expect.objectContaining({ material: 'чугун', retail: null }),
    }))
  })

  it('в справочнике выбор — просмотр: подтверждение не записывается, кнопка «Открыть»', async () => {
    api.suggest.mockResolvedValue(answer())
    await mount({ confirm: false, selectLabel: 'Открыть' })
    await run()
    expect(w.get('[data-ai-select]').text()).toBe('Открыть')
    await w.get('[data-ai-select]').trigger('click')
    expect(api.select).not.toHaveBeenCalled()
    expect(w.emitted('select')).toHaveLength(1)
  })

  it('«Повторить» после сбоя «Уточнить» повторяет запрос с ответами', async () => {
    api.suggest.mockResolvedValueOnce(answer()).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(answer())
    await mount()
    await run()
    await w.findAll('[data-ai-questions] input')[0].setValue('для дома')
    await w.get('[data-ai-refine]').trigger('click')
    await flushPromises()
    expect(w.find('[data-ai-error]').exists()).toBe(true)
    await w.get('[data-ai-retry]').trigger('click')
    await flushPromises()
    expect(api.suggest).toHaveBeenLastCalledWith(expect.objectContaining({ answers: [{ question: 'Для бытовых нужд?', answer: 'для дома' }] }))
  })

  it('429 — «слишком много запросов» с «Повторить»', async () => {
    api.suggest.mockRejectedValue(Object.assign(new Error('HTTP 429'), { isAxiosError: true, response: { status: 429 } }))
    await mount()
    await run()
    expect(w.get('[data-ai-error]').text()).toContain('Слишком много запросов')
  })
})

describe('aiTnved: логика', () => {
  it('уверенность, тон, НДС, вопросы без повторов', () => {
    expect(confidencePct(0.856)).toBe('86%')
    expect(confidencePct(1.4)).toBe('100%')
    expect(confidenceTone(0.8)).toBe('done')
    expect(confidenceTone(0.5)).toBe('wait')
    expect(confidenceTone(0.1)).toBe('neutral')
    expect(vatKey('auto')).toBe('aiTnved.vat.auto')
    expect(vatKey('none')).toBe('aiTnved.vat.none')
    expect(vatKey(null)).toBe('aiTnved.vat.unknown')
    expect(collectQuestions({ questions: ['А?', ' а? '], suggestions: [{ questions: ['Б?', 'А?'] }] })).toEqual(['А?', 'Б?'])
  })

  it('тексты на трёх языках — одни и те же ключи', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${p}${k}.`))
      : [p])
    for (const ns of ['aiTnved', 'aiSettings'] as const) {
      const of = (loc: unknown) => (loc as Record<string, unknown>)[ns]
      const ruKeys = keys(of(ru)).sort()
      expect(keys(of(kk)).sort()).toEqual(ruKeys)
      expect(keys(of(en)).sort()).toEqual(ruKeys)
    }
    for (const loc of [ru, kk, en] as unknown as { shell: { page: { ai: string } }; client: { wizard: { cargo: { ai: string; aiCode: string } } } }[]) {
      expect(loc.shell.page.ai).toBeTruthy()
      expect(loc.client.wizard.cargo.aiCode).toContain('{code}')
    }
  })
})
