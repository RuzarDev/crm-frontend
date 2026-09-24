// Телефоны в интерфейсе храним в едином виде: «+7 700 000 00 00».
// Иностранные номера (явный «+» с кодом не 7) оставляем как есть, только чистим мусор.

const KZ_LOCAL_LENGTH = 10 // без кода страны

/**
 * @param raw текущее содержимое поля
 * @param prev предыдущее отформатированное значение — снимает неоднозначность
 *             «7» в начале: код страны это или первая цифра номера (700…).
 */
export const formatPhone = (raw: string | null | undefined, prev = ''): string => {
  if (raw == null) return ''
  const trimmed = String(raw).trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return trimmed.startsWith('+') ? '+' : ''

  if (trimmed.startsWith('+') && digits[0] !== '7' && digits[0] !== '8') {
    return `+${digits.slice(0, 15)}`
  }

  let local = digits
  if (local[0] === '8') local = local.slice(1)
  else if (
    local[0] === '7' &&
    // «7» — код страны, если он уже был в поле, если номер длиннее локального
    // или если пользователь начал ввод с «+»
    (prev.startsWith('+7') || local.length > KZ_LOCAL_LENGTH || trimmed.startsWith('+'))
  )
    local = local.slice(1)
  local = local.slice(0, KZ_LOCAL_LENGTH)

  let out = '+7'
  if (local.length) out += ` ${local.slice(0, 3)}`
  if (local.length > 3) out += ` ${local.slice(3, 6)}`
  if (local.length > 6) out += ` ${local.slice(6, 8)}`
  if (local.length > 8) out += ` ${local.slice(8, 10)}`
  return out
}

export const phoneDigits = (raw: string | null | undefined): string =>
  String(raw ?? '').replace(/\D/g, '')

/** Полный ли номер: КЗ — 11 цифр, иностранный — хотя бы 8. */
export const isPhoneComplete = (raw: string | null | undefined): boolean => {
  const d = phoneDigits(raw)
  if (!d) return false
  if (d[0] === '7' || d[0] === '8') return d.length === KZ_LOCAL_LENGTH + 1
  return d.length >= 8
}
