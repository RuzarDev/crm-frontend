// Места словами (пакет «Импорт 2.0», 22.10.2026, правка 2.5 декларантов). Упаковочные листы поставщиков пишут места
// текстом на двух языках: «两个木箱，编号 3 和 4. Два деревянных ящика № 3 и № 4», «50箱，1托. 50 коробок, 1 палета»,
// итог «共计19件. 19 мест». Раньше число из ячейки собиралось из всех цифр — «№ 3 и № 4» давало 34 места.
//
// Правило — одно с Zircon AI (zircon-ai/aqniet/places.py, менять синхронно):
// - пары «число + слово места» (цифры или словами: «два», «две», «两»), между ними — не больше двух слов-определений
//   («деревянных», «картонных»); номера «№ 3» не считаются;
// - слова места: ящик/коробка/箱/盒/carton/box — коробка; паллета/поддон/托/pallet — поддон; мешок/袋/bag — мешок;
//   место/件/package/place — место; тюк, кипа, бочка, канистра, связка, пачка, упаковка, барабан/桶 — прочее.
//   Рулон/卷, шт/台, лист/张 — не места;
// - «всего / итого / 共 / 共计 / total» перед парой — итог, он и есть ответ;
// - «места/件» вместе с другими словами — итог мест (сумма пар «места»);
// - поддон вместе с коробками (и другими) — неоднозначно (коробки могут стоять на поддоне): null и ambiguous —
//   декларант укажет сам; одного вида — сумма («2 паллеты + 1 паллета» → 3);
// - русская, китайская и английская части разбираются отдельно; разные числа — неоднозначно;
// - текст без слов места: одно число — оно («12», «12 ctns», «120 рулонов», «12 шт» — как раньше excelToNum); несколько
//   чисел, «№ 5» или «1 партия» — неоднозначно;
// - числа с разрядами («1 044», «1,044», «共1,044箱») — одно число (ревью 22.10: пара брала последнюю группу — 44).

export interface PlacesResult {
  /** Места; null — нет или неоднозначно. */
  value: number | null
  /** Текст есть, а места однозначно не определить — декларант укажет сам. */
  ambiguous: boolean
}

type Kind = 'box' | 'pallet' | 'bag' | 'place' | 'other'
type Pair = { n: number; kind: Kind; total: boolean }

const RU_NUM: Record<string, number> = {
  один: 1, одна: 1, одно: 1, одного: 1, одной: 1,
  два: 2, две: 2, двух: 2, три: 3, трех: 3, трёх: 3, четыре: 4, четырех: 4, четырёх: 4, пять: 5, пяти: 5,
  шесть: 6, шести: 6, семь: 7, семи: 7, восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10,
  одиннадцать: 11, двенадцать: 12, пятнадцать: 15, двадцать: 20,
}
const HAN_DIGIT: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

// сокращения упаковочных листов: «12 кор.», «15 ящ.», «10 палл.», «3 меш.», «5 уп.» (ревью 22.10)
const RU_WORDS: [string, Kind][] = [
  ['ящик[а-яё]*|короб[а-яё]*|кор\\.?|ящ\\.?', 'box'],
  ['палл?ет[а-яё]*|поддон[а-яё]*|пал+\\.?', 'pallet'],
  ['меш(?:ок|к[а-яё]*)|меш\\.?', 'bag'],
  ['мест(?:о|а|ах|ами)?', 'place'],
  ['тюк[а-яё]*|кип[а-яё]*|боч(?:ка|ки|ек|ку|ком|ками|ках)|бочон[а-яё]*|канистр[а-яё]*|связ(?:ка|ки|ок|ку)'
    + '|пач(?:ка|ки|ек|ку)|упаков(?:ка|ки|ок|ку)|уп\\.?|барабан[а-яё]*', 'other'],
]
const EN_WORDS: [string, Kind][] = [
  ['cartons?|ctns?|box(?:es)?|cases?|crates?', 'box'],
  ['pallets?|plts?|skids?', 'pallet'],
  ['bags?|sacks?', 'bag'],
  ['packages?|pkgs?|places?|packs?', 'place'],
  ['bales?|drums?|barrels?|bundles?|coils?', 'other'],
]
const HAN_WORDS: [string, Kind][] = [
  ['木箱|纸箱|箱|盒', 'box'],
  ['托盘|托', 'pallet'],
  ['袋|麻袋', 'bag'],
  ['件', 'place'],
  ['包|桶|捆', 'other'],
]

const RU_NUM_RE = Object.keys(RU_NUM).sort((a, b) => b.length - a.length).join('|')
const TOTAL_RU = /(?:всего|итого|общее\s+количество|total)[\s:：,.-]*$/i
const TOTAL_HAN = /(?:共计|总计|合计|共)\s*$/
const alt = (words: [string, Kind][]) => words.map(([w]) => `(?:${w})`).join('|')
const kindOf = (words: [string, Kind][], word: string) => words.find(([w]) => new RegExp(`^(?:${w})$`, 'iu').test(word))![1]

