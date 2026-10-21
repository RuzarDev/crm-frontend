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

// Пакет импорта 21.10.2026: «Из документов» строит товары сам (importBuild), номер инвойса в номер ДТ не идёт, отправитель —
// с разобранным адресом и кратким наименованием, БИН получателя и гр. 44 — из документов; гр. 25 / 26 по-прежнему не шлются.
describe('previewToUpsert — товары и стороны «Из документов»', () => {
  const goods = {
    description: 'СУШИЛКА', tnvedCode: '7323990000', customsValue: 1602.7, packagesCount: 47, cargoPlacesQuantity: 47, quantity: null,
    characteristics: [{ name: null, quantity: 470, unitCode: '796', invoiceValue: 1602.7, manufacturerName: null, tradeMarkName: null,
      productMarkName: null, productModelName: null, productArticle: 'URS07', standardName: null, productSortName: null, serialNumbers: null }],
  } as never

  it('номер ДТ пуст, место поставки — только пункт, товары — построенные (фактурная → invoiceValue), гр. 44 и стороны', () => {
    const body = previewToUpsert(
      { declarationNumber: 'UR0910', incotermsPlace: '/ 交货条件: CIF ALMATY, KAZAKHSTAN', arrivalTransportNumbers: [{ number: 'H1', typeCode: null, isTrailer: false }] },
      {
        goods: [goods],
        sender: { party: { name: 'YIWU TEST', countryCode: '156', region: 'ZHEJIANG PROVINCE', city: 'YIWU', street: 'JIANG STREET' }, shortName: 'YIWU TEST', house: 'BLOCK B', apt: 'ROOM 7', district: null },
        receiverBin: '220940001302',
        doc44Items: [{ docTypeCode: '04021', docNumber: 'UR0910' } as never],
      },
    )
    expect(body.declarationNumber).toBeNull()
    expect(body.incotermsPlace).toBe('АЛМАТЫ')
    expect(body.sender).toEqual({ name: 'YIWU TEST', countryCode: '156', region: 'ZHEJIANG PROVINCE', city: 'YIWU', street: 'JIANG STREET' })
    expect(body).toMatchObject({ senderShortName: 'YIWU TEST', senderHouse: 'BLOCK B', senderApt: 'ROOM 7', receiverBin: '220940001302' })
    expect(body).not.toHaveProperty('senderDistrict')
    expect(body.doc44Items).toHaveLength(1)
    const g = body.goodsItems![0]
    expect(g).toMatchObject({ invoiceValue: 1602.7, packagesCount: 47, cargoPlacesQuantity: 47, quantity: null })
    expect(g).not.toHaveProperty('customsValue')
    expect(g.characteristics![0]).toMatchObject({ quantity: 470, unitCode: '796', invoiceValue: 1602.7 })
    // контракт с пакетом transport: гр. 18 с ролями, без гр. 25 / 26
    expect(body.arrivalTransportNumbers).toHaveLength(1)
    expect(body).not.toHaveProperty('borderTransportModeCode')
    expect(body).not.toHaveProperty('inlandTransportModeCode')
    expect(body).not.toHaveProperty('arrivalTransportModeCode')
  })

  it('без товаров в построенном — товаров в теле нет; без построенного — прежнее отображение с моделью в строке', () => {
    expect(previewToUpsert({ goodsItems: [{ description: 'X' }] }, { goods: [] }).goodsItems).toBeUndefined()
    const legacy = previewToUpsert({ goodsItems: [{ description: 'X', productModelName: 'M-1' }] })
    expect(legacy.goodsItems![0].characteristics![0]).toMatchObject({ productModelName: 'M-1' })
  })
})
