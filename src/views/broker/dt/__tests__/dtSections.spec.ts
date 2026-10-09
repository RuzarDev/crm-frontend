// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DT_SECTIONS,
  goodsIndexFromText,
  graphFromText,
  normalizeGraph,
  sectionForGraph,
  sectionForReadinessItem,
} from '../dtSections'

describe('dtSections — разделы и графы', () => {
  it('порядок разделов как на доске', () => {
    expect(DT_SECTIONS.map((s) => s.key)).toEqual([
      'number', 'general', 'parties', 'countries', 'transport', 'finance', 'customs', 'goods', 'docs', 'dts', 'closing',
    ])
  })

  it('каждая графа принадлежит одному разделу', () => {
    const seen = new Map<string, string>()
    for (const s of DT_SECTIONS) for (const g of s.graphs) {
      expect(seen.get(g), `гр.${g} в ${seen.get(g)} и ${s.key}`).toBeUndefined()
      seen.set(g, s.key)
    }
  })

  it.each([
    ['А', 'number'], ['A', 'number'], ['а', 'number'],
    ['1', 'general'], ['3', 'general'], ['4', 'general'], ['5', 'general'], ['6', 'general'], ['7', 'general'],
    ['2', 'parties'], ['8', 'parties'], ['9', 'parties'], ['14', 'parties'],
    ['11', 'countries'], ['15', 'countries'], ['16', 'countries'], ['17', 'countries'],
    ['18', 'transport'], ['19', 'transport'], ['21', 'transport'], ['25', 'transport'], ['26', 'transport'],
    ['12', 'finance'], ['20', 'finance'], ['22', 'finance'], ['23', 'finance'], ['24', 'finance'],
    ['29', 'customs'], ['30', 'customs'],
    ['31', 'goods'], ['33', 'goods'], ['36', 'goods'], ['37', 'goods'], ['45', 'goods'], ['47', 'goods'], ['31.2', 'goods'],
    ['40', 'docs'], ['44', 'docs'],
    ['ДТС', 'dts'], ['дтс', 'dts'],
    ['48', 'closing'], ['52', 'closing'], ['54', 'closing'], ['В', 'closing'], ['B', 'closing'], ['b', 'closing'],
    ['Гр.8', 'parties'], ['гр. 30', 'customs'], [' 44 ', 'docs'],
  ])('гр.%s → %s (регистр и латиница не важны)', (graph, key) => {
    expect(sectionForGraph(graph)).toBe(key)
  })

  it('неизвестная или пустая графа → null', () => {
    expect(sectionForGraph('99')).toBeNull()
    expect(sectionForGraph('')).toBeNull()
    expect(sectionForGraph(null)).toBeNull()
    expect(normalizeGraph('  гр.31.2 ')).toBe('31')
  })
})

describe('dtSections — запасной разбор строки (нет items)', () => {
  it.each([
    ['Гр.2, отправитель: «Номер дома» длиннее 20 символов', '2'],
    ['Гр.8, получатель: длина полей адреса', '8'],
    ['гр.9 — финансовое урегулирование', '9'],
    ['Декларант: название и БИН (гр.14)', '14'],
    ['Гр.30 (код 52, товары в транспортном средстве): укажите номер вагона/ТС в гр.18', '30'],
    ['Гр.44: у документа № 1 не указан код вида документа', '44'],
    ['Инкотермс и место поставки (гр.20)', '20'],
    ['Транспорт на границе: вид транспорта (гр.21)', '21'],
    ['Нет ни одного товара (гр.31)', '31'],
    ['Орган подачи декларации (код таможенного органа)', 'А'],
    ['ДТС: не заполнена графа 7', 'ДТС'],
    ['Требуется заполнить графы 44', '44'],
    ['Что-то без графы', null],
    ['Упаковка: см. гр.31.2', '31'],
    ['Гр. 31.13 маркировка', '31'],
    ['гр.123 — такой графы нет', null],
  ])('«%s» → гр.%s', (text, graph) => {
    expect(graphFromText(text)).toBe(graph)
  })

  it('номер товара из «Товар N:» (0-based)', () => {
    expect(goodsIndexFromText('Товар 3: вес брутто (гр.35)')).toBe(2)
    expect(goodsIndexFromText('товар 1: КЕДЕН при процедуре ИМ40 не предлагает …')).toBe(0)
    expect(goodsIndexFromText('Гр.8, получатель')).toBeNull()
  })

  it('пункт с сервера: графа решает; без графы — товар; без всего — разбор строки, иначе «Общие»', () => {
    expect(sectionForReadinessItem({ text: 'x', graph: 'А', goodsIndex: null })).toBe('number')
    expect(sectionForReadinessItem({ text: 'Товар 1: гр.33 D0110 — в гр.44 нужен документ', graph: '44', goodsIndex: 0 })).toBe('docs')
    expect(sectionForReadinessItem({ text: 'x', graph: null, goodsIndex: 2 })).toBe('goods')
    expect(sectionForReadinessItem({ text: 'Товар 2: КЕДЕН при процедуре ИМ40 не предлагает 0Z' })).toBe('goods')
    expect(sectionForReadinessItem({ text: 'Гр.14, декларант: длина полей адреса' })).toBe('parties')
    expect(sectionForReadinessItem({ text: 'Орган подачи декларации (код таможенного органа)' })).toBe('number')
    expect(sectionForReadinessItem({ text: 'Непонятный пункт' })).toBe('general')
  })
})
