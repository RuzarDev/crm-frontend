import type { AppLocale } from '@/i18n'

// Вспомогательные функции страницы получателя «Авто-транзита»: язык по умолчанию и «обновлено N мин назад».

type Tr = (key: string, named?: Record<string, unknown>) => string

const SUPPORTED: AppLocale[] = ['ru', 'kk', 'en']

/** Язык страницы: сохранённый выбор → язык браузера → русский. */
export function pickLocale(stored: string | null | undefined, browserLangs: readonly string[] | undefined): AppLocale {
  if (stored && (SUPPORTED as string[]).includes(stored)) return stored as AppLocale
  for (const raw of browserLangs ?? []) {
    const base = String(raw).toLowerCase().split('-')[0]
    if ((SUPPORTED as string[]).includes(base)) return base as AppLocale
  }
  return 'ru'
}

const INTL: Record<AppLocale, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }

/** «только что» / «N мин назад» / «N ч назад» / дата. Будущее время (часы спешат) — «только что». */
export function relativeTime(iso: string, now: Date, t: Tr, locale: AppLocale): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((now.getTime() - then) / 60_000)
  if (mins < 1) return t('broker.autoTransit.public.time.justNow')
  if (mins < 60) return t('broker.autoTransit.public.time.minAgo', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('broker.autoTransit.public.time.hourAgo', { n: hours })
  return new Intl.DateTimeFormat(INTL[locale] ?? 'ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(then))
}
