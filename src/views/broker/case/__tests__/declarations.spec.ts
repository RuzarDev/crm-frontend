import { describe, expect, it } from 'vitest'
import { dtListActive, dtRowActions, previewToUpsert } from '../declarations'

describe('dtListActive — действия над списком ДТ только на шаге 3', () => {
  it('текущий шаг 3: декларирование и подана', () => {
    expect(dtListActive(2, 'current')).toBe(true)
    expect(dtListActive(3, 'current')).toBe(true)
  })

  it('(баг) после выпуска и в пройденном шаге — без добавления, выгрузки и удаления', () => {
    for (const s of [4, 5, 6, 7, 8]) expect(dtListActive(s, 'done')).toBe(false)
    expect(dtListActive(4, 'current')).toBe(false)
    expect(dtListActive(9, 'current')).toBe(false)
  })
})

describe('dtRowActions — «Заполнить»/XML в строке ДТ (решение владельца 09.10: правка после выпуска остаётся)', () => {
  it('на текущем шаге 3 — всегда (без права кнопки выключены с подсказкой)', () => {
    expect(dtRowActions(2, 'current', false)).toBe(true)
    expect(dtRowActions(3, 'current', false)).toBe(true)
  })

  it('после шага 3 — только тем, кто может править ДТ, в т.ч. Released/Done/Cancelled', () => {
    for (const s of [4, 5, 6, 7, 8, 9]) {
      expect(dtRowActions(s, 'done', true)).toBe(true)
      expect(dtRowActions(s, 'done', false)).toBe(false)
    }
  })

  it('до «Декларирования» строк ДТ с правкой нет', () => {
    expect(dtRowActions(1, 'done', true)).toBe(false)
  })
})

describe('previewToUpsert — распознавание инвойса в ДТ', () => {
  it('марка, знак и производитель — в строку 1 характеристик гр. 31; количество и стоимость — у товара, не копией', () => {
    const body = previewToUpsert({ goodsItems: [
      { description: 'СУМКИ', quantity: 300, invoiceValue: 900, tradeMarkName: 'SAMSONITE', productMarkName: 'S', manufacturerName: 'SAMSONITE LTD' },
      { description: 'РЕМНИ' },
    ] })
    expect(body.goodsItems![0].characteristics).toEqual([expect.objectContaining({
      tradeMarkName: 'SAMSONITE', productMarkName: 'S', manufacturerName: 'SAMSONITE LTD', quantity: null, invoiceValue: null, unitCode: null,
    })])
    expect(body.goodsItems![0]).toMatchObject({ quantity: 300, invoiceValue: 900 })
    expect(body.goodsItems![0]).not.toHaveProperty('tradeMarkName')
    expect(body.goodsItems![1].characteristics).toEqual([])
  })
})

// Неявный контракт с сервером (правка №8, 21.10.2026): код 31 «Из документов» ставит AddDeclaration по составу гр. 18 и
// только для кодов, которые подставил сам (в запросе их нет). Поэтому тело создания ДТ несёт гр. 18 с ролями голова/прицеп
// и никогда не несёт гр. 25 / 26.
describe('previewToUpsert — транспорт для кода гр. 25 / 26 по составу гр. 18', () => {
  it('гр. 18 с ролями уходит как есть, гр. 25 / 26 не отправляются', () => {
    const arrival = [
      { number: '184AFR19', typeCode: null, isTrailer: false, headNumber: null },
      { number: '48AEU19', typeCode: null, isTrailer: true, headNumber: '184AFR19' },
    ]
    const body = previewToUpsert({ arrivalTransportNumbers: arrival, borderTransportNumbers: [arrival[0]] })
    expect(body.arrivalTransportNumbers).toEqual(arrival)
    expect(body.borderTransportNumbers).toEqual([arrival[0]])
    expect(body).not.toHaveProperty('borderTransportModeCode')
    expect(body).not.toHaveProperty('inlandTransportModeCode')
    expect(body).not.toHaveProperty('arrivalTransportModeCode')
  })

  it('пустая гр. 18 не отправляется — сервер заполнит её головой и прицепом заявки', () => {
    expect(previewToUpsert({ arrivalTransportNumbers: [] }).arrivalTransportNumbers).toBeUndefined()
  })
})
