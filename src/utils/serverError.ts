/** Длиннее — это уже не сообщение для человека (дамп, трассировка). */
const MAX_READABLE = 300
/** Трассировка стека .NET / JS или имя исключения в начале текста. */
const STACK_LIKE = /(^|\n)\s*at\s+\S+|\w+(\.\w+)*Exception\b/

/**
 * Текст ошибки сохранения для постоянной плашки: что вернул сервер (строка, error/message/detail/title),
 * иначе «HTTP 500», а без ответа — fallback (обычно «нет связи с сервером»).
 * opts.friendly — для 5xx, трассировок стека и слишком длинных ответов вместо сырого текста возвращается он
 * (сырой текст сервера в интерфейс не идёт). Без friendly — прежнее поведение.
 */
export function serverErrorText(e: unknown, fallback: string, opts?: { friendly?: string }): string {
  const status = (e as { response?: { status?: number } })?.response?.status
  const raw = rawText(e)
  const friendly = opts?.friendly
  if (friendly && status !== undefined) {
    if (status >= 500) return friendly
    if (raw && (raw.length > MAX_READABLE || STACK_LIKE.test(raw))) return friendly
  }
  if (raw) return raw
  return status ? `HTTP ${status}` : fallback
}

function rawText(e: unknown): string | null {
  const data = (e as { response?: { data?: unknown } })?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const v = d.error ?? d.message ?? d.detail ?? d.title
    if (typeof v === 'string' && v.trim()) return v
    if (Array.isArray(d.errors) && d.errors.length) return d.errors.map(String).join('; ')
  }
  return null
}
