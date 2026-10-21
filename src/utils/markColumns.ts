// Столбцы марки, товарного знака и модели — одно правило для «Из Excel» (goodsExcel), вставки характеристик гр. 31
// (characteristicsPaste) и Zircon AI (zircon-ai/aqniet/marks.py, mark_field) — решение владельца 21.10.2026:
// «Brand / 品牌 / Бренд / Торговая марка» — товарный знак, «Марка» и «Марка товара» — марка. Таблица заголовков в тестах
// одна (utils/__tests__/markColumns.spec.ts и zircon-ai tests/test_generic.py MARK_COLUMN_TABLE).
//
// На входе — текст ячейки заголовка как есть, с переводами строк (здесь — ячейка листа или вставленного текста; в Zircon AI
// — исходное значение ячейки, а не схлопнутый заголовок, ревью 22.10). Двуязычная шапка «Марка ↵ Brand», «Brand ↵ Марка»,
// «Марка товара ↵ Brand» — марка: русское слово — то, что имел в виду декларант. Так же в одну строку («Марка Brand»):
// граница кириллицы и латиницы делит части, как граница иероглифов («Марка 品牌»), и смысл не зависит от того, перенос
// строки в ячейке или пробел.
//
// Правило для заголовка, где есть слово марки, знака или бренда (иначе null — решают обычные образцы):
//   1. есть и слово модели («модель», «model», «型号»): «Brand/Model», «品牌型号», «Марка, модель» — модель;
//   2. явный товарный знак («товарный / торговый знак», «торговая марка», «trademark», «brand name», «商标») — товарный
//      знак, даже рядом с «Марка»: «Товарный знак / Марка», «Марка / Trademark»;
//   3. часть заголовка — ровно «Марка» или «Марка товара» (части — по «/ | ( ) , ;», переводу строки, границе иероглифов
//      и границе кириллицы с латиницей) — марка: «Марка / 品牌», «Марка / Brand», «Марка (бренд)», «Марка ↵ Brand»;
//   4. «Brand», «Бренд», «品牌» — товарный знак;
//   5. остальное со словом «марка» («Марка изделия») — марка.

export type MarkField = 'productMarkName' | 'tradeMarkName' | 'productModelName'

const HAN = '\\u3400-\\u9fff'
const MODEL = /(?<![a-zа-яё])модел|(?<![a-z0-9])model(?![a-z])|型号/u
const TRADEMARK = /(?<![а-яё])(?:товарн|торгов)[а-яё]*\s*знак|(?<![а-яё])торгов[а-яё]*\s*марк|(?<![a-z])trade\s*-?\s*marks?(?![a-z])|(?<![a-z])brand\s*names?(?![a-z])|商标/u
const BRAND = /(?<![a-z])brands?(?![a-z])|(?<![а-яё])бренд|品牌/u
const MARK_WORD = /(?<![а-яёa-z])марка(?![а-яё])/u
const MARK_PARTS: ReadonlySet<string> = new Set(['марка', 'маркатовара', 'mark'])
const PART_SPLIT = /[/|\n\r()（）,;]+/u
const HAN_EDGE = new RegExp(`(?<=[${HAN}])(?=[^${HAN}\\s])|(?<=[^${HAN}\\s])(?=[${HAN}])|(?<=[${HAN}])\\s+|\\s+(?=[${HAN}])`, 'u')
// Граница кириллицы и латиницы (с пробелами между ними): «Марка Brand» → «марка», «brand».
const CYR = '\\u0400-\\u04ff'
const SCRIPT_EDGE = new RegExp(`(?<=[${CYR}])\\s*(?=[a-z])|(?<=[a-z])\\s*(?=[${CYR}])`, 'u')

const lower = (header: unknown): string =>
  String(header ?? '').normalize('NFKC').replace(/ /g, ' ').toLowerCase().replace(/ё/g, 'е')

/**
 * Части заголовка без пробелов и знаков: «Марка / 品牌» → ['марка', '品牌'], «Марка товара» → ['маркатовара'],
 * «Марка ↵ Brand» и «Марка Brand» → ['марка', 'brand'].
 */
export function markHeaderParts(header: unknown): string[] {
  return lower(header)
    .split(PART_SPLIT)
    .flatMap((p) => p.split(HAN_EDGE))
    .flatMap((q) => (q ?? '').split(SCRIPT_EDGE))
    .map((q) => (q ?? '').replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
}

/** Поле ДТ столбца марки / товарного знака / модели или null — заголовок не про марку и знак. */
export function markFieldOf(header: unknown): MarkField | null {
  const text = lower(header).replace(/\s+/g, ' ').trim()
  if (!text) return null
  const trademark = TRADEMARK.test(text)
  const brandWord = BRAND.test(text)
  const markPart = markHeaderParts(header).some((p) => MARK_PARTS.has(p))
  if (!(trademark || brandWord || markPart || MARK_WORD.test(text))) return null
  if (MODEL.test(text)) return 'productModelName'
  if (trademark) return 'tradeMarkName'
  if (markPart) return 'productMarkName'
  if (brandWord) return 'tradeMarkName'
  return 'productMarkName'
}
