import { describe, expect, it } from 'vitest'
import type { DtGuideEntry } from '@/types/api'
import { filterGuide, tidyGuideHtml } from '../dtGuide'

const e = (graph: string, title: string, html = ''): DtGuideEntry => ({ graph, title, html })
const ENTRIES = [
  e('1', 'Декларация'), e('3', 'Формы', '<p>div table</p>'), e('31', 'Грузовые места и описание товаров'),
  e('32', 'Номер товара'), e('33', 'Код товара'), e('44', 'Дополнительная информация/представленные документы'),
]
const graphs = (q: string) => filterGuide(ENTRIES, q).map((x) => x.graph)

describe('filterGuide', () => {
  it('пустой запрос — все графы в порядке сервера', () => {
    expect(graphs('')).toEqual(['1', '3', '31', '32', '33', '44'])
    expect(graphs('   ')).toEqual(['1', '3', '31', '32', '33', '44'])
  })

  it('номер: точное совпадение — первым, затем номера с этим началом, затем названия', () => {
    expect(graphs('3')).toEqual(['3', '31', '32', '33'])
    expect(graphs('31')).toEqual(['31'])
  })

  it('«гр. 31» и «графа 31» — тот же номер', () => {
    expect(graphs('гр. 31')).toEqual(['31'])
    expect(graphs('Графа 31')).toEqual(['31'])
  })

  it('название: по вхождению без учёта регистра; текст графы и разметка не ищутся', () => {
    expect(graphs('товар')).toEqual(['31', '32', '33'])
    expect(graphs('КОД ТОВАРА')).toEqual(['33'])
    expect(graphs('div')).toEqual([])
    expect(graphs('table')).toEqual([])
  })

  it('точный номер всплывает выше названий', () => {
    const list = [e('2', 'Отправитель'), e('44', 'Графа 4 дополнительно'), e('4', 'Ставка')]
    expect(filterGuide(list, '4').map((x) => x.graph)).toEqual(['4', '44'])
  })
})

describe('tidyGuideHtml', () => {
  it('убирает отступ из пробелов в начале абзацев и пустые абзацы', () => {
    expect(tidyGuideHtml('<p>&nbsp;&nbsp;&nbsp; 6 Всего мест</p><p> </p><p><br></p><p>Текст</p>')).toBe('<p>6 Всего мест</p><p>Текст</p>')
  })
})
