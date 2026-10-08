/** «ДД.ММ» из даты без времени («2026-10-07») — без сдвига часового пояса; иначе по местному времени. */
export function dayMonthOf(value: string | null | undefined): string {
  if (!value) return ''
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (plain) return `${plain[3]}.${plain[2]}`
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** «ДД.ММ ЧЧ:мм» по местному времени — строка истории. */
export function dayMonthTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Расширение файла для подписи ссылки скачивания («PDF», «XLSX»); без расширения — пусто. */
export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name)
  return m ? m[1].toUpperCase() : ''
}
