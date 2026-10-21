import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40GoodsItemInput } from '@/types/api'
import { goodsFromSheetRows } from '@/utils/goodsExcel'
import { appendCodes, gs1CheckDigitOk, gtinLineProblems, gtinProblem, ntinProblem, parseCodes } from '../editor/tradeCodes'
import GoodsTradeCodesBlock from '../editor/GoodsTradeCodesBlock.vue'
import { excelPreview } from '../goodsImport'
import { buildGoods } from '../importBuild'
import { fromExcelRow } from '../importRows'
import { goodsExportRows } from '../goodsExport'
import { goodsFieldFromReadiness } from '../goodsFieldTarget'
import { cloneGoodsItem, newDtGoodsItem } from '../useDtGoods'
import { dtoToForm, emptyDtForm, formToPayload } from '../../dtPayload'
import type { Import40DeclarationDto } from '@/api/import40'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

// Гр. 33.3 «Маркировка» (15.10): NTIN (13 цифр, «02…», контрольная цифра GS1) и GTIN/артикул. Проверки совпадают с
// сервером (Import40GoodsTradeCodes) — только подсказка.
const NTIN1 = '0200000123451'
const NTIN2 = '0276543210125'

describe('гр. 33.3 — проверки формата', () => {
  it('контрольная цифра GS1', () => {
    for (const ok of ['4006381333931', '96385074', '036000291452', '00012345600012', NTIN1]) expect(gs1CheckDigitOk(ok)).toBe(true)
    expect(gs1CheckDigitOk('4006381333932')).toBe(false)
    expect(gs1CheckDigitOk('0200000123456')).toBe(false)
  })

  it('NTIN: цифры, 13 знаков, «02», контрольная цифра; пусто — без подсказки', () => {
    expect(ntinProblem(NTIN1)).toBeNull()
    expect(ntinProblem(' 0200 0001 2345 1 ')).toBeNull()
    expect(ntinProblem('')).toBeNull()
    expect(ntinProblem('02000001234AB')).toEqual({ kind: 'digits' })
    expect(ntinProblem('020000012345')).toEqual({ kind: 'ntinLength', n: 12 })
    expect(ntinProblem('4601234567893')).toEqual({ kind: 'prefix' })
    expect(ntinProblem('0200000123456')).toEqual({ kind: 'check' })
  })

  it('GTIN: 8/12/13/14 цифр и контрольная цифра; артикул с буквами не проверяется', () => {
    expect(gtinProblem('4006381333931')).toBeNull()
    expect(gtinProblem('ART-12345')).toBeNull()
    expect(gtinProblem('12345')).toEqual({ kind: 'gtinLength', n: 5 })
    expect(gtinProblem('4006381333932')).toEqual({ kind: 'check' })
    expect(gtinLineProblems('4006381333931\nART-1\n\n 4006381333932 ')).toEqual([{ line: '4006381333932', problem: { kind: 'check' } }])
  })

  it('вставка списком: строки, запятые, пробелы; 13 цифр с пробелами — один код; без повторов', () => {
    expect(parseCodes(`${NTIN1}\n${NTIN2}, 0200000000011;\t4006381333931 ART-1`))
      .toEqual([NTIN1, NTIN2, '0200000000011', '4006381333931', 'ART-1'])
    expect(parseCodes('0200 0001 2345 1')).toEqual([NTIN1])
    const list = ['', NTIN1]
    expect(appendCodes(list, [NTIN1, NTIN2, NTIN2, ' '])).toEqual({ added: 1, duplicates: 2 })
    expect(list).toEqual([NTIN2, NTIN1]) // пустая строка заполняется первой
  })
})

describe('GoodsTradeCodesBlock', () => {
  const mount = (o: Partial<Import40GoodsItemInput> = {}, readonly = false) => {
    const item = reactive<Import40GoodsItemInput>({ ...newDtGoodsItem('USD'), ...o })
    const w = mountWithI18n(GoodsTradeCodesBlock, {
      props: { item, index: 0, readonly, model: {} as never, ctx: {} as never },
      attachTo: document.body,
    })
    return { w, item }
  }

  it('добавить строку — фокус в ней; Enter в заполненной последней — новая строка; удалить', async () => {
    const { w, item } = mount()
    expect(w.find('[data-ntin-empty]').exists()).toBe(true)
    await w.find('[data-ntin-add]').trigger('click')
    await nextTick()
    expect(item.ntins).toEqual([''])
    const input = w.find<HTMLInputElement>('input[data-f="ntin-0"]')
    expect(document.activeElement).toBe(input.element)
    await input.setValue('0200 0001 2345 1')
    expect(item.ntins).toEqual([NTIN1])
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(item.ntins).toEqual([NTIN1, ''])
    expect(document.activeElement).toBe(w.find('input[data-f="ntin-1"]').element)
    await w.find('[data-ntin-remove="1"]').trigger('click')
    expect(item.ntins).toEqual([NTIN1])
    w.unmount()
  })

  it('вставка нескольких кодов в строку раскладывает их по строкам', async () => {
    const { w, item } = mount({ ntins: [''] })
    const input = w.find('input[data-f="ntin-0"]')
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => `${NTIN1}\n${NTIN2}\n${NTIN1}` } })
    input.element.dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented).toBe(true)
    expect(item.ntins).toEqual([NTIN1, NTIN2])
    expect(toast.success).toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalled()
    w.unmount()
  })

  it('«Вставить списком» добавляет коды; подсказки формата у строки и у GTIN', async () => {
    const { w, item } = mount({ ntins: [NTIN1] })
    await w.find('[data-ntin-paste-open]').trigger('click')
    await w.find('textarea[data-f="ntin-paste"]').setValue('0200000123456, 4601234567893')
    await w.find('[data-ntin-paste-apply]').trigger('click')
    expect(item.ntins).toEqual([NTIN1, '0200000123456', '4601234567893'])
    expect(w.find('[data-ntin-paste]').exists()).toBe(false)
    expect(w.find('[data-ntin-problem="0"]').exists()).toBe(false)
    expect(w.find('[data-ntin-problem="1"]').text()).toContain('контрольная цифра')
    expect(w.find('[data-ntin-problem="2"]').text()).toContain('начинается с 02')
    expect(w.find('[data-ntin-count]').text()).toContain('с ошибкой: 2')

    await w.find('textarea[data-f="gtin"]').setValue('4006381333932\nART-1')
    expect(item.gtin).toBe('4006381333932\nART-1')
    expect(w.find('[data-goods-field="gtin"]').text()).toContain('4006381333932 — не сходится контрольная цифра')
    await w.find('textarea[data-f="gtin"]').setValue('  ')
    expect(item.gtin).toBeNull()
    w.unmount()
  })

  it('только чтение — без кнопок', () => {
    const { w } = mount({ ntins: [NTIN1], gtin: 'ART-1' }, true)
    expect(w.find('[data-ntin-add]').exists()).toBe(false)
    expect(w.find('[data-ntin-remove="0"]').exists()).toBe(false)
    expect(w.find<HTMLInputElement>('input[data-f="ntin-0"]').element.disabled).toBe(true)
    w.unmount()
  })
})

