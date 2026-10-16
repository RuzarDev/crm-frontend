import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import type { EecCodeChange, EecDiscrepancy } from '@/api/tnvedEec'
import {
  changeCounts, changeFlags, countOf, decisionFlagLabel, discrepancyExcelRows, eecSourceText, filterCodeChanges, footnotePeriod,
  parseTab, pendingReasonLabel, rateStateText, runActive, runBy, unparsedLabel, utc,
} from '../eec'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
const t = (k: string, n?: Record<string, unknown>) => i18n.global.t(k, n ?? {})

const change = (code: string, kind: string, name = 'товар'): EecCodeChange => ({
  code, kind, kedenRate: '5%',
  before: { rateText: '5', kedenRate: '5%', footnoteRefs: [], addUnit: null, nameRu: name },
  after: { rateText: '10', kedenRate: '10%', footnoteRefs: ['109С'], addUnit: 'м3', nameRu: name },
})
const disc = (o: Partial<EecDiscrepancy> = {}): EecDiscrepancy => ({
  code: '8112924100', group: '81', name: '– прочие', kind: 'rate', eecRate: '0%', eecRateText: '0', eecBaseRateText: '5',
  footnoteRefs: ['109С'], footnoteNumber: '109С', footnoteFrom: null, footnoteTo: '2028-12-31', editionId: 7, editionDate: '2026-08-24',
  fileName: 'ru.81_2022_24.08.2026.pdf', notInForceSince: null, pending: [], kedenRate: '5%', kedenUpdatedAtUtc: null, ...o,
})

describe('eecSourceText — строка источника ставки', () => {
  it('редакция и сноска с окончанием: как в задаче', () => {
    expect(eecSourceText({ editionDate: '2026-08-24', footnoteNumber: '109С', footnoteTo: '2028-12-31' }, t))
      .toBe('ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028')
  })
  it('без сноски — только редакция; сноска без дат и с началом; без редакции — «ЕЭК»', () => {
    expect(eecSourceText({ editionDate: '2026-08-24' }, t)).toBe('ЕЭК, ред. 24.08.2026')
    expect(eecSourceText({ editionDate: '2026-08-24', footnoteNumber: '12' }, t)).toBe('ЕЭК, ред. 24.08.2026, сноска 12')
    expect(eecSourceText({ editionDate: null, footnoteNumber: '12', footnoteFrom: '2026-01-01' }, t)).toBe('ЕЭК, сноска 12 с 01.01.2026')
  })
  it('kk и en', () => {
    i18n.global.locale.value = 'en'
    expect(eecSourceText({ editionDate: '2026-08-24', footnoteNumber: '109С', footnoteTo: '2028-12-31' }, t))
      .toBe('EEC, ed. 24.08.2026, footnote 109С until 31.12.2028')
    i18n.global.locale.value = 'kk'
    expect(eecSourceText({ editionDate: '2026-08-24', footnoteNumber: '109С', footnoteTo: '2028-12-31' }, t))
      .toBe('ЕЭК, 24.08.2026 ред., 109С сілтеме, 31.12.2028 дейін')
    i18n.global.locale.value = 'ru'
  })
})

describe('флаги изменений кода', () => {
  it('«rate, footnotes» и PascalCase разбираются, неизвестные отбрасываются', () => {
    expect(changeFlags('rate, footnotes')).toEqual(['rate', 'footnotes'])
    expect(changeFlags('Added, Returned')).toEqual(['added', 'returned'])
    expect(changeFlags('none, weird')).toEqual([])
    expect(changeFlags(null)).toEqual([])
  })
  it('фильтр по виду и поиск по началу кода или названию; «новые» включают вернувшиеся', () => {
    const codes = [change('0101210000', 'rate'), change('0101290000', 'added', 'лошади'), change('0102210000', 'returned'), change('0103100000', 'removed, footnotes')]
    expect(filterCodeChanges(codes, 'rate', '').map((c) => c.code)).toEqual(['0101210000'])
    expect(filterCodeChanges(codes, 'added', '').map((c) => c.code)).toEqual(['0101290000', '0102210000'])
    expect(filterCodeChanges(codes, 'footnotes', '').map((c) => c.code)).toEqual(['0103100000'])
    expect(filterCodeChanges(codes, 'all', '0101 2').map((c) => c.code)).toEqual(['0101210000', '0101290000'])
    expect(filterCodeChanges(codes, 'all', 'ЛОШАД').map((c) => c.code)).toEqual(['0101290000'])
    expect(changeCounts(codes)).toEqual({ all: 4, rate: 1, added: 2, removed: 1, footnotes: 1, unit: 0 })
  })
  it('ставка с единицей и сносками', () => {
    expect(rateStateText(change('1', 'rate').after, t)).toBe('10 · м3 · сн. 109С')
    expect(rateStateText(null, t)).toBe('—')
  })
})

