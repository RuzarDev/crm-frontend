import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { StageStats } from '@/api/stages'

const api = vi.hoisted(() => ({ stats: vi.fn() }))
vi.mock('@/api/stages', () => ({ stagesApi: api }))

import StageStatsPanel from '../StageStatsPanel.vue'

const STATS: StageStats = {
  days: 90,
  steps: [1, 2, 3, 4, 5, 6].map((step) => ({ step, count: step === 3 ? 4 : 0, avgHours: step === 3 ? 9.5 : null, medianHours: step === 3 ? 10 : null, normHours: [4, 48, 8, 24, 72, 72][step - 1]! })),
  rework: { step: 0, count: 2, avgHours: 30, medianHours: 30, normHours: 24 },
  employees: [{ userId: 'u1', name: 'Айгерим К.', count: 3, avgHours: 2.5, medianHours: 2, returned: 1 }],
  overdue: [{ caseId: 'c9', number: 'ИМ-2026-0041', clientName: 'ТОО «Альфа»', step: 3, inRework: false, elapsedMinutes: 600, normMinutes: 480, responsibleName: 'Айгерим К.' }],
}

let w: VueWrapper
const mountPanel = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  w = mountWithI18n(StageStatsPanel, { global: { plugins: [router] } })
  await flushPromises()
}

beforeEach(() => { api.stats.mockResolvedValue(structuredClone(STATS)) })
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('StageStatsPanel', () => {
  it('просрочки со ссылками на заявки, шаги со средним/медианой и нормой, сотрудники', async () => {
    await mountPanel()
    expect(api.stats).toHaveBeenCalledWith(90, { silent: true })
    const overdue = w.findAll('[data-stage-overdue-row]')
    expect(overdue).toHaveLength(1)
    expect(overdue[0]!.get('a').attributes('href')).toBe('/import-40/c9')
    expect(overdue[0]!.text()).toContain('ИМ-2026-0041')
    expect(overdue[0]!.text()).toContain('10 ч')
    expect(overdue[0]!.text()).toContain('норма 8 ч')

    const s3 = w.get('[data-stage-step-row="s3"]')
    expect(s3.text()).toContain('3. Декларирование и выпуск')
    expect(s3.text()).toContain('9 ч 30 мин')
    expect(s3.findAll('td')[2]!.classes()).toContain('text-tone-danger-fg') // медиана выше нормы
    expect(w.get('[data-stage-step-row="rework"]').text()).toContain('Доработка у клиента')
    expect(w.get('[data-stage-employee-row]').text()).toContain('Айгерим К.')
  })

  it('смена периода перезапрашивает; пусто — «Просрочек нет» и «Пока нет данных»', async () => {
    await mountPanel()
    api.stats.mockResolvedValueOnce({ days: 30, steps: [], rework: { step: 0, count: 0, avgHours: null, medianHours: null, normHours: 24 }, employees: [], overdue: [] })
    const btn = w.findAll('[data-stage-stats-period] button').find((b) => b.text() === '30 дней')!
    await btn.trigger('click')
    await flushPromises()
    expect(api.stats).toHaveBeenLastCalledWith(30, { silent: true })
    expect(w.get('[data-stage-overdue-empty]').text()).toBe('Просрочек нет')
    expect(w.get('[data-stage-stats-empty]').text()).toBe('Пока нет данных')
  })

  it('фильтр «До 17.10» — заявки без истории отдельно и не красным; в счётчике просрочек их нет', async () => {
    api.stats.mockResolvedValueOnce({
      ...structuredClone(STATS),
      untracked: [{ caseId: 'c6', number: 'ИМ-2026-0006', clientName: 'ТОО «Бета»', step: 6, inRework: false, elapsedMinutes: 60 * 24 * 60, normMinutes: 72 * 60, responsibleName: null, historyMissing: true }],
    })
    await mountPanel()
    expect(w.get('[data-stage-overdue] h3').text()).toContain('1')
    expect(w.findAll('[data-stage-untracked-row]')).toHaveLength(0)
    const btn = w.findAll('[data-stage-overdue-filter] button').find((b) => b.text().startsWith('До 17.10'))!
    expect(btn.text()).toBe('До 17.10 — без истории · 1')
    await btn.trigger('click')
    await flushPromises()
    const row = w.get('[data-stage-untracked-row]')
    expect(row.text()).toContain('ИМ-2026-0006')
    expect(row.text()).toContain('до 17.10')
    expect(row.text()).toContain('≥ 60 д без изменений')
    expect(row.find('.text-tone-danger-fg').exists()).toBe(false)
    expect(w.find('[data-stage-overdue-row]').exists()).toBe(false)
    expect(w.get('[data-stage-untracked-hint]').text()).toContain('В просрочки и среднее не входят')
  })

  it('старый сервер без untracked — фильтра нет', async () => {
    await mountPanel()
    expect(w.find('[data-stage-overdue-filter]').exists()).toBe(false)
  })

  it('ошибка — сообщение и «Повторить»', async () => {
    api.stats.mockRejectedValueOnce(new Error('500'))
    await mountPanel()
    expect(w.get('[data-stage-stats-error]').text()).toContain('Не удалось загрузить время этапов')
  })
})
