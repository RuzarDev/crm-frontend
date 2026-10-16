// Перечни для зачёта НДС (ПП РК № 1199, Приказ МСХ РК № 302) по кодам товаров ДТ — для подсказки у строки 5060 гр. 47.
// - Кэш на сессию по (код, дата гр. А): товары с одним кодом, повторное открытие товара и раздел «Платежи» — без запроса;
//   недостающие коды — одним запросом (до 500 кодов), идущий запрос делят все, кто спросил те же коды.
// - Тихо: сбой не даёт тоста — подсказки просто нет (это подсказка, не проверка).
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { vatOffsetApi, type VatOffsetMatchRow } from '@/api/vatOffset'

const MAX_CODES = 500
const keyOf = (code: string, date: string) => `${code}|${date}`

const resolved = new Map<string, VatOffsetMatchRow[]>()
const pending = new Map<string, Promise<void>>()

const validCode = (c: string | null | undefined): c is string => /^\d{10}$/.test((c ?? '').trim())

/** Загрузить коды, которых нет в кэше (на дату). Сбой — в кэше ничего не остаётся (повтор при следующем вызове). */
export async function loadVatOffset(codes: readonly (string | null | undefined)[], onDate: string | null | undefined): Promise<void> {
  const date = (onDate ?? '').trim()
  const want = [...new Set(codes.map((c) => (c ?? '').trim()).filter(validCode))]
  const waits: Promise<void>[] = []
  const missing: string[] = []
  for (const c of want) {
    const k = keyOf(c, date)
    if (resolved.has(k)) continue
    const run = pending.get(k)
    if (run) waits.push(run)
    else missing.push(c)
  }
  for (let i = 0; i < missing.length; i += MAX_CODES) {
    const chunk = missing.slice(i, i + MAX_CODES)
    const run = vatOffsetApi.match(chunk, date || null, { silent: true }).then((res) => {
      const byCode = new Map(res.items.map((x) => [x.code, x.rows]))
      for (const c of chunk) resolved.set(keyOf(c, date), byCode.get(c) ?? [])
    }).finally(() => { for (const c of chunk) pending.delete(keyOf(c, date)) })
    for (const c of chunk) pending.set(keyOf(c, date), run)
    waits.push(run)
  }
  await Promise.all(waits)
}

/** Строки перечней для кода на дату из кэша (не загружено или не в перечнях — []). */
export const vatOffsetRows = (code: string | null | undefined, onDate: string | null | undefined): VatOffsetMatchRow[] =>
  (validCode(code) ? resolved.get(keyOf(code.trim(), (onDate ?? '').trim())) ?? [] : [])

/** Для тестов: сбросить кэш сессии. */
export function clearVatOffsetCache(): void {
  resolved.clear()
  pending.clear()
}

/**
 * Перечни для кодов товаров: rowsOf(code) — строки перечней, покрывающие код (реактивно: после загрузки компонент
 * перерисуется). source — коды и дата гр. А; смена набора кодов/даты — загрузка недостающих.
 */
export function useVatOffset(source: () => { codes: readonly (string | null | undefined)[]; onDate: string | null | undefined }) {
  const version = shallowRef(0)
  let alive = true
  const args = () => {
    const s = source()
    const codes = [...new Set(s.codes.filter(validCode).map((c) => c.trim()))].sort()
    return { codes, onDate: (s.onDate ?? '').trim() }
  }
  watch(() => { const a = args(); return `${a.onDate}#${a.codes.join(',')}` }, () => {
    const a = args()
    if (!a.codes.length) return
    loadVatOffset(a.codes, a.onDate).then(() => { if (alive) version.value++ }, () => { /* тихо: подсказки нет */ })
  }, { immediate: true })
  onBeforeUnmount(() => { alive = false })

  const rowsOf = (code: string | null | undefined): VatOffsetMatchRow[] => {
    void version.value // зависимость: перерисовать после загрузки
    return vatOffsetRows(code, source().onDate)
  }
  return { rowsOf }
}
