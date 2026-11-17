import { describe, expect, it } from 'vitest'
import { dataToDraft, draftToData, missingLabel, missingSection, missingTarget, TD_SECTIONS } from '../tdModel'
import { fullData, manyGoods } from './tdFixture'

describe('tdModel: dataToDraft / draftToData', () => {
  it('круговой проход без потерь: все коллекции и скаляры транзита', () => {
    const data = fullData()
    const draft = dataToDraft(data)
    expect(draft.fields).toEqual({})
    expect(draftToData(draft)).toEqual(data)
  })

  it('300 товаров с дробными брутто и стоимостью — без потерь и округления', () => {
    const data = fullData({ goods: manyGoods(300) })
    const back = draftToData(dataToDraft(data))
    expect(back.goods).toHaveLength(300)
    expect(back.goods[299]).toEqual(data.goods[299])
    expect(back.goods[0].grossWeightKg).toBe(10.1234)
    expect(back.goods[0].customsValue).toBe(1234.5678)
  })

  it('черновик — копия: правка черновика не меняет данные ответа', () => {
    const data = fullData()
    const draft = dataToDraft(data)
    draft.goods[0].description = 'другое'
    draft.transit.departureCountryCode = '000'
    expect(data.goods[0].description).toBe('Ноутбуки')
    expect(data.transit.departureCountryCode).toBe('156')
  })

  it('неполные данные (старый или пустой JSON): пустые списки, транзит без ЖД-умолчаний', () => {
    const draft = dataToDraft({ transit: { departureCountryCode: '156' } } as never)
    expect(draft.goods).toEqual([])
    expect(draft.organizations).toEqual([])
    expect(draft.transit.departureCountryCode).toBe('156')
    expect(draft.transit.entryMethodCode).toBeNull()
    expect(draft.transit.isMultimodal).toBe(false)
    expect(draft.sealNumber).toBeNull()
    expect(dataToDraft(null).guarantees).toEqual([])
  })

  it('незнакомые поля транзита не теряются', () => {
    const data = fullData()
    ;(data.transit as unknown as Record<string, unknown>).futureField = 'x'
    expect((draftToData(dataToDraft(data)).transit as unknown as Record<string, unknown>).futureField).toBe('x')
  })
})

describe('tdModel: незаполненное', () => {
  it('раздел — из section ответа', () => {
    expect(missingSection({ key: 'organizations.consignee', section: 'organizations' })).toBe('organizations')
    expect(missingSection({ key: 'goods[2].tnvedCode', section: 'goods' })).toBe('goods')
  })

  it('section пуст или неизвестен — раздел по ключу', () => {
    expect(missingSection({ key: 'goods[2].tnvedCode', section: '' })).toBe('goods')
    expect(missingSection({ key: 'transit.departureCountryCode', section: 'x' })).toBe('main')
    expect(missingSection({ key: 'destinationCustomsOffice', section: '' })).toBe('main')
    expect(missingSection({ key: 'transportMeans', section: '' })).toBe('transport')
    expect(missingSection({ key: 'guarantees', section: '' })).toBe('guarantees')
    expect(missingSection({ key: 'непонятно', section: '' })).toBe('main')
    // «Строка реестра» на странице ТД нет — в «Основное».
    expect(missingSection({ key: 'x', section: 'row' })).toBe('main')
  })

  it('поле для фокуса: имя и номер строки', () => {
    expect(missingTarget({ key: 'goods[2].tnvedCode', section: 'goods' })).toEqual({ field: 'tnvedCode', index: 2 })
    expect(missingTarget({ key: 'transit.departureCountryCode', section: 'main' })).toEqual({ field: 'departureCountryCode', index: 0 })
    expect(missingTarget({ key: 'organizations.consignee', section: 'organizations' })).toEqual({ field: null, index: 0 })
  })

  it('подпись: товар по номеру (с 1), известные ключи, запасная', () => {
    expect(missingLabel({ key: 'goods[2].tnvedCode', section: 'goods' })).toEqual({ key: 'goodsItem', params: { n: 3, field: 'tnvedCode' } })
    expect(missingLabel({ key: 'organizations.consignee', section: 'organizations' })).toEqual({ key: 'organizations_consignee', params: {} })
    expect(missingLabel({ key: 'transit.departureCountryCode', section: 'main' })).toEqual({ key: 'departureCountryCode', params: {} })
  })

  it('порядок разделов страницы ТД — без «Строки реестра», контейнеры отдельно', () => {
    expect(TD_SECTIONS).toEqual(['main', 'organizations', 'carriers', 'transport', 'seals', 'goods', 'doc44', 'packaging', 'preceding', 'guarantees', 'misc'])
  })
})
