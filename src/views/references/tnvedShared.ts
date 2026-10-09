import type { TnvedClassifyMatch, TnvedNodeDto } from '@/types/api'

// Общие правила ТН ВЭД для экранов сотрудника (справочник, окно выбора кода) и клиента («Подбор кода»).
// Без Vue — проверяются отдельно.

/** Код в поиске: цифры с пробелами, точками или дефисами, цифр не меньше четырёх («8471 30», «8471.30», «8471-30-000-0»). */
export const isCodeLike = (text: string): boolean => {
  const s = text.trim()
  return /^[\d\s.-]+$/.test(s) && s.replace(/\D/g, '').length >= 4
}

/** Цифры кода без пробелов: сервер ищет код по префиксу без разделителей. */
export const codeDigits = (text: string): string => text.replace(/\D/g, '')

/** «8471300000» → «8471 30 000 0» (группы 4/2/3/1, как в ТН ВЭД ЕАЭС); короче — по тем же группам. Разделы («XVI») — как есть. */
export const formatTnvedCode = (code: string): string => {
  const d = codeDigits(code)
  if (!d) return code
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join(' ')
}

/** Название ветки приходит с тире уровня («– – портативные…») — в карточке и списке они лишние. */
export const cleanName = (name: string | null | undefined): string => (name ?? '').replace(/^[\s\-–—:]+/, '').trim()

/** Статус HTTP-ошибки axios (или undefined — сеть, отмена). */
export const httpStatus = (e: unknown): number | undefined =>
  (e as { response?: { status?: number } } | null)?.response?.status

/** Чтения tnved/* ограничены 60 запросами в минуту, подбор по описанию — 20: сервер отвечает 429. */
export const isRateLimited = (e: unknown): boolean => httpStatus(e) === 429

/** Строка списка кодов: из поиска (без ставки) или из подбора по описанию (со ставкой и вероятностью). */
export interface TnvedHit {
  code: string
  name: string
  rateStr: string | null
  /** Только у подбора по описанию: 0…1. */
  probability: number | null
}

export const hitFromNode = (n: TnvedNodeDto): TnvedHit => ({
  code: n.code,
  name: cleanName(n.name || n.treeName),
  rateStr: null,
  probability: null,
})

export const hitFromMatch = (m: TnvedClassifyMatch): TnvedHit => ({
  code: m.code,
  name: cleanName(m.description),
  rateStr: m.rateStr || null,
  probability: Number.isFinite(m.probability) ? m.probability : null,
})

/** Поиск начинаем с двух знаков: одна буква или цифра — не запрос (сервер ответил бы всем справочником). */
export const MIN_QUERY = 2

/** Ставка НДС РК — в плитке и в строке расчёта; сумму даёт калькулятор (vatKzt). */
export const VAT_RATE = '16%'
