// Организационно-правовые формы не дают инициалов: «ТОО «Казахмыс Трейд»» → «КТ».
// Выбрасываем их только там, где они точно форма, а не часть названия:
// - есть кавычки — только из части ДО первой кавычки («ТОО «Ақ Жол»» → «АЖ»: «Ақ» внутри кавычек остаётся);
// - кавычек нет — только первое слово и только если за ним есть ещё слово («ИП Сейткали А.» → «СА», «ТОО» → «ТО»).
const LEGAL_FORMS = new Set(['ТОО', 'ИП', 'АО', 'ООО', 'ЖШС', 'АҚ', 'LLP', 'LLC', 'TOO', 'JSC', 'IP'])
const FIRST_QUOTE = /[«"“„']/

const words = (s: string): string[] =>
  s
    .replace(/[«»"“”„'()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
const isLegalForm = (w: string) => LEGAL_FORMS.has(w.toLocaleUpperCase('ru'))

export const initials = (name: string | null | undefined): string => {
  const s = name ?? ''
  const q = s.search(FIRST_QUOTE)
  let ws: string[]
  if (q >= 0) {
    ws = [...words(s.slice(0, q)).filter((w) => !isLegalForm(w)), ...words(s.slice(q))]
  } else {
    ws = words(s)
    if (ws.length > 1 && isLegalForm(ws[0])) ws = ws.slice(1)
  }
  if (ws.length === 0) return '?'
  if (ws.length === 1) return ws[0].slice(0, 2).toLocaleUpperCase('ru')
  return (ws[0][0] + ws[1][0]).toLocaleUpperCase('ru')
}

const TONES = ['info', 'wait', 'submitted', 'done', 'pay', 'neutral'] as const
export type AvatarTone = (typeof TONES)[number]

export const avatarTone = (name: string | null | undefined): AvatarTone => {
  let h = 0
  for (const ch of name ?? '') h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return TONES[h % TONES.length]
}
