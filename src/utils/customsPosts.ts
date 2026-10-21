import type { CustomsPostItem } from '@/types/api'
import type { ZOption } from '@/ui/options'

// Поиск таможенного поста (правка №11, 21.10): по коду («553», «55 302»), по названию без учёта регистра
// и казахских букв («нур жолы» → «НҰР ЖОЛЫ»), по синонимам («аэропорт» → «АУЕЖАЙ» и посты с видом транспорта
// AIR по КЕДЕН, «цто», «сэз»), по адресу поста из КЕДЕН («достык» → 57504 «ТЕМИРЖОЛ»). Для kk/en-интерфейса —
// казахские написания мест и общих слов («Түркістан», «кеден бекеті»), латиница («Almaty», «airport almaty»)
// и окончания («аэропорта», «Алматы әуежайы», «Қарағанды»).
// Хранимое значение не меняется — полная строка справочника («55302 — ТАМОЖЕННЫЙ ПОСТ …»).

// type, а не interface: у литерального типа неявная индексная сигнатура — опции подходят ZSelect (ZOption) как есть.
export type CustomsPostOption = {
  /** p.name — хранимое значение (заявка), не меняется. */
  value: string
  /** p.name — подпись в поле. */
  label: string
  /** Код поста (5 цифр) или null для старых строк без кода. */
  code: string | null
  /** Название для списка: без «код — » и общего «ТАМОЖЕННЫЙ ПОСТ» («ЖЕТЫСУ»): на телефоне видно главное. */
  title: string
  /** Вторая строка варианта: «авиа · Г.АЛМАТЫ, …» или ''. */
  hint: string
  /** Текст для поиска (foldSearch): код, название, синонимы, вид транспорта, адрес, написания мест, латиница. */
  searchText: string
}

export type PostTransportPart = 'AIR' | 'AUTO' | 'RW' | 'VESSEL'
const TRANSPORT_PARTS: readonly PostTransportPart[] = ['AIR', 'AUTO', 'RW', 'VESSEL']

const CODE_RE = /^\s*(\d{5,8})(?=\s*[—–-])/
/** Код поста из имени «55302 — …» (как codeOf в SectionCustoms.vue); «Хоргос — ЦТО», «12 — …» → null. */
export const postCodeOf = (name: string): string | null => CODE_RE.exec(name ?? '')?.[1] ?? null

/** Название без ведущего «код — ». */
const titleOf = (name: string): string => (name ?? '').replace(/^\s*\d{5,8}\s*[—–-]\s*/, '').trim()
/** Для списка — ещё и без общего «ТАМОЖЕННЫЙ ПОСТ» / «Т/П» в начале (полное имя — в подсказке строки и в поле). */
const shortTitle = (title: string): string => title.replace(/^(ТАМОЖЕННЫЙ\s+ПОСТ|Т\/П)\s+/i, '').trim() || title

const KZ_FOLD: Record<string, string> = {
  'ә': 'а', 'ғ': 'г', 'қ': 'к', 'ң': 'н', 'ө': 'о', 'ұ': 'у', 'ү': 'у', 'һ': 'х', 'і': 'и', 'ё': 'е',
}
/**
 * Для сравнения: нижний регистр, казахские буквы → русские (ә→а, ұ/ү→у, і→и …), латинская q → k
 * («Qaragandy» = «Karagandy»), всё, кроме букв и цифр, — пробел.
 */
export const foldSearch = (s: string): string =>
  String(s ?? '')
    .toLocaleLowerCase('ru')
    .replace(/[әғқңөұүһіё]/g, (ch) => KZ_FOLD[ch] ?? ch)
    .replace(/q/g, 'k')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k',
  'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh',
  'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}
/** Латиница свёрнутого текста (казахских букв в нём уже нет): «г алматы» → «g almaty», «хоргос» → «khorgos». */
export const toLatin = (folded: string): string => folded.replace(/[а-я]/g, (ch) => LATIN[ch] ?? ch)

/** Части вида транспорта КЕДЕН («VESSEL/AUTO/RW» → VESSEL, AUTO, RW); неизвестные отбрасываются. */
export const transportParts = (kind?: string | null): PostTransportPart[] => {
  const parts = String(kind ?? '').toUpperCase().split('/').map((p) => p.trim())
  return TRANSPORT_PARTS.filter((p) => parts.includes(p)).sort((a, b) => parts.indexOf(a) - parts.indexOf(b))
}