describe('расхождения с КЕДЕН', () => {
  it('счётчики вида без учёта регистра ключей', () => {
    expect(countOf({ eecOnly: 3 }, 'eecOnly')).toBe(3)
    expect(countOf({ EecOnly: 4 }, 'eecOnly')).toBe(4)
    expect(countOf(undefined, 'rate')).toBe(0)
  })
  it('период сноски', () => {
    expect(footnotePeriod(disc(), t)).toBe('до 31.12.2028')
    expect(footnotePeriod(disc({ footnoteFrom: '2026-01-01' }), t)).toBe('01.01.2026–31.12.2028')
    expect(footnotePeriod(disc({ footnoteTo: null, footnoteFrom: null }), t)).toBe('')
  })
  it('строки Excel: подписи колонок, вид, сноска, период, «проверить вручную»', () => {
    const [row] = discrepancyExcelRows([disc({ pending: [{ number: '12', reason: 'decision-date-unknown', rateText: '0', kedenRate: null, validFrom: null, validTo: null, decision: null }] })], t)
    expect(row).toMatchObject({
      'Код': '8112924100',
      'Группа': '81',
      'Расхождение': 'Ставка отличается',
      'ЕЭК на дату': '0',
      'ЕЭК, основная ставка': '5',
      'КЕДЕН': '5%',
      'Сноска': '109С',
      'Период сноски': 'до 31.12.2028',
      'Редакция ЕЭК': '24.08.2026',
      'Проверить вручную': '12: дата вступления решения не известна',
    })
  })
  it('причины, флаги решений и нераспознанные строки — подписями; неизвестные — как есть', () => {
    expect(pendingReasonLabel('footnote-missing', t)).toBe('сноски нет в «Примечаниях к ЕТТ»')
    expect(pendingReasonLabel('new-thing', t)).toBe('new-thing')
    expect(decisionFlagLabel('no-date', t)).toBe('нет даты на портале')
    expect(unparsedLabel('rate-not-recognized', t)).toBe('Ставка не распознана')
  })
})

describe('прочее', () => {
  it('вкладка из адреса', () => {
    expect(parseTab('discrepancies')).toBe('discrepancies')
    expect(parseTab('x')).toBe('editions')
    expect(parseTab(undefined)).toBe('editions')
  })
  it('кто запустил', () => {
    expect(runBy('admin:ivanov', t)).toBe('ivanov')
    expect(runBy('scheduler', t)).toBe('по расписанию')
    expect(runBy('startup', t)).toBe('при запуске')
    expect(runBy('reevaluate:ivanov', t)).toBe('перепроверка отложенных (ivanov)')
  })
  it('прогон идёт: флаг процесса или статус running', () => {
    expect(runActive(null)).toBe(false)
    expect(runActive({ isRunning: true, run: null })).toBe(true)
    expect(runActive({ isRunning: false, run: { status: 'completed' } as never })).toBe(false)
  })
  it('метка UTC без пояса получает Z', () => {
    expect(utc('2026-10-16T05:00:00')).toBe('2026-10-16T05:00:00Z')
    expect(utc('2026-10-16T05:00:00Z')).toBe('2026-10-16T05:00:00Z')
    expect(utc(null)).toBeNull()
  })
})
