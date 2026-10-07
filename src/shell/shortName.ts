// Имя в шапке: «Айгерим Касымова» → «Айгерим К.» (первое слово и первая буква второго с точкой).
// Если второе слово начинается не с буквы — это не ФИО, а, например, «ТОО «…»» — оставляем как есть,
// длинное обрежет вёрстка.
export const shortName = (full: string | null | undefined): string => {
  const words = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return words[0] ?? ''
  const initial = Array.from(words[1])[0]
  if (!/^\p{L}$/u.test(initial)) return words.join(' ')
  return `${words[0]} ${initial.toLocaleUpperCase()}.`
}
