import type { ServiceHealthCheck } from '@/api/system'

// Плашка о сбое внешнего сервиса на «Главной» администратора и РОП (09.11.2026, после сбоя ключа ИИ 26.10–05.11,
// о котором никто не знал): чистая логика — какие сбои показать и какими ключами подписей.

/** Видит плашку: администратор или руководитель отдела (как сервер, GET /system/service-health). */
export const canSeeServiceHealth = (a: { role: string | null; hasBusinessRole: (r: string) => boolean }): boolean =>
  (a.role ?? '').trim().toLowerCase() === 'administrator' || a.hasBusinessRole('rop')

// Имя проверки и вид ошибки с сервера → ключ подписи (в ключах vue-i18n — без дефисов и подчёркиваний).
const KNOWN = { 'ai-key': 'aiKey', 'zircon-ai': 'zirconAi' } as const
type Known = keyof typeof KNOWN
const KINDS: Record<string, string> = {
  key_rejected: 'keyRejected', unreachable: 'unreachable', server_error: 'serverError', bad_response: 'badResponse',
}

export interface ServiceAlert {
  name: Known
  /** Ключ строки: home.serviceHealth.line.<aiKey|zirconAi> с {since} и {reason}. */
  lineKey: string
  /** Ключ причины: home.serviceHealth.kind.<keyRejected|…> (неизвестная — other). */
  kindKey: string
  since: Date | null
  error: string | null
}

/** Время с сервера приходит без пояса — это UTC. */
const parseUtc = (s: string | null): Date | null => {
  if (!s) return null
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Активные сбои известных проверок в постоянном порядке (сначала ИИ); нет сбоев — пустой список. */
export const serviceAlerts = (checks: ServiceHealthCheck[] | null | undefined): ServiceAlert[] =>
  (Object.keys(KNOWN) as Known[]).flatMap((name) => {
    const c = (checks ?? []).find((x) => x.name === name)
    if (!c || !c.active) return []
    const kind = KINDS[c.errorKind ?? ''] ?? 'other'
    return [{
      name, lineKey: `home.serviceHealth.line.${KNOWN[name]}`, kindKey: `home.serviceHealth.kind.${kind}`,
      since: parseUtc(c.failingSinceUtc), error: c.error,
    }]
  })

/** «26.10 23:15» (год — только если не текущий), день первым во всех языках. */
export const formatSince = (d: Date | null, locale: string, now: Date = new Date()): string => {
  if (!d) return ''
  const withYear = d.getFullYear() !== now.getFullYear()
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d).replace(',', '')
}
