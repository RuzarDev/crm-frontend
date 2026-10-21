import { describe, expect, it } from 'vitest'
import type { Import40TransportMeans } from '@/types/api'
import { compositionMode, followComposition, isRoadMode, maxTrailersPerHead, modeByTrailers, type RoadMode } from '../transportMode'

// Таблица общая с сервером (crm-server tests/CRM.API.IntegrationTests/TransportCompositionTests.cs): «h:номер» — голова,
// «t:номер>голова» — прицеп (без «>» — без «К голове»), «l:номер/тип» — старая запись без роли.
const parse = (composition: string): Import40TransportMeans[] =>
  composition.split(',').map((s) => s.trim()).filter(Boolean).map((token) => {
    const [kind, body] = [token[0], token.slice(2)]
    if (kind === 'h') return { number: body, typeCode: null, isTrailer: false, headNumber: null }
    if (kind === 't') {
      const [number, head] = body.split('>')
      return { number, typeCode: null, isTrailer: true, headNumber: head ?? null }
    }
    const [number, type] = body.split('/')
    return { number, typeCode: type ?? null }
  })

describe('transportMode — вид гр. 25 / 26 по составу гр. 18 (правка №8)', () => {
  it.each<[string, RoadMode | null]>([
    ['', null],
    ['h:H1', '30'],
    ['h:H1, t:T1>H1', '31'],
    ['h:H1, t:T1>H1, t:T2>H1', '32'],
    ['h:H1, t:>H1', '30'], // прицеп без номера не считается
    ['t:T1, t:T2', null], // одни прицепы — головы нет
    ['l:H1, l:T1/319', '31'], // старые записи: строка с типом после головы — прицеп
    ['l:H1, l:H2', '30'], // старые записи без типов — две головы
    ['h:H1, t:T1>H1, h:H2, t:T2>H2', '31'], // D1: по сцепке
    ['h:H1, h:H2, t:T1>NOPE, t:T2>H2', '32'], // «К голове» нет в списке — к ближайшей голове выше
    ['t:T1, h:H1, h:H2', '31'], // выше голов нет — к первой
    ['h:ab1, t:T1>AB1', '31'], // «К голове» без учёта регистра
    ['h:184AFR19, t:48AEU19>184AFR19', '31'], // скриншот декларанта
  ])('%s → %s', (composition, expected) => {
    expect(compositionMode(parse(composition))).toBe(expected)
  })

  it('число прицепов и коды', () => {
    expect(maxTrailersPerHead(parse('h:H1, t:T1>H1, t:T2>H1, t:T3'))).toBe(3)
    expect([0, 1, 2, 5, null].map(modeByTrailers)).toEqual(['30', '31', '32', '32', null])
    expect(['30', '31', ' 32 ', '20', '40', '', null, undefined].map(isRoadMode)).toEqual([true, true, true, false, false, false, false, false])
  })

  it.each<[string | null, RoadMode | null, RoadMode | null, string | null]>([
    ['30', null, '31', '31'], // код шёл по умолчанию — идёт за составом
    ['30', '31', '32', '30'], // при прежнем составе код уже расходился — выбран вручную
    ['', null, '31', '31'], // пустой — ставим при прицепе
    ['', null, '30', ''], // пустой при одной голове — не ставим (голова бывает и вагоном)
    ['20', null, '31', '20'], // ЖД/авиа/море не трогаем
    ['31', '31', '30', '30'], // прицеп убрали
    [null, '30', '30', null], // состав не изменился
    ['32', '32', null, '32'], // состав стал неизвестен — код остаётся
  ])('followComposition(%s, %s → %s) = %s', (current, before, after, expected) => {
    expect(followComposition(current, before, after)).toBe(expected)
  })
})
