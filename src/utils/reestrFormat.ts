import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

export const REESTR_DECIMAL_COLUMN_KEYS = new Set<string>([
  'Количество мест',
  'Вес',
  'Кол-во ТД',
  'Количество доп.листов',
])

export function formatReestrDateForForm(value: string | null): string | null {
  if (value == null || value === '') {
    return null
  }
  const iso = dayjs(value, 'YYYY-MM-DD', true)
  if (iso.isValid()) {
    return iso.format('DD.MM.YYYY')
  }
  return value
}

export function formatReestrCellForDisplay(columnKey: string, value: string | null): string {
  if (value == null || value === '') {
    return '-'
  }
  if (columnKey === 'Дата') {
    const iso = dayjs(value, 'YYYY-MM-DD', true)
    if (iso.isValid()) {
      return iso.format('DD.MM.YYYY')
    }
  }
  return value
}

export function normalizeReestrFieldsForSubmit(
  fields: Record<string, string | null>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const [key, raw] of Object.entries(fields)) {
    if (raw == null) {
      out[key] = null
      continue
    }
    const s = String(raw).trim()
    if (!s) {
      out[key] = null
      continue
    }
    if (key === 'Дата') {
      const iso = dayjs(s, 'YYYY-MM-DD', true)
      if (iso.isValid()) {
        out[key] = iso.format('YYYY-MM-DD')
        continue
      }
      const ru = dayjs(s, 'DD.MM.YYYY', true)
      if (ru.isValid()) {
        out[key] = ru.format('YYYY-MM-DD')
        continue
      }
      out[key] = s
      continue
    }
    if (REESTR_DECIMAL_COLUMN_KEYS.has(key)) {
      const cleaned = s.replace(/\s/g, '').replace(',', '.')
      out[key] = cleaned === '' ? null : cleaned
      continue
    }
    out[key] = s
  }
  return out
}
