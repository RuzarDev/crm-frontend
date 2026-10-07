export type GreetingPart = 'morning' | 'day' | 'evening' | 'night'

/** Часть суток для приветствия по локальному часу: 5–11 утро, 12–17 день, 18–22 вечер, остальное — ночь. */
export const greetingKey = (hour: number): GreetingPart =>
  hour >= 5 && hour <= 11 ? 'morning'
  : hour >= 12 && hour <= 17 ? 'day'
  : hour >= 18 && hour <= 22 ? 'evening'
  : 'night'

/** Имя для приветствия — первое слово отображаемого имени («Айгерим Касымова» → «Айгерим»). */
export const greetingName = (displayName: string | null | undefined): string =>
  (displayName ?? '').trim().split(/\s+/)[0] ?? ''