describe('гр. 33.3 — данные ДТ, Excel, «До подачи»', () => {
  it('ответ сервера → форма → тело PUT: NTIN и GTIN всегда в теле (поле есть — сервер заменит)', () => {
    const dto = { goodsItems: [{ id: 'g1', sortOrder: 0, ntins: [NTIN1], gtin: 'ART-1' }, { id: 'g2', sortOrder: 1 }] } as unknown as Import40DeclarationDto
    const form = dtoToForm(dto)
    expect(form.goodsItems[0].ntins).toEqual([NTIN1])
    expect(form.goodsItems[1].ntins).toEqual([])
    const body = formToPayload(form, null)
    expect(body.goodsItems![0]).toMatchObject({ ntins: [NTIN1], gtin: 'ART-1' })
    expect(body.goodsItems![1]).toMatchObject({ ntins: [], gtin: null })
    expect(emptyDtForm().goodsItems).toEqual([])
  })

  it('копия товара — свой список NTIN', () => {
    const g = { ...newDtGoodsItem('USD'), ntins: [NTIN1] }
    const c = cloneGoodsItem(g)
    c.ntins!.push(NTIN2)
    expect(g.ntins).toEqual([NTIN1])
  })

  it('Excel: столбцы NTIN/GTIN только для ДТ; ведущий ноль NTIN из числа возвращается', () => {
    const rows = [
      ['Код ТН ВЭД', 'Коммерческое описание', 'NTIN (гр. 33.3)', 'GTIN или другой идентификационный код (артикул)'],
      ['1806310000', 'ШОКОЛАД', 200000123451, 4006381333931],
      ['1806320000', 'КОНФЕТЫ', `${NTIN1}, ${NTIN2}`, 'ART-1, ART-2'],
      [null, null, NTIN2, null],
    ]
    const transit = goodsFromSheetRows(rows)
    expect(transit).toHaveLength(2)
    expect('ntins' in transit[0]).toBe(false)

    // Строка без кода и наименования (только NTIN) — не товар (правило разбора с 19.10; до пакета импорта тест ждал 3).
    const dt = goodsFromSheetRows(rows, { tradeCodes: true })
    expect(dt).toHaveLength(2)
    expect(dt[0]).toMatchObject({ ntins: [NTIN1], gtin: '4006381333931' })
    expect(dt[1]).toMatchObject({ ntins: [NTIN1, NTIN2], gtin: 'ART-1\nART-2' })
    const importRows = dt.map((r) => fromExcelRow(r, 'x.xlsx'))
    const built = buildGoods(importRows, { currency: 'USD', packageKinds: [], resolved: null })
    expect(excelPreview(importRows, built).recognized.tradeCodes).toBe(2)
    expect(built.goods[1].ntins).toEqual([NTIN1, NTIN2])
    expect(built.goods[1].gtin).toBe('ART-1\nART-2')
  })

  it('выгрузка в Excel: столбцы NTIN и GTIN', () => {
    const t = (k: string) => k.split('.').pop()!
    const [row] = goodsExportRows([{ ...newDtGoodsItem('USD'), ntins: [NTIN1, ' ', NTIN2], gtin: 'ART-1\nART-2' }], t)
    expect(row.ntin).toBe(`${NTIN1}, ${NTIN2}`)
    expect(row.gtin).toBe('ART-1\nART-2')
    const [empty] = goodsExportRows([newDtGoodsItem('USD')], t)
    expect(empty.ntin).toBeNull()
  })

  it('пункт «До подачи» про гр. 33.3 ведёт к полю NTIN или GTIN', () => {
    expect(goodsFieldFromReadiness('Товар 1: гр.33.3 — NTIN 0200000123456 — не сходится контрольная цифра')).toBe('ntins')
    expect(goodsFieldFromReadiness('Товар 1: гр.33.3 — GTIN 4006381333932 — не сходится контрольная цифра')).toBe('gtin')
    expect(goodsFieldFromReadiness('Товар 1: гр.33 — КЕДЕН для ТН ВЭД 1806 не примет D0110')).toBe('prohibitionCode')
  })
})
