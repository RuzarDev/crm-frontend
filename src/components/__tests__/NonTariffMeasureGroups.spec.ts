import { describe, expect, it } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedNonTariffMeasureDto } from '@/types/api'
import NonTariffMeasureGroups from '../NonTariffMeasureGroups.vue'

const m = (resolutionUrl: string | null): TnvedNonTariffMeasureDto =>
  ({ docType: 'RESTRICTION', name: 'Нотификация', comment: null, resolutionNumber: '30', resolutionName: 'Решение КТС', resolutionUrl })

describe('NonTariffMeasureGroups: ссылка на решение', () => {
  it('http(s) — ссылка с noopener; javascript:, data: и пустой адрес — просто текст', () => {
    const w = mountWithI18n(NonTariffMeasureGroups, { props: { measures: [m('https://eec.example/30'), m('javascript:alert(1)'), m('data:text/html,x'), m(null)] } })
    const items = w.findAll('[data-measure]')
    expect(items[0].get('a').attributes('href')).toBe('https://eec.example/30')
    expect(items[0].get('a').attributes('rel')).toContain('noopener')
    for (const it of items.slice(1)) {
      expect(it.find('a').exists()).toBe(false)
      expect(it.text()).toContain('Решение КТС')
    }
  })
})
