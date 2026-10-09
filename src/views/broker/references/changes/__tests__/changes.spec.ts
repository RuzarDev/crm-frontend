import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import type { TnvedTimelineDto } from '@/types/api'
import {
  changeText, countryFromDescription, filterChanges, isoDate, localDay, mergeChanges, parseDescription, rateChangeEntries, timelineEntries, typeKey, typeTone,
  type ChangeFilters,
} from '../changes'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, en, kk } })
const tRu = (k: string, n?: Record<string, unknown>) => i18n.global.t(k, n ?? {}) as string
const tKk = (k: string, n?: Record<string, unknown>) => i18n.global.t(k, n ?? {}, { locale: 'kk' }) as string
const tEn = (k: string, n?: Record<string, unknown>) => i18n.global.t(k, n ?? {}, { locale: 'en' }) as string

const TODAY = '2026-10-09'
const tl = (over: Partial<TnvedTimelineDto>): TnvedTimelineDto => ({
  typeId: 1, kind: 'starts', date: '2026-10-15', showDate: '2026-10-15T00:00:00Z',
  codes: ['8516601010', '8516601090'], totalCodes: 5,
  description: 'С 15.10.2026: ставка ввозной пошлины ЕТТ 5% — 5 кодов: 8516601010, 8516601090 и ещё 3', ...over,
})
const none: ChangeFilters = { future: false, type: null, period: null, q: '' }

