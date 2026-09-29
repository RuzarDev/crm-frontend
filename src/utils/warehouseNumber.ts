// Номер документа о включении в реестр СВХ / таможенных складов в формате КЕДЕН:
// KZ + 2 контрольные цифры + 3 буквы + 8 цифр (KZ56VSX00000119). Контрольные цифры — как у IBAN (mod 97):
// «3 буквы + 8 цифр + KZ00» → буквы A=10..Z=35 → остаток от 97 → CC = (98 − остаток) mod 97.
// Реестр КГД пишет «97» и «98» как «00» и «01» — принимаем оба варианта. Правила совпадают с бэкендом
// (WarehouseRegistryNumber.cs); здесь только подсказка-предупреждение, ввод не блокируется.
const CYR_TO_LAT: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
}

export const KZ_NUMBER_RE = /^KZ\d{2}[A-Z]{3}\d{8}$/

/** Верхний регистр, без пробелов, кириллические двойники → латиница. */
export function normalizeWarehouseNumber(raw: string): string {
  let out = ''
  for (const ch of raw) {
    if (/\s/.test(ch)) continue
    const up = ch.toUpperCase()
    out += CYR_TO_LAT[up] ?? up
  }
  return out
}

export function warehouseCheckDigits(letters3: string, digits8: string): number {
  let r = 0
  for (const ch of letters3 + digits8 + 'KZ00') {
    const chunk = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of chunk) r = (r * 10 + Number(d)) % 97
  }
  return (98 - r) % 97
}

export type WarehouseNumberState =
  | 'empty'     // поле пустое
  | 'ok'        // формат и контрольные цифры верны
  | 'checksum'  // формат KZ верный, контрольные цифры не сходятся (опечатка)
  | 'format'    // похоже на номер КЕДЕН (начинается с KZ), но формат нарушен
  | 'legacy'    // старый номер реестра (415, 05/239) — КЕДЕН ждёт номер вида KZ…

export function checkWarehouseNumber(raw: string | null | undefined): WarehouseNumberState {
  const n = normalizeWarehouseNumber(raw ?? '')
  if (!n) return 'empty'
  if (KZ_NUMBER_RE.test(n)) {
    const cc = Number(n.slice(2, 4))
    const expected = warehouseCheckDigits(n.slice(4, 7), n.slice(7))
    const alt = expected === 0 ? 97 : expected === 1 ? 98 : -1
    return cc === expected || cc === alt ? 'ok' : 'checksum'
  }
  return /^K?Z\d/.test(n) || /^KZ/.test(n) ? 'format' : 'legacy'
}
