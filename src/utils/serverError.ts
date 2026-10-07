/**
 * Текст ошибки сохранения для постоянной плашки: что вернул сервер (строка, error/message/detail/title),
 * иначе «HTTP 500», а без ответа — fallback (обычно «нет связи с сервером»).
 */
export function serverErrorText(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: unknown } })?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const v = d.error ?? d.message ?? d.detail ?? d.title
    if (typeof v === 'string' && v.trim()) return v
    if (Array.isArray(d.errors) && d.errors.length) return d.errors.map(String).join('; ')
  }
  const status = (e as { response?: { status?: number } })?.response?.status
  return status ? `HTTP ${status}` : fallback
}
