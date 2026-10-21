import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readExcelDocuments } from '@/utils/goodsExcel'
import { buildGoods } from '../importBuild'
import { fromExcelRow } from '../importRows'

// Реальный шаблон декларанта (docs/declarant-samples-1021/hozka-template.xlsx, 21.10.2026) через весь конвейер «Из Excel»:
// goodsExcel → importRows → importBuild. Это данные клиента, в git их нет: тест идёт, когда файл лежит рядом с репозиторием
// (основная копия — ../docs, рабочая копия wt/* — ../../docs) или в папке DECLARANT_SAMPLES_DIR; иначе пропускается.
// Те же правила на обезличенной выдержке — goodsExcel.spec.
const TEMPLATE = [process.env.DECLARANT_SAMPLES_DIR, '../docs/declarant-samples-1021', '../../docs/declarant-samples-1021']
  .filter((d): d is string => !!d)
  .map((d) => resolve(process.cwd(), d, 'hozka-template.xlsx'))
  .find((p) => existsSync(p)) ?? null

// Разбор зовёт только arrayBuffer(). ArrayBuffer из node:fs — из другой среды, чем ArrayBuffer jsdom, и xlsx его не узнаёт
// (читает как строку) — копируем байты в ArrayBuffer этой среды.
const fileOf = (path: string): Blob => {
  const buf = readFileSync(path)
  const ab = new ArrayBuffer(buf.length)
  new Uint8Array(ab).set(buf)
  return { arrayBuffer: async () => ab } as Blob
}

describe.skipIf(!TEMPLATE)('реальный шаблон декларанта hozka-template.xlsx', () => {
  // Решение владельца 21.10.2026: «Отсутствует» — осознанное значение декларанта, переносится как есть (ЗАГЛАВНЫМИ).
  it('«Отсутствует» в марке, знаке, серийном, модели, ГОСТ и сорте — в строку гр. 31 как «ОТСУТСТВУЕТ»', async () => {
    const res = await readExcelDocuments(fileOf(TEMPLATE!), { details: true, tradeCodes: true })
    if ('problem' in res) throw new Error(`шаблон не прочитан: ${res.problem}`)
    const rows = res.docs.flatMap((d) => d.goods.map((g) => fromExcelRow(g, 'hozka-template.xlsx')))
    expect(rows).toHaveLength(38)
    const { goods } = buildGoods(rows, { currency: 'USD', packageKinds: [], resolved: null })
    for (const g of goods) {
      expect(g.characteristics![0]).toMatchObject({
        manufacturerName: 'YIWU LONGJU TRADING FIRM',
        tradeMarkName: 'ОТСУТСТВУЕТ',
        productMarkName: 'ОТСУТСТВУЕТ',
        serialNumbers: 'ОТСУТСТВУЕТ',
        productModelName: 'ОТСУТСТВУЕТ',
        standardName: 'ОТСУТСТВУЕТ',
        productSortName: 'ОТСУТСТВУЕТ',
      })
    }
    // Строка 1 — товар со скриншотов правок №1–5: описание как в документе, артикул и количество в строке гр. 31.
    expect(goods[0]).toMatchObject({ tnvedCode: '7323990000', description: 'СУШИЛКА ДЛЯ БЕЛЬЯ 18 М' })
    expect(goods[0].characteristics![0]).toMatchObject({ productArticle: 'URS07', quantity: 470 })
  })
})
