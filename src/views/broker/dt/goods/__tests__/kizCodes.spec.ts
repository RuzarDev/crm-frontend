import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import { appendKizNumbers, appendKizRows, kizHeaderRank, kizNumberProblem, parseKizPaste, splitKizText } from '../editor/kizCodes'
import { deriveKizDefaults } from '../editor/kizDefaults'

// КИЗ гр. 31.13 (правка №12): вставка столбца GTIN, проверка контрольной цифры GS1 (только предупреждение).
const G1 = '4871813090801'
const G2 = '4871813090818'
const BAD = '4871813090802'

describe('parseKizPaste', () => {
  it('столбец через \\r\\n, ведущий «\'», пробелы внутри GTIN, «;» и «,»', () => {
    expect(parseKizPaste(`${G1}\r\n'${G2}\r\n\r\n4 871813 090801`)).toEqual([G1, G2, G1])
    expect(parseKizPaste(`${G1}; ${G2},4006381333931`)).toEqual([G1, G2, '4006381333931'])
    // Несколько GTIN через пробел — не склеиваются; буквы — заглавными, делятся по пробелам.
    expect(parseKizPaste(`${G1} ${G2}`)).toEqual([G1, G2])
    expect(parseKizPaste('ab-1 cd-2')).toEqual(['AB-1', 'CD-2'])
    expect(parseKizPaste('')).toEqual([])
  })

  it('первая строка — шапка («Штрих-код», «GTIN») — пропускается', () => {
    expect(parseKizPaste(`Штрих-код\n${G1}\n${G2}`)).toEqual([G1, G2])
  })

  it('два столбца Excel (№ позиции и GTIN) — берётся столбец GTIN; с шапкой — по шапке', () => {
    expect(parseKizPaste(`1\t${G1}\n2\t${G2}\n3\t4006381333931`)).toEqual([G1, G2, '4006381333931'])
    expect(parseKizPaste(`№\tНаименование\tEAN-13\n1\tСушилка\t${G1}\n2\tПолка\t${G2}`)).toEqual([G1, G2])
    // Номер инвойса (10 цифр) и GTIN — по содержимому берётся GTIN.
    expect(parseKizPaste(`2026020201\t${G1}\n2026020201\t${G2}`)).toEqual([G1, G2])
  })
})

describe('kizHeaderRank', () => {
  it('GTIN / штрихкод / barcode / 条形码 — ранг 0, EAN — 1 (отдельным словом), КИЗ — 2; NTIN и количество — нет', () => {
    for (const h of ['GTIN', 'Штрих-код', 'Штрих код товара', 'Barcode', '条形码', '商品条码', 'UPC']) expect(kizHeaderRank(h), h).toBe(0)
    for (const h of ['EAN-13', 'EAN13', 'Код EAN', 'EAN码']) expect(kizHeaderRank(h), h).toBe(1)
    for (const h of ['КИЗ', 'Код идентификации', 'Код маркировки', 'DataMatrix']) expect(kizHeaderRank(h), h).toBe(2)
    for (const h of ['European standard', 'Ocean freight', 'NTIN', 'Кол-во КИЗ', 'Вид средства идентификации', 'Invoice No', null, 4871813090801]) {
      expect(kizHeaderRank(h), String(h)).toBeNull()
    }
  })

  it('splitKizText: ячейка с несколькими кодами', () => {
    expect(splitKizText(`${G1}\n${G2}`)).toEqual([G1, G2])
    expect(splitKizText('rU-123456-abcde12345')).toEqual(['RU-123456-ABCDE12345'])
  })
})

describe('kizNumberProblem', () => {
  it('GS1 при AI 01/02 или пустом; 21 и прочие — без проверки; буквы и контрольные знаки — без проверки', () => {
    expect(kizNumberProblem(G1, '01')).toBeNull()
    expect(kizNumberProblem(G1, null)).toBeNull()
    expect(kizNumberProblem(`0${G1}`, '01')).toBeNull()
    expect(kizNumberProblem(BAD, '01')).toEqual({ kind: 'check' })
    expect(kizNumberProblem(BAD, null)).toEqual({ kind: 'check' })
    expect(kizNumberProblem(BAD, '02')).toEqual({ kind: 'check' })
    expect(kizNumberProblem(BAD, '21')).toBeNull()
    expect(kizNumberProblem('0104600000000001', '01')).toEqual({ kind: 'gtinLength', n: 16 })
    expect(kizNumberProblem('0104600000000001', null)).toBeNull()
    expect(kizNumberProblem('010460ABC', '01')).toBeNull()
    expect(kizNumberProblem('RU-123456-ABCDE12345', '01')).toBeNull()
    expect(kizNumberProblem('96385074', '01')).toBeNull()
    expect(kizNumberProblem('', '01')).toBeNull()
  })
})

describe('appendKizNumbers / appendKizRows', () => {
  const d = deriveKizDefaults([{ number: 'X', levelCode: '0', idApplicationCode: '01', idTypeCode: '999', kizCount: 1, aggregated: false }])
  const item = (markings: Import40GoodsMarking[]) => reactive({ markings } as unknown as Import40GoodsItemInput)

  it('пустые строки заполняются первыми (строка at — первой), повторы пропускаются и считаются, остальные — с общими значениями', () => {
    const g = item([{ number: 'OLD' }, { number: null, levelCode: '3' }, { number: G1 }, { number: '' }])
    expect(appendKizNumbers(g, [G2, ' 4871813090801 ', '4006381333931', G2, '96385074'], d, 3)).toEqual({ added: 3, duplicates: 2 })
    expect(g.markings!.map((m) => m.number)).toEqual(['OLD', '4006381333931', G1, G2, '96385074'])
    // Заполненная пустая строка сохраняет свои поля, новая — общие значения.
    expect(g.markings![1].levelCode).toBe('3')
    expect(g.markings![4]).toMatchObject({ levelCode: '0', idApplicationCode: '01', idTypeCode: '999', kizCount: 1, aggregated: false, markingAfterRelease: false })
  })

  it('без массива строк — создаётся; повтор сравнивается без пробелов и регистра', () => {
    const g = reactive({} as Import40GoodsItemInput)
    expect(appendKizNumbers(g, ['ab-1', 'AB-1'], d)).toEqual({ added: 1, duplicates: 1 })
    expect(g.markings).toHaveLength(1)
  })

  it('старый формат: строки со своими значениями, без номера и повторы — пропуск', () => {
    const g = item([{ number: 'A1' }])
    const res = appendKizRows(g, [
      { number: 'A1', levelCode: '1' }, { number: null, levelCode: '0' }, { number: 'B2', levelCode: '2', idApplicationCode: '21' },
    ])
    expect(res).toEqual({ added: 1, duplicates: 1 })
    expect(g.markings!.map((m) => [m.number, m.levelCode, m.idApplicationCode])).toEqual([['A1', undefined, undefined], ['B2', '2', '21']])
  })
})
