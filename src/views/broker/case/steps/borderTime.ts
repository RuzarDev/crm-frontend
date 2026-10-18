// Время на границе (18.10): поля «дата + время» окна в ISO для сервера и обратно; по умолчанию — сейчас.
const pad = (n: number) => String(n).padStart(2, '0')

/** Сейчас: дата YYYY-MM-DD и время HH:mm по часам браузера. */
export function nowParts(now = new Date()): { date: string; time: string } {
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

/** Местные дата и время → ISO (UTC); null — дата или время не заданы / неверны. */
export function partsToIso(date: string | null | undefined, time: string | null | undefined): string | null {
  const tm = (time ?? '').trim()
  if (!date || !/^\d{2}:\d{2}$/.test(tm)) return null
  const d = new Date(`${date}T${tm}:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Время позже текущего (с запасом в минуту — часы браузера могут спешить). */
export const isFuture = (iso: string | null, now = Date.now()): boolean => !!iso && new Date(iso).getTime() > now + 60_000
