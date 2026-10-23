import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import { dtLabel } from '../caseSteps'
import { filterDeclarations, splitTag } from '../declarations'
import { clipWords, dtAutoTitle, dtTitleOf } from '../dtTitle'
import { caseDto, declaration } from './caseFixture'

// Названия ДТ (23.10.2026): автоназвание, подпись «ДТ 1 · …», поиск по названию.
const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } })
const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string

const goods = (...d: (string | null)[]) => d.map((description) => ({ description }))
const invoice = (docNumber: string | null, docTypeCode = '04021') => ({ docTypeCode, docNumber })

describe('dtAutoTitle', () => {
  it('описание первого товара; товаров больше одного — «· ещё N»', () => {
    expect(dtAutoTitle({ goodsItems: goods('Кушетка медицинская') }, t)).toBe('Кушетка медицинская')
    expect(dtAutoTitle({ goodsItems: goods('Кушетка медицинская', 'Стол', 'Стул') }, t)).toBe('Кушетка медицинская · ещё 2')
  })

  it('гр. 31 заглавными — как предложение; смешанный регистр — как есть', () => {
    expect(dtAutoTitle({ goodsItems: goods('КУШЕТКА С ВИНТОВОЙ РЕГУЛИРОВКОЙ') }, t)).toBe('Кушетка с винтовой регулировкой')
    expect(dtAutoTitle({ goodsItems: goods('Лампа LED E27') }, t)).toBe('Лампа LED E27')
  })

  it('обрезка по слову до ~40 знаков с «…»; одно длинное слово — по 40', () => {
    const title = dtAutoTitle({ goodsItems: goods('КУШЕТКА С ВИНТОВОЙ РЕГУЛИРОВКОЙ ВЫСОТЫ И НАКЛОНА СПИНКИ, ДЛЯ ПРОЦЕДУРНЫХ', 'СТОЛ') }, t)
    expect(title).toBe('Кушетка с винтовой регулировкой высоты… · ещё 1')
    expect(clipWords('а'.repeat(60))).toBe(`${'а'.repeat(40)}…`)
    expect(clipWords('Стол,   складной')).toBe('Стол, складной')
    // хвостовая запятая перед «…» убирается
    expect(clipWords('Кресло стоматологическое, ортопедическое, регулируемое по высоте')).toBe('Кресло стоматологическое, ортопедическое…')
  })

  it('первый товар без описания — берётся следующий; «ещё N» — по всем товарам', () => {
    expect(dtAutoTitle({ goodsItems: goods(null, '  ', 'Стол') }, t)).toBe('Стол · ещё 2')
  })

  it('без описаний — номер инвойса из гр. 44 (04021); другие документы не берутся', () => {
    expect(dtAutoTitle({ goodsItems: goods(null), doc44Items: [invoice('A-1', '03011'), invoice(' INV-77 ')] }, t)).toBe('Инвойс № INV-77')
    expect(dtAutoTitle({ goodsItems: [], doc44Items: [invoice(null)] }, t)).toBeNull()
  })

  it('ничего — null (подпись остаётся «ДТ N» или номер)', () => {
    expect(dtAutoTitle({}, t)).toBeNull()
  })

  it('своё название важнее автоназвания; пробелы — не название', () => {
    expect(dtTitleOf({ title: ' Партия 2 ', goodsItems: goods('Стол') }, t)).toEqual({ text: 'Партия 2', auto: false })
    expect(dtTitleOf({ title: '  ', goodsItems: goods('Стол') }, t)).toEqual({ text: 'Стол', auto: true })
    expect(dtTitleOf({ title: null }, t)).toEqual({ text: null, auto: true })
  })
})

describe('dtLabel', () => {
  it('«ДТ 1 · автоназвание», номер вместо «ДТ 1», своё название; без названия — как раньше', () => {
    const c = caseDto({
      declarations: [
        declaration({ id: 'd1', goodsItems: goods('Кушетка', 'Стол') as never }),
        declaration({ id: 'd2', declarationNumber: '55210/031026/0012240', title: 'Партия из Шанхая' }),
        declaration({ id: 'd3' }),
      ],
    })
    expect(dtLabel(c, 'd1', t)).toBe('ДТ 1 · Кушетка · ещё 1')
    expect(dtLabel(c, 'd2', t)).toBe('55210/031026/0012240 · Партия из Шанхая')
    expect(dtLabel(c, 'd3', t)).toBe('ДТ 3')
  })

  it('подсказка части разделения — исходная с названием', () => {
    const all = [
      declaration({ id: 'src', title: 'Исходная партия' }),
      declaration({ id: 'v1', splitRole: 'VTO', splitSourceDeclarationId: 'src' }),
    ]
    expect(splitTag(all[1], all, t)?.tip).toBe('Часть разделения исходной ДТ «ДТ 1 · Исходная партия»')
  })
})

describe('filterDeclarations: поиск по номеру и названию', () => {
  const list = [
    declaration({ id: 'd1', declarationNumber: '55210/031026/0012240' }),
    declaration({ id: 'd2', title: 'Партия из Шанхая' }),
    declaration({ id: 'd3', goodsItems: goods('КУШЕТКА МЕДИЦИНСКАЯ') as never }),
    declaration({ id: 'd4', doc44Items: [invoice('INV-77')] as never }),
  ]
  const ids = (q: string, withT = true) => filterDeclarations(list, q, withT ? t : undefined).map((d) => d.id)

  it('номер, своё название, автоназвание (без учёта регистра)', () => {
    expect(ids('0012240')).toEqual(['d1'])
    expect(ids('шанха')).toEqual(['d2'])
    expect(ids('кушетка')).toEqual(['d3'])
    expect(ids('inv-77')).toEqual(['d4'])
    expect(ids('  ')).toEqual(['d1', 'd2', 'd3', 'd4'])
  })

  it('без t — номер и своё название (как раньше, плюс название)', () => {
    expect(ids('кушетка', false)).toEqual([])
    expect(ids('шанха', false)).toEqual(['d2'])
  })
})
