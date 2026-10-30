import { formatTnvedCode as fmtCode, isCodeLike as codeLike } from '@/views/references/tnvedShared'

// Правила ТН ВЭД живут в views/references/tnvedShared.ts (общие для клиента и сотрудника);
// здесь — реэкспорт для клиентского кода («Подбор кода ТН ВЭД», «Курсы валют», калькулятор).
export {
  cleanName, codeDigits, formatTnvedCode, hitFromMatch, hitFromNode, httpStatus, isCodeLike, isRateLimited, MIN_QUERY, VAT_RATE,
  type TnvedHit,
} from '@/views/references/tnvedShared'

/** Предел описания груза из подбора кода — длинные названия позиций ЕТТ обрезаем. */
export const SHIPMENT_CARGO_MAX = 300

/**
 * Описание груза для «Оформить поставку с этим товаром» (30.10.2026, аудит C-14): что искал клиент (если это текст,
 * а не код), иначе название позиции, и выбранный код — «Кофе в зёрнах (ТН ВЭД 0901 11 000 0)».
 */
export function shipmentCargo(query: string, name: string, code: string): string {
  const q = query.trim()
  const what = (q && !codeLike(q) ? q : name.trim()).replace(/\s+/g, ' ')
  const tail = code ? `ТН ВЭД ${fmtCode(code)}` : ''
  if (!what) return tail
  if (!tail) return what.slice(0, SHIPMENT_CARGO_MAX)
  const suffix = ` (${tail})`
  const room = SHIPMENT_CARGO_MAX - suffix.length
  return (what.length > room ? `${what.slice(0, room - 1).trimEnd()}…` : what) + suffix
}
