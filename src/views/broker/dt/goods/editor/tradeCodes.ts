// Гр. 33.3 «Маркировка» (как в КЕДЕН и D-Sector): NTIN — национальный номер торговой позиции из Национального каталога
// товаров РК (13 цифр, начинается с «02»), GTIN или другой идентификационный код (артикул). Проверки — те же, что у
// сервера (Import40GoodsTradeCodes): только подсказка, сохранение и выгрузку не блокируют. В XML R.055 места нет.

/** Что не так с кодом — ключ подсказки broker.dt.goods.editor.tradeCodes.problems.<kind>. */
export type CodeProblem =
  | { kind: 'digits' }
  | { kind: 'ntinLength'; n: number }
  | { kind: 'prefix' }
  | { kind: 'gtinLength'; n: number }
  | { kind: 'check' }

export const NTIN_LENGTH = 13
export const NTIN_MAX_LENGTH = 50
export const GTIN_MAX_LENGTH = 1000

const onlyDigits = (s: string) => /^\d+$/.test(s)
const squash = (s: string) => s.replace(/\s+/g, '')

/** Контрольная цифра GS1 (последняя): справа налево веса 3, 1, 3, … по цифрам без контрольной. */
export function gs1CheckDigitOk(digits: string): boolean {
  if (digits.length < 2 || !onlyDigits(digits)) return false
  let sum = 0
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1])
}

/** NTIN: 13 цифр, «02…», контрольная цифра GS1. Пусто — не проверяем (null). */
export function ntinProblem(raw: string | null | undefined): CodeProblem | null {
  const code = squash(raw ?? '')
  if (!code) return null
  if (!onlyDigits(code)) return { kind: 'digits' }
  if (code.length !== NTIN_LENGTH) return { kind: 'ntinLength', n: code.length }
  if (!code.startsWith('02')) return { kind: 'prefix' }
  return gs1CheckDigitOk(code) ? null : { kind: 'check' }
}

/** GTIN: строка только из цифр — 8/12/13/14 цифр и контрольная цифра; с буквами/знаками — артикул, не проверяем. */
export function gtinProblem(raw: string | null | undefined): CodeProblem | null {
  const code = squash(raw ?? '')
  if (!code || !onlyDigits(code)) return null
  if (![8, 12, 13, 14].includes(code.length)) return { kind: 'gtinLength', n: code.length }
  return gs1CheckDigitOk(code) ? null : { kind: 'check' }
}

/** Строки поля GTIN с ошибкой формата: [строка, проблема]. */
export function gtinLineProblems(text: string | null | undefined): { line: string; problem: CodeProblem }[] {
  return (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .flatMap((line) => {
      const problem = gtinProblem(line)
      return problem ? [{ line, problem }] : []
    })
}

/**
 * Коды из вставленного текста (замена «Импорт из Excel» D-Sector): по одному в строке или через запятую, точку с запятой,
 * табуляцию, пробелы. Пробелы внутри 13-значного кода («0200 0000 0001 1») не разрывают его, если вся строка — цифры
 * с пробелами и после склейки получается ровно 13 цифр.
 */
export function parseCodes(text: string | null | undefined): string[] {
  return (text ?? '').split(/[\r\n,;\t]+/).flatMap((part) => {
    const p = part.trim()
    if (!p) return []
    if (/^[\d ]+$/.test(p) && squash(p).length === NTIN_LENGTH) return [squash(p)]
    return p.split(/\s+/).filter(Boolean)
  })
}

/** Добавить коды в конец списка без повторов (пустые строки списка не в счёт). Возвращает добавленные и повторы. */
export function appendCodes(list: string[], codes: readonly string[]): { added: number; duplicates: number } {
  const have = new Set(list.map(squash).filter(Boolean))
  let added = 0
  let duplicates = 0
  for (const c of codes) {
    const code = squash(c)
    if (!code) continue
    if (have.has(code)) { duplicates += 1; continue }
    have.add(code)
    // Пустая строка, добавленная кнопкой, заполняется первой — не остаётся висеть в середине.
    const blank = list.findIndex((x) => !squash(x))
    if (blank >= 0) list[blank] = code
    else list.push(code)
    added += 1
  }
  return { added, duplicates }
}
