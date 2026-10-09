import type { TnvedClassifyMatch, TnvedNodeDto } from '@/types/api'
import { cleanName } from '@/views/references/tnvedShared'

// Общие с экранами сотрудника правила — в views/references/tnvedShared.ts; здесь — реэкспорт для клиентского кода.
export { cleanName, codeDigits, formatTnvedCode, httpStatus, isCodeLike, isRateLimited } from '@/views/references/tnvedShared'

// Правила экрана «Подбор кода ТН ВЭД» клиента — без Vue, чтобы проверять отдельно.

/** Строка списка «Подходящие коды»: из поиска (без ставки) или из подбора по описанию (со ставкой и вероятностью). */
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
