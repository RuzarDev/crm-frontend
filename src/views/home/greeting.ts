export type GreetingPart = 'morning' | 'day' | 'evening' | 'night'

/** Часть суток для приветствия по локальному часу: 5–11 утро, 12–17 день, 18–22 вечер, остальное — ночь. */
export const greetingKey = (hour: number): GreetingPart =>
  hour >= 5 && hour <= 11 ? 'morning'
  : hour >= 12 && hour <= 17 ? 'day'
  : hour >= 18 && hour <= 22 ? 'evening'
  : 'night'

// Отчество в конце ФИО: -вич/-вна/-чна (рус.), -ұлы/-улы/-қызы/-кызы (каз.), оглы/кызы отдельным словом.
const PATRONYMIC = /(вич|вна|чна|ұлы|улы|уулу|қызы|кызы|оглы)$/iu

/**
 * Имя для приветствия — первое слово отображаемого имени («Айгерим Касымова» → «Айгерим»).
 * 02.11.2026: у сотрудников с профилем декларанта имя — ФИО из профиля («Сейткали Динара Ерлановна»): если последнее
 * слово — отчество, имя второе, иначе приветствие обращалось бы по фамилии.
 */
export const greetingName = (displayName: string | null | undefined): string => {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 3 && PATRONYMIC.test(words[words.length - 1])) return words[1]
  return words[0] ?? ''
}
