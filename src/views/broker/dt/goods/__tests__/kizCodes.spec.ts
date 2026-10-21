import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import {
  KIZ_NUMBER_MAX, appendKizNumbers, appendKizRows, isKizCode, kizHeaderRank, kizKey, kizNumberProblem, parseKizPaste, splitKizText,
} from '../editor/kizCodes'
import { deriveKizDefaults } from '../editor/kizDefaults'

// КИЗ гр. 31.13 (правка №12): вставка столбца GTIN, проверка контрольной цифры GS1 (только предупреждение).
const G1 = '4871813090801'
const G2 = '4871813090818'
const BAD = '4871813090802'
const codesOf = (text: string) => parseKizPaste(text).codes

describe('parseKizPaste', () => {
  it('столбец через \\r\\n, ведущий «\'», пробелы внутри GTIN, «;» и «,»', () => {
    expect(codesOf(`${G1}\r\n'${G2}\r\n\r\n4 871813 090801`)).toEqual([G1, G2, G1])
    expect(codesOf(`${G1}; ${G2},4006381333931`)).toEqual([G1, G2, '4006381333931'])
    // Несколько GTIN через пробел — не склеиваются; буквы — заглавными, делятся по пробелам.
    expect(codesOf(`${G1} ${G2}`)).toEqual([G1, G2])
    expect(codesOf('ab-1 cd-2')).toEqual(['AB-1', 'CD-2'])
    expect(parseKizPaste('')).toEqual({ codes: [], skipped: 0 })
  })

  it('первая строка — шапка («Штрих-код», «GTIN») — пропускается; «GTIN: код» — шапкой не считается', () => {
    expect(parseKizPaste(`Штрих-код\n${G1}\n${G2}`)).toEqual({ codes: [G1, G2], skipped: 0 })
    // Ревью: строка «GTIN: 4871813090801» целиком считалась шапкой — первый GTIN терялся, «GTIN:» шёл кодом.
    expect(parseKizPaste(`GTIN: ${G1}\nGTIN: ${G2}`)).toEqual({ codes: [G1, G2], skipped: 0 })
  })

  it('два столбца Excel (№ позиции и GTIN) — берётся столбец GTIN; с шапкой — по шапке', () => {
    expect(codesOf(`1\t${G1}\n2\t${G2}\n3\t4006381333931`)).toEqual([G1, G2, '4006381333931'])
    expect(codesOf(`№\tНаименование\tEAN-13\n1\tСушилка\t${G1}\n2\tПолка\t${G2}`)).toEqual([G1, G2])
    // Номер инвойса (10 цифр) и GTIN — по содержимому берётся GTIN.
    expect(codesOf(`2026020201\t${G1}\n2026020201\t${G2}`)).toEqual([G1, G2])
    // Строка данных со «штрихкодом» в описании — не шапка: столбец — по содержимому, первый код не теряется.
    expect(codesOf(`Сканер штрихкода\t${G1}\nПолка\t${G2}`)).toEqual([G1, G2])
  })

  it('ревью: в номера идут только коды — длинная строка, текст письма, «Итого» пропускаются и считаются', () => {
    // Строка длиннее предела номера (колонка БД — 300, поле — 100): раньше уходила в PUT и ломала сохранение ДТ.
    expect(parseKizPaste(`https://example.test/${'a'.repeat(400)}\n${G1}`)).toEqual({ codes: [G1], skipped: 1 })
    expect(parseKizPaste(`${'A1'.repeat(210)}\n${G1}`)).toEqual({ codes: [G1], skipped: 1 })
    // Текст письма: слова не становятся номерами.
    expect(parseKizPaste(`Добрый день, высылаю коды\nКод товара\n${G1}`)).toEqual({ codes: [G1], skipped: 6 })
    expect(parseKizPaste(`Hello, please find codes\n${G1}`)).toEqual({ codes: [G1], skipped: 4 })
    expect(parseKizPaste(`Код\n${G1}\n${G2}\nИтого`)).toEqual({ codes: [G1, G2], skipped: 2 })
    // Несколько столбцов: в столбце кодов текст тоже считается.
    expect(parseKizPaste(`№\tGTIN\n1\t${G1}\n2\tнет кода`)).toEqual({ codes: [G1], skipped: 1 })
  })

  it('ревью: строка из 30 GTIN и короткого числа через пробел не склеивается в один «код» на сотни цифр', () => {
    const many = Array.from({ length: 30 }, () => G1)
    expect(parseKizPaste(`${many.join(' ')} 123`)).toEqual({ codes: many, skipped: 1 })
    expect(splitKizText(`${G1} ${G2} 123`)).toEqual([G1, G2, '123'])
    // Один номер, разбитый пробелами, — склеивается.
    expect(splitKizText('48718 13090801')).toEqual([G1])
    expect(splitKizText('0104 6000 0000 0001')).toEqual(['0104600000000001'])
  })

  it('ревью: полный код маркировки (01 GTIN 21 серийный) — как есть: без заглавных и без деления по «,»', () => {
    const a = "010460123456789021abc'DEF"
    const b = '010460123456789021xyz,QQ'
    expect(parseKizPaste(`${a}\n${b}`)).toEqual({ codes: [a, b], skipped: 0 })
    expect(kizKey(a)).toBe(a)
    expect(kizKey(' ab-1 ')).toBe('AB-1')
  })
})

describe('isKizCode', () => {
  it('формат кода, цифра в коде, до 100 знаков; контрольный знак и полный код — по своему формату', () => {
    for (const c of [G1, '96385074', 'AB-1', 'SN-0001', 'RU-123456-ABCDEFGHIJ', "010460123456789021abc'DEF", '9'.repeat(KIZ_NUMBER_MAX)]) {
      expect(isKizCode(c), c).toBe(true)
    }
    for (const c of ['GTIN', 'BARCODE', 'HELLO', 'ИТОГО', 'КОД', '123', '9'.repeat(KIZ_NUMBER_MAX + 1), 'GTIN:', 'N/A']) {
      expect(isKizCode(c), c).toBe(false)
    }
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
    // Пустая строка без количества получила номер — количество из общих значений (а не «КИЗ без кода» до номера).
    expect(g.markings![1].kizCount).toBe(1)
    expect(g.markings![4]).toMatchObject({ levelCode: '0', idApplicationCode: '01', idTypeCode: '999', kizCount: 1, aggregated: false, markingAfterRelease: false })
  })

  it('пустая строка со своим количеством его сохраняет', () => {
    const g = item([{ number: null, kizCount: 7 }])
    appendKizNumbers(g, [G1], d)
    expect(g.markings![0]).toMatchObject({ number: G1, kizCount: 7 })
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