/** Адрес поста без «РЕСПУБЛИКА КАЗАХСТАН ,» и 6-значного индекса: «Г.АЛМАТЫ, УЛ.АХМЕТОВА, 51, УЛ.МАЙЛИНА, 2». */
export const shortLocation = (loc?: string | null): string =>
  String(loc ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^РЕСПУБЛИКА\s+КАЗАХСТАН\s*,?\s*/i, '')
    .replace(/^\d{6}\s*,?\s*/, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')

// Синонимы — на стороне поста (в searchText), запрос не расширяется. Казахские слова — как в nameKk справочника
// постов КЕДЕН («ӘУЕЖАЙ – ҚАРАҒАНДЫ» КЕДЕН БЕКЕТІ, «КЕДЕНДІК РЕСІМДЕУ ОРТАЛЫҒЫ», «АРНАЙЫ ЭКОНОМИКАЛЫҚ АЙМАҒЫ»).
const POST_WORDS = 'кеден бекети customs post'
const AIR_SYNONYMS = 'аэропорт airport авиа ауежай'
const CTO_SYNONYMS = 'цто кедендик ресимдеу орталыгы customs clearance center'
const SEZ_SYNONYMS = 'сэз специальная экономическая зона арнайы экономикалык аймак special economic zone sez'
const synonymsOf = (folded: string, parts: PostTransportPart[]): string => {
  const out = [POST_WORDS]
  if (folded.includes('ауежай') || parts.includes('AIR')) out.push(AIR_SYNONYMS)
  if (folded.includes('центр таможенного оформления')) out.push(CTO_SYNONYMS)
  if (folded.includes('специальная экономическая зона') || /(^| )сэз( |$)/.test(folded)) out.push(SEZ_SYNONYMS)
  return out.join(' ')
}

// Написания мест, которые свёртка не сводит друг к другу: русское (имя и адрес в КЕДЕН) ↔ казахское (nameKk КЕДЕН)
// ↔ привычная латиница, если она не выходит из toLatin. Есть в тексте поста одно (как начало слова) — добавляются все.
const PLACE_GROUPS: readonly (readonly string[])[] = [
  ['караганда', 'караганды'],
  ['туркестан', 'туркистан'],
  ['жетысу', 'жетису'],
  ['уральск', 'орал'],
  ['усть каменогорск', 'оскемен'],
  ['экибастуз', 'екибастуз'],
  ['хоргос', 'коргас', 'horgos'],
  ['байконыр', 'байконур', 'baikonur'],
  ['майкапчагай', 'майкапшагай'],
  ['бахты', 'бакты'],
]
const placeAliasesOf = (folded: string): string =>
  PLACE_GROUPS.filter((g) => g.some((m) => folded.startsWith(m) || folded.includes(` ${m}`))).flat().join(' ')

export function buildCustomsPostOptions(posts: CustomsPostItem[], kindLabel: (k: PostTransportPart) => string): CustomsPostOption[] {
  return posts.map((p) => {
    const code = p.code || postCodeOf(p.name)
    const fullTitle = titleOf(p.name) || p.name
    const parts = transportParts(p.transportKind)
    const loc = shortLocation(p.location)
    const kinds = parts.map(kindLabel).join(', ')
    const hint = [kinds, loc].filter(Boolean).join(' · ')
    const foldedTitle = foldSearch(fullTitle)
    const foldedLoc = foldSearch(p.location ?? '')
    const places = [foldedTitle, foldedLoc, placeAliasesOf(`${foldedTitle} ${foldedLoc}`)].filter(Boolean).join(' ')
    return {
      value: p.name,
      label: p.name,
      code,
      title: shortTitle(fullTitle),
      hint,
      // Вид транспорта — на языке интерфейса, как во второй строке варианта («авиа», «әуе», «rail»).
      searchText: [code ?? '', places, synonymsOf(foldedTitle, parts), foldSearch(kinds), toLatin(places)].filter(Boolean).join(' '),
    }
  })
}

const isDigits = (w: string) => /^\d+$/.test(w)
const isLetters = (w: string) => /^\p{L}+$/u.test(w)

/** Казахский родительный падеж (свёрнутый): «Алматының» → «алматы|нын», «Қарағандының» → «караганды|нын». */
const KZ_GENITIVE = /(нын|нин|дын|дин|тын|тин)$/
/**
 * Слово с окончанием («аэропорта», «ауежайы», «караганды», «алматынын»): основа — слово без 1–2 последних букв
 * (без 3 — только казахский родительный падеж), не короче 5. Она должна начинать слово текста, у которого после
 * основы не больше 2 букв: «караганд|а» — да; «алмат|инская» (область) и «темир|жол» по «темиртау» — нет.
 */
const stemMatches = (w: string, text: string): boolean => {
  if (w.length < 6 || !isLetters(w)) return false
  const stems = [w.slice(0, -1), w.slice(0, -2), ...(KZ_GENITIVE.test(w) ? [w.slice(0, -3)] : [])]
  return stems.some((s) => s.length >= 5 && new RegExp(`(?:^| )${s}\\p{L}{0,2}(?= |$)`, 'u').test(text))
}

/**
 * :filter-option для постов. Только цифры («553», «55 302») — ищутся в коде (не в адресе: «51» не находит
 * 55301 по «Ахметова, 51»). Иначе каждое слово запроса должно найтись: слово из цифр — в коде, остальные —
 * в названии, синонимах и адресе, целиком или основой (stemMatches). У поста без кода цифры ищутся в его тексте;
 * у чужой опции — в подписи.
 */
export function filterCustomsPostOption(input: string, option: ZOption): boolean {
  const q = foldSearch(input)
  if (!q) return true
  const text = typeof option.searchText === 'string' ? option.searchText : foldSearch(option.label)
  const code = typeof option.code === 'string' && option.code ? option.code : null
  const words = q.split(' ')
  if (words.every(isDigits)) return (code ?? text).includes(words.join(''))
  return words.every((w) => (isDigits(w) && code ? code.includes(w) : text.includes(w) || stemMatches(w, text)))
}