function pairsRu(text: string): Pair[] {
  const rx = new RegExp(`(?<![\\p{L}\\p{N}_№#/.,-])(\\d+|${RU_NUM_RE})\\s+((?:[а-яё-]+\\s+){0,2}?)(${alt(RU_WORDS)})(?![а-яё])`, 'giu')
  const out: Pair[] = []
  for (const m of text.matchAll(rx)) {
    const raw = m[1].toLowerCase()
    const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : RU_NUM[raw]
    if (n == null) continue
    out.push({ n, kind: kindOf(RU_WORDS, m[3].toLowerCase()), total: TOTAL_RU.test(text.slice(0, m.index)) })
  }
  return out
}

function pairsEn(text: string): Pair[] {
  const rx = new RegExp(`(?<![\\p{L}\\p{N}_№#/.,-])(\\d+)\\s*((?:[a-z-]+\\s+){0,2}?)(${alt(EN_WORDS)})(?![a-z])`, 'giu')
  const out: Pair[] = []
  for (const m of text.matchAll(rx)) {
    out.push({ n: parseInt(m[1], 10), kind: kindOf(EN_WORDS, m[3].toLowerCase()), total: TOTAL_RU.test(text.slice(0, m.index)) })
  }
  return out
}

function pairsHan(text: string): Pair[] {
  const rx = new RegExp(`(\\d+|[一二两三四五六七八九])\\s*个?\\s*(${alt(HAN_WORDS)})`, 'gu')
  const out: Pair[] = []
  for (const m of text.matchAll(rx)) {
    const at = m.index ?? 0
    // «69张/托», «95米/卷»: число относится к своему слову («张», «米»), «/托» — «на поддон»
    if (at > 0 && /[\d.]/.test(text[at - 1])) continue
    const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : HAN_DIGIT[m[1]]
    out.push({ n, kind: kindOf(HAN_WORDS, m[2]), total: TOTAL_HAN.test(text.slice(0, at)) })
  }
  return out
}

/** Пары одного языка → места. */
function decide(pairs: Pair[]): PlacesResult {
  const totals = pairs.filter((p) => p.total)
  if (totals.length === 1) return { value: totals[0].n, ambiguous: false }
  const places = pairs.filter((p) => p.kind === 'place')
  if (places.length) return { value: places.reduce((s, p) => s + p.n, 0), ambiguous: false }
  const kinds = new Set(pairs.map((p) => p.kind))
  if (kinds.has('pallet') && kinds.size > 1) return { value: null, ambiguous: true }
  return { value: pairs.reduce((s, p) => s + p.n, 0), ambiguous: false }
}

/** Одно число, можно с латинской единицей («12 ctns», «120 (CTNS)»); русские слова — парами или одним числом ниже. */
const NUM_ONLY = /^\s*(\d+(?:[.,]\d+)?)\s*[([]?\s*[a-z.]{0,8}\s*[)\]]?\s*$/i
/**
 * «1 044», «1,044», «1 200 CTNS» — разряды одного числа: без этого пара «число + слово» брала последнюю группу
 * («1 044 CTNS» → 44). Запятая с ровно тремя цифрами после — разряды (мест дробными не бывает); «1,044.00» → 1044.00.
 */
const GROUPED = /(?<![\d.,])\d{1,3}(?:[ \u00a0\u202f,]\d{3})+(?!\d|,\d)/g
const ungroup = (s: string) => s.replace(GROUPED, (m) => m.replace(/[ \u00a0\u202f,]/g, ''))
/** Число без слова места: «1 партия», «1 lot» — не место; «№ 5» (после NFKC — «No 5»), «# 5» — номер места. */
const NUMBER = /(?<![A-Za-zА-Яа-яЁё\d.,])\d+(?:[.,]\d+)?(?!\d)/g
const NOT_PLACES = /парти|\blots?\b|\bbatch|批|(?:[№#]|\bno\.?)\s*\d/i

/** Места из ячейки: число как есть, текст — по правилу модуля. */
export function placesFromText(v: unknown): PlacesResult {
  if (v == null || typeof v === 'boolean') return { value: null, ambiguous: false }
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : null, ambiguous: false }
  const s = ungroup(String(v).normalize('NFKC').replace(/[\u00a0\u202f]/g, ' ').trim())
  if (!s) return { value: null, ambiguous: false }
  const num = NUM_ONLY.exec(s)
  if (num) return { value: parseFloat(num[1].replace(',', '.')), ambiguous: false }
  const results = [pairsRu(s), pairsHan(s), pairsEn(s)].filter((p) => p.length).map(decide)
  if (!results.length) {
    // слов места нет: одно число — оно («120 рулонов», «12 шт», «3 бухты» — как раньше excelToNum); несколько чисел,
    // «№ 3 и № 4», «1 партия» — не угадываем
    const nums = s.match(NUMBER) ?? []
    if (nums.length === 1 && !NOT_PLACES.test(s)) return { value: parseFloat(nums[0].replace(',', '.')), ambiguous: false }
    return { value: null, ambiguous: /\d/.test(s) }
  }
  if (results.some((r) => r.ambiguous)) return { value: null, ambiguous: true }
  if (new Set(results.map((r) => r.value)).size > 1) return { value: null, ambiguous: true }
  return results[0]
}
