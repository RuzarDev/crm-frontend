import type { CustomsPostItem } from '@/types/api'
import type { ZOption } from '@/ui/options'

// Поиск таможенного поста (правка №11, 21.10): по коду («553», «55 302»), по названию без учёта регистра
// и казахских букв («нур жолы» → «НҰР ЖОЛЫ»), по синонимам («аэропорт» → «АУЕЖАЙ» и посты с видом транспорта
// AIR по КЕДЕН, «цто», «сэз») и по адресу поста из КЕДЕН («достык» → 57504 «ТЕМИРЖОЛ»).
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
  /** Текст для поиска (foldSearch): код, название, синонимы, адрес. */
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
/** Для сравнения: нижний регистр, казахские буквы → русские (ә→а, ұ/ү→у, і→и …), всё, кроме букв и цифр, — пробел. */
export const foldSearch = (s: string): string =>
  String(s ?? '')
    .toLocaleLowerCase('ru')
    .replace(/[әғқңөұүһіё]/g, (ch) => KZ_FOLD[ch] ?? ch)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

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

// Синонимы — на стороне поста (в searchText), запрос не расширяется.
const AIR_SYNONYMS = 'аэропорт airport авиа ауежай'
const synonymsOf = (folded: string, parts: PostTransportPart[]): string => {
  const out: string[] = []
  if (folded.includes('ауежай') || parts.includes('AIR')) out.push(AIR_SYNONYMS)
  if (folded.includes('центр таможенного оформления')) out.push('цто')
  if (folded.includes('специальная экономическая зона')) out.push('сэз')
  if (/(^| )сэз( |$)/.test(folded)) out.push('специальная экономическая зона')
  return out.join(' ')
}

export function buildCustomsPostOptions(posts: CustomsPostItem[], kindLabel: (k: PostTransportPart) => string): CustomsPostOption[] {
  return posts.map((p) => {
    const code = p.code || postCodeOf(p.name)
    const fullTitle = titleOf(p.name) || p.name
    const parts = transportParts(p.transportKind)
    const loc = shortLocation(p.location)
    const hint = [parts.map(kindLabel).join(', '), loc].filter(Boolean).join(' · ')
    const foldedTitle = foldSearch(fullTitle)
    return {
      value: p.name,
      label: p.name,
      code,
      title: shortTitle(fullTitle),
      hint,
      searchText: [code ?? '', foldedTitle, synonymsOf(foldedTitle, parts), foldSearch(p.location ?? '')].filter(Boolean).join(' '),
    }
  })
}

const isDigits = (w: string) => /^\d+$/.test(w)

/**
 * :filter-option для постов. Только цифры («553», «55 302») — ищутся в коде (не в адресе: «51» не находит
 * 55301 по «Ахметова, 51»). Иначе каждое слово запроса должно найтись: слово из цифр — в коде, остальные —
 * в названии, синонимах и адресе. У поста без кода цифры ищутся в его тексте; у чужой опции — в подписи.
 */
export function filterCustomsPostOption(input: string, option: ZOption): boolean {
  const q = foldSearch(input)
  if (!q) return true
  const text = typeof option.searchText === 'string' ? option.searchText : foldSearch(option.label)
  const code = typeof option.code === 'string' && option.code ? option.code : null
  const words = q.split(' ')
  if (words.every(isDigits)) return (code ?? text).includes(words.join(''))
  return words.every((w) => (isDigits(w) && code ? code.includes(w) : text.includes(w)))
}
