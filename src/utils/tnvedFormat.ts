/** 8471300000 → «8471 30 000 0»; не десять цифр — как есть. */
export function formatTnved(code: string): string {
  return /^\d{10}$/.test(code) ? `${code.slice(0, 4)} ${code.slice(4, 6)} ${code.slice(6, 9)} ${code.slice(9)}` : code
}