describe('rateChangeEntries — изменения ставок', () => {
  it('название берётся из name, дата — из detectedAtUtc (а не из несуществующих treeName/changedAtUtc)', () => {
    const [e] = rateChangeEntries([
      { code: '2402209000', oldRateStr: '10%', newRateStr: '5%', detectedAtUtc: '2026-10-09T03:15:00Z', name: '– – сигареты' },
    ])
    expect(e.name).toBe('сигареты')
    expect(e.date).toBe('2026-10-09')
    expect(e.oldRate).toBe('10%')
    expect(e.newRate).toBe('5%')
    expect(e.codes).toEqual(['2402209000'])
  })

  it('дата без пояса остаётся датой сервера; мусор — пустая строка, а не «Invalid Date»', () => {
    expect(isoDate('2026-10-09T23:30:00')).toBe('2026-10-09')
    expect(isoDate(undefined)).toBe('')
    expect(isoDate('вчера')).toBe('')
  })

  it('ключи уникальны, даже когда у кода несколько изменений в один день', () => {
    const rows = rateChangeEntries([
      { code: '8516601010', oldRateStr: null, newRateStr: '5%', detectedAtUtc: '2026-10-09T01:00:00Z', name: null },
      { code: '8516601010', oldRateStr: '5%', newRateStr: '7%', detectedAtUtc: '2026-10-09T02:00:00Z', name: null },
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    expect(rows[0].name).toBe('')
  })
})

describe('timelineEntries и текст ленты (старый сервер: без what/value/countryCode — разбор строки)', () => {
  it('поля: тип, дата, коды, сколько кодов не показано', () => {
    const [e] = timelineEntries([tl({})])
    expect(e).toMatchObject({ kind: 'starts', date: '2026-10-15', what: 'importDuty', detail: '5%', moreCodes: 3 })
    expect(e.codes).toEqual(['8516601010', '8516601090'])
  })

  it('текст строится на фронте и переводится; значение ставки берётся из строки сервера', () => {
    const [e] = timelineEntries([tl({})])
    expect(changeText(e, tRu)).toBe('Ставка ввозной пошлины ЕТТ: 5%')
    expect(changeText(e, tEn)).toBe('EAEU import duty rate: 5%')
    expect(changeText(e, tKk)).toBe('ЕКТ импорттық баж мөлшерлемесі: 5%')
  })

  it('окончание действия: typeId=4, но что именно заканчивается видно из строки; страна антидемпинга — в скобках', () => {
    const [ends, ad] = timelineEntries([
      tl({ typeId: 4, kind: 'ends', date: '2026-11-01', description: 'До 01.11.2026: окончание: пониженная ставка ВТО (перечень изъятий РК) 3% — 2 кодов: 1, 2' }),
      tl({ typeId: 3, description: 'С 15.10.2026: антидемпинговая пошлина (Китай) 12% — 1 код: 7318' }),
    ])
    expect(ends.kind).toBe('ends')
    expect(changeText(ends, tRu)).toBe('Пониженная ставка ВТО: 3%')
    expect(changeText(ad, tRu)).toBe('Антидемпинговая пошлина (Китай) 12%')
  })

  it('строка непонятного вида: тип по typeId, подробностей нет; тип неизвестен — запасной текст сервера', () => {
    const [byType, unknown] = timelineEntries([
      tl({ typeId: 2, description: 'что-то новое' }),
      tl({ typeId: 9, description: 'С 15.10.2026: что-то новое — 1 код: 1' }),
    ])
    expect(changeText(byType, tRu)).toBe('Пониженная ставка ВТО')
    expect(changeText(unknown, tRu)).toBe('С 15.10.2026: что-то новое — 1 код: 1')
    expect(parseDescription(null)).toEqual({ what: null, detail: '' })
  })

  it('подпись и цвет типа зависят от даты: будущее «вступает», прошлое «вступила»', () => {
    const [future, past, ends] = timelineEntries([tl({}), tl({ date: '2026-09-01' }), tl({ kind: 'ends', typeId: 4, date: '2026-09-01' })])
    expect(typeKey(future, TODAY)).toBe('starts')
    expect(typeKey(past, TODAY)).toBe('started')
    expect(typeKey(ends, TODAY)).toBe('ended')
    expect(typeTone(future, TODAY)).toBe('wait')
    expect(typeTone(past, TODAY)).toBe('done')
  })
})

describe('структурные поля сервера (what / value / countryCode)', () => {
  it('текст из структуры, строка description не разбирается и не показывается', () => {
    const [e] = timelineEntries([tl({ what: 'importDuty', value: '5%', countryCode: null, description: 'любая строка' })])
    expect(e).toMatchObject({ what: 'importDuty', value: '5%', countryCode: null, detail: '' })
    expect(changeText(e, tRu)).toBe('Ставка ввозной пошлины ЕТТ: 5%')
    expect(changeText(e, tKk)).toBe('ЕКТ импорттық баж мөлшерлемесі: 5%')
  })

  it('окончание: «что» берётся из what (typeId=4 ничего не говорит); страна — по-русски, по-казахски и по-английски', () => {
    const [ends] = timelineEntries([tl({ typeId: 4, kind: 'ends', what: 'antiDumping', value: '12%', countryCode: 'CN', description: '' })])
    expect(ends.kind).toBe('ends')
    expect(changeText(ends, tRu, 'ru')).toBe('Антидемпинговая пошлина (Китай): 12%')
    expect(changeText(ends, tEn, 'en')).toBe('Anti-dumping duty (China): 12%')
    expect(changeText(ends, tKk, 'kk')).toMatch(/^Демпингке қарсы баж \(.+\): 12%$/)
  })

  it('компенсационная и специальная пошлины переведены; what=other — строка сервера', () => {
    const [comp, special, other] = timelineEntries([
      tl({ what: 'compensatory', value: '3%' }), tl({ what: 'special', value: '1 EUR за 1 КГ' }), tl({ what: 'other', description: 'С 15.10.2026: что-то' }),
    ])
    expect(changeText(comp, tRu)).toBe('Компенсационная пошлина: 3%')
    expect(changeText(special, tEn)).toBe('Special duty: 1 EUR за 1 КГ')
    expect(changeText(other, tRu)).toBe('С 15.10.2026: что-то')
  })

  it('страна не сопоставлена (countryCode пуст): берём из скобок строки сервера, значение остаётся', () => {
    const [ad, general, vto, noBrackets] = timelineEntries([
      tl({ what: 'antiDumping', value: '28.2%', countryCode: null, description: 'С 15.10.2026: антидемпинговая пошлина (КИТАЙ) 28.2% — 3 кодов: 1, 2' }),
      tl({ what: 'importDuty', value: '5%', countryCode: null, description: 'С 15.10.2026: ставка ввозной пошлины ЕТТ 5% — 1 код: 1' }),
      tl({ what: 'vtoDuty', value: '3%', countryCode: null, description: 'С 15.10.2026: пониженная ставка ВТО (перечень изъятий РК) 3% — 1 код: 1' }),
      tl({ what: 'antiDumping', value: '9%', countryCode: null, description: 'антидемпинговая пошлина 9%' }),
    ])
    expect(changeText(ad, tRu)).toBe('Антидемпинговая пошлина (Китай): 28.2%')
    expect(changeText(general, tRu)).toBe('Ставка ввозной пошлины ЕТТ: 5%')
    expect(changeText(vto, tRu)).toBe('Пониженная ставка ВТО: 3%')
    expect(changeText(noBrackets, tRu)).toBe('Антидемпинговая пошлина: 9%')
    expect(countryFromDescription('x (РЕСПУБЛИКА КОРЕЯ) 3% — 1 код')).toBe('Республика Корея')
  })

  it('страна по коду главнее строки', () => {
    const [e] = timelineEntries([tl({ what: 'antiDumping', value: '12%', countryCode: 'cn', description: 'антидемпинговая пошлина (КИТАЙ) 12%' })])
    expect(changeText(e, tEn, 'en')).toBe('Anti-dumping duty (China): 12%')
  })

  it('what без значения — только название', () => {
    const [e] = timelineEntries([tl({ what: 'vtoDuty', value: null })])
    expect(changeText(e, tEn)).toBe('Reduced WTO rate')
  })
})

describe('даты по времени Казахстана', () => {
  it('момент времени — день по UTC+5: вечер по UTC уже следующий день; без пояса считается UTC', () => {
    expect(localDay('2026-10-09T20:00:00Z')).toBe('2026-10-10')
    expect(localDay('2026-10-09T03:15:00Z')).toBe('2026-10-09')
    expect(localDay('2026-10-09T20:00:00')).toBe('2026-10-10')
    expect(localDay('вчера')).toBe('')
    expect(localDay(null)).toBe('')
  })
  it('изменение ставки, найденное в 20:00 UTC, попадает на день Казахстана', () => {
    const [e] = rateChangeEntries([{ code: '1', oldRateStr: null, newRateStr: '5%', detectedAtUtc: '2026-10-09T20:00:00Z', name: null }])
    expect(e.date).toBe('2026-10-10')
  })
})

describe('mergeChanges — склейка источников', () => {
  it('одна лента: даты по убыванию, при равной дате хронология перед изменением ставок', () => {
    const rows = mergeChanges(
      timelineEntries([tl({ date: '2026-10-15' }), tl({ date: '2026-10-09', codes: ['1111111111'] })]),
      rateChangeEntries([
        { code: '2402209000', oldRateStr: '1%', newRateStr: '2%', detectedAtUtc: '2026-10-09T01:00:00Z', name: 'сигареты' },
        { code: '8703800002', oldRateStr: '1%', newRateStr: '2%', detectedAtUtc: '2026-10-20T01:00:00Z', name: 'авто' },
      ]),
    )
    expect(rows.map((r) => `${r.date}:${r.kind}`)).toEqual(['2026-10-20:rate', '2026-10-15:starts', '2026-10-09:starts', '2026-10-09:rate'])
  })
})

describe('filterChanges', () => {
  const all = mergeChanges(
    timelineEntries([
      tl({ date: '2026-10-15' }),
      tl({ date: '2026-12-30', kind: 'ends', typeId: 4, description: 'До 30.12.2026: окончание: ставка ввозной пошлины ЕТТ 7% — 1 код: 8703800002', codes: ['8703800002'], totalCodes: 1 }),
      tl({ date: '2026-06-01', codes: ['9999999999'], totalCodes: 1 }),
    ]),
    rateChangeEntries([{ code: '2402209000', oldRateStr: '10%', newRateStr: '5%', detectedAtUtc: '2026-10-05T01:00:00Z', name: 'сигареты' }]),
  )
  const run = (f: Partial<ChangeFilters>) => filterChanges(all, { ...none, ...f }, TODAY, tRu).map((e) => `${e.date}:${e.kind}`)

  it('«Будущие» — только с сегодняшнего дня', () => {
    expect(run({ future: true })).toEqual(['2026-12-30:ends', '2026-10-15:starts'])
    expect(run({ future: false })).toHaveLength(4)
  })
  it('тип и период (±N дней)', () => {
    expect(run({ type: 'rate' })).toEqual(['2026-10-05:rate'])
    expect(run({ period: '30' })).toEqual(['2026-10-15:starts', '2026-10-05:rate'])
    expect(run({ period: '90' })).toEqual(['2026-12-30:ends', '2026-10-15:starts', '2026-10-05:rate'])
  })
  it('поиск: цифры — по началу кода, слова — по тексту и названию', () => {
    expect(run({ q: '8516 60' })).toEqual(['2026-10-15:starts'])
    expect(run({ q: '9999' })).toEqual(['2026-06-01:starts'])
    expect(run({ q: 'СИГАРЕТЫ' })).toEqual(['2026-10-05:rate'])
    expect(run({ q: 'ЕТТ' })).toHaveLength(3)
    expect(run({ q: 'zzz' })).toEqual([])
  })
})
