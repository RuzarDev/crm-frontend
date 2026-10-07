// Организационно-правовые формы не дают инициалов: «ТОО «Казахмыс Трейд»» → «КТ».
const LEGAL_FORMS = new Set(['ТОО', 'ИП', 'АО', 'ООО', 'ЖШС', 'АҚ', 'LLP', 'LLC', 'TOO', 'JSC', 'IP'])

export const initials = (name: string): string => {
  const words = name
    .replace(/[«»"“”„'()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w && !LEGAL_FORMS.has(w.toUpperCase()))
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('ru')
  return (words[0][0] + words[1][0]).toLocaleUpperCase('ru')
}

const TONES = ['info', 'wait', 'submitted', 'done', 'pay', 'neutral'] as const
export type AvatarTone = (typeof TONES)[number]

export const avatarTone = (name: string): AvatarTone => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return TONES[h % TONES.length]
}
