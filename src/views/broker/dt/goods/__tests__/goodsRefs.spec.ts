import { describe, expect, it } from 'vitest'
import type { Import40PrevDocItem } from '@/api/import40'
import type { Import40Doc44ItemInput } from '@/types/api'
import { goodsRefsImpact, remapGoodsRefs } from '../goodsRefs'

const doc = (o: Partial<Import40Doc44ItemInput>): Import40Doc44ItemInput => ({
  docTypeCode: '01011', docTypeName: null, docNumber: o.docNumber ?? 'N', docDate: null,
  goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: null, ...o,
})
const prev = (o: Partial<Import40PrevDocItem>): Import40PrevDocItem => ({
  docTypeCode: '09013', docNumber: o.docNumber ?? 'P', docDate: null, goodsNumber: null, goodsItemIndex: null, sortOrder: 0, ...o,
})
/** Удаление позиций removed из n товаров → карта «старая позиция → новая / null». */
const removing = (n: number, removed: number[]) => {
  let k = 0
  return Array.from({ length: n }, (_, i) => (removed.includes(i) ? null : k++))
}

describe('goodsRefs (G1): привязки гр. 44 / гр. 40 к товарам по позиции', () => {
  it('гр. 44 CSV (с 0): удалённый товар выпадает, остальные сдвигаются; документ только удалённого товара — удаляется', () => {
    const form = {
      doc44Items: [
        doc({ docNumber: 'A', goodsItemIndexes: '0,2,3' }),
        doc({ docNumber: 'B', goodsItemIndexes: '1' }), // только удаляемый товар 2
        doc({ docNumber: 'C', goodsItemIndexes: '3' }),
        doc({ docNumber: 'ALL', appliesToAll: true }),
        doc({ docNumber: 'LEGACY' }), // ни индекса, ни CSV — «на все товары»
      ],
      prevDocItems: [],
    }
    const res = remapGoodsRefs(form, removing(4, [1]))
    expect(form.doc44Items.map((d) => [d.docNumber, d.goodsItemIndexes ?? null])).toEqual([
      ['A', '0,1,2'], ['C', '2'], ['ALL', null], ['LEGACY', null],
    ])
    expect(res.droppedDoc44.map((d) => d.docNumber)).toEqual(['B'])
  })

  it('гр. 44 одиночный индекс (старые ДТ): сдвиг; удалён, но есть CSV — остаётся CSV; без привязок — документ удаляется', () => {
    const form = {
      doc44Items: [
        doc({ docNumber: 'S', goodsItemIndex: 3 }),
        doc({ docNumber: 'S+CSV', goodsItemIndex: 1, goodsItemIndexes: '2' }),
        doc({ docNumber: 'GONE', goodsItemIndex: 1 }),
      ],
      prevDocItems: [],
    }
    remapGoodsRefs(form, removing(4, [1]))
    expect(form.doc44Items.map((d) => [d.docNumber, d.goodsItemIndex ?? null, d.goodsItemIndexes ?? null])).toEqual([
      ['S', 2, null], ['S+CSV', null, '1'],
    ])
  })

  it('гр. 40: goodsNumber (строка, с 1) и goodsItemIndex (с 0) сдвигаются; документ удалённого товара — удаляется; sortOrder по месту', () => {
    const form = {
      doc44Items: [],
      prevDocItems: [
        prev({ docNumber: 'P1', goodsNumber: '3', sortOrder: 0 }),
        prev({ docNumber: 'P2', goodsNumber: '2', sortOrder: 1 }),
        prev({ docNumber: 'P3', goodsItemIndex: 2, goodsNumber: '3', sortOrder: 2 }),
        prev({ docNumber: 'ALL', sortOrder: 3 }),
        prev({ docNumber: 'ODD', goodsNumber: 'см. 2', sortOrder: 4 }),
      ],
    }
    const res = remapGoodsRefs(form, removing(3, [1]))
    expect(form.prevDocItems.map((p) => [p.docNumber, p.goodsNumber, p.goodsItemIndex, p.sortOrder])).toEqual([
      ['P1', '2', null, 0], ['P3', '2', 1, 1], ['ALL', null, null, 2], ['ODD', 'см. 2', null, 3],
    ])
    expect(res.droppedPrevDocs.map((p) => p.docNumber)).toEqual(['P2'])
  })

  it('перестановка: привязки едут за товаром (CSV, одиночный, гр. 40)', () => {
    const form = {
      doc44Items: [doc({ docNumber: 'A', goodsItemIndexes: '0,2' }), doc({ docNumber: 'S', goodsItemIndex: 1 })],
      prevDocItems: [prev({ goodsNumber: '1', goodsItemIndex: 0 })],
    }
    // товар 0 → в конец: [1, 2, 0]; карта старое → новое
    const res = remapGoodsRefs(form, [2, 0, 1])
    expect(form.doc44Items.map((d) => [d.goodsItemIndexes ?? null, d.goodsItemIndex ?? null])).toEqual([['2,1', null], [null, 0]])
    expect(form.prevDocItems[0]).toMatchObject({ goodsNumber: '3', goodsItemIndex: 2 })
    expect(res.droppedDoc44).toEqual([])
  })

  it('индекс вне списка товаров (товара уже нет) — не трогаем; без изменений — те же значения', () => {
    const d = doc({ goodsItemIndexes: '1,9' })
    const form = { doc44Items: [d], prevDocItems: [prev({ goodsNumber: '12' })] }
    remapGoodsRefs(form, [0, 1, 2]) // вставка в конец — тождество
    expect(d.goodsItemIndexes).toBe('1,9')
    remapGoodsRefs(form, [1, 0, 2])
    expect(d.goodsItemIndexes).toBe('0,9')
    expect(form.prevDocItems[0].goodsNumber).toBe('12')
  })

  it('goodsRefsImpact: сколько документов уйдёт вместе с товарами, форма не меняется', () => {
    const form = {
      doc44Items: [doc({ goodsItemIndexes: '1' }), doc({ goodsItemIndexes: '1,2' }), doc({ appliesToAll: true })],
      prevDocItems: [prev({ goodsNumber: '2' }), prev({ goodsNumber: '3' })],
    }
    expect(goodsRefsImpact(form, removing(3, [1]))).toEqual({ doc44: 1, prevDocs: 1 })
    expect(form.doc44Items).toHaveLength(3)
    expect(form.doc44Items[1].goodsItemIndexes).toBe('1,2')
  })
})
