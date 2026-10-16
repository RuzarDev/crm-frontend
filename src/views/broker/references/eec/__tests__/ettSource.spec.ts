import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import type { TnvedEecEttRateDto, TnvedEttRateDto } from '@/types/api'
import { mountWithI18n } from '@/test/mountWithI18n'
import { ettSourceView } from '../eec'
import EttRateSource from '../EttRateSource.vue'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } })
const t = (k: string, n?: Record<string, unknown>) => i18n.global.t(k, n ?? {})

const eec = (o: Partial<TnvedEecEttRateDto> = {}): TnvedEecEttRateDto => ({
  rateText: '0', rate: '0%', kind: 'footnote', baseRateText: '5', baseRate: '5%', footnoteNumber: '109С', footnoteFrom: null,
  footnoteTo: '2028-12-31', footnoteDecision: null, group: '32', editionId: 7, editionDate: '2026-08-24', fileName: 'ru.32.pdf',
  inForce: true, notInForceSince: null, isCertain: true, pending: [], ...o,
})
const ett = (o: Partial<TnvedEttRateDto> = {}): TnvedEttRateDto => ({
  date: '2026-10-16', configuredSource: 'eec', effectiveSource: 'eec', effectiveRate: '0%', fallbackReason: null, kedenRate: '5%',
  kedenSourceName: 'ЕТТ ЕАЭС — данные ИС «KEDEN»', kedenManualOverride: false, eec: eec(), differs: true, ...o,
})

describe('ettSourceView', () => {
  it('расчёт на ЕЭК: источник как в задаче и «в КЕДЕН: X» при расхождении', () => {
    expect(ettSourceView(ett(), t)).toEqual({
      source: 'ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028', other: 'в КЕДЕН: 5%', differs: true, fallback: null, uncertain: null,
    })
    expect(ettSourceView(ett({ differs: false, kedenRate: '0%' }), t)!.other).toBeNull()
  })
  it('расчёт на КЕДЕН: «в ЕЭК: X (источник)» при расхождении, иначе «совпадает с ЕЭК»', () => {
    const v = ettSourceView(ett({ configuredSource: 'keden', effectiveSource: 'keden', effectiveRate: '5%' }), t)!
    expect(v.source).toBe('КЕДЕН')
    expect(v.other).toBe('в ЕЭК: 0% (ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028)')
    const same = ettSourceView(ett({ configuredSource: 'keden', effectiveSource: 'keden', differs: false, eec: eec({ kind: 'base', footnoteNumber: null, footnoteTo: null }) }), t)!
    expect(same.other).toBe('совпадает с ЕЭК (ЕЭК, ред. 24.08.2026)')
    expect(ettSourceView(ett({ configuredSource: 'keden', effectiveSource: 'keden', kedenManualOverride: true, eec: null, differs: false }), t))
      .toEqual({ source: 'КЕДЕН (ручное исключение)', other: null, differs: false, fallback: null, uncertain: null })
  })
  it('запасная ставка КЕДЕН: причина и «проверить вручную» со сносками', () => {
    const v = ettSourceView(ett({
      effectiveSource: 'kedenFallback', effectiveRate: '5%', fallbackReason: 'eecUncertain',
      eec: eec({ isCertain: false, pending: [{ number: '109С', reason: 'decision-date-unknown', rateText: '0', kedenRate: '0%', validFrom: null, validTo: null }] }),
    }), t)!
    expect(v.source).toBe('КЕДЕН')
    expect(v.fallback).toBe('по КЕДЕН: ставку ЕЭК нужно проверить')
    expect(v.uncertain).toBe('проверить вручную: сн. 109С: дата вступления решения не известна')
    expect(v.other).toBe('в ЕЭК: 0% (ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028)')
    expect(ettSourceView(ett({ effectiveSource: 'kedenFallback', fallbackReason: 'eecNoRate', eec: null, differs: false }), t)!.fallback)
      .toBe('по КЕДЕН: кода нет в данных ЕЭК')
  })
  it('нет ettRate — ничего', () => {
    expect(ettSourceView(null, t)).toBeNull()
  })
})

describe('EttRateSource', () => {
  it('строки; hideSource прячет источник, а без прочих строк — весь блок', () => {
    const w = mountWithI18n(EttRateSource, { props: { ett: ett() } })
    expect(w.get('[data-ett-source-main]').text()).toBe('ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028')
    expect(w.get('[data-ett-source-other]').text()).toBe('в КЕДЕН: 5%')
    const hidden = mountWithI18n(EttRateSource, { props: { ett: ett({ differs: false }), hideSource: true } })
    expect(hidden.find('[data-ett-source]').exists()).toBe(false)
    expect(mountWithI18n(EttRateSource, { props: { ett: null } }).find('[data-ett-source]').exists()).toBe(false)
  })
})
