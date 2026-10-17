// Перечень товаров, подлежащих маркировке (Приказ МТИ РК № 199-НҚ, ред. 04.09.2026), по кодам товаров ДТ — подсказка
// у маркировки товара «подлежит маркировке с …». Как useVatOffset:
// - кэш на сессию по (код, дата гр. А); недостающие коды — одним запросом (до 500), идущий запрос делят все;
// - тихо: сбой не даёт тоста — подсказки просто нет (это подсказка, не проверка).
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { nationalListsApi, type MarkingMatchRow } from '@/api/nationalLists'

const MAX_CODES = 500
const keyOf = (code: string, date: string) => `${code}|${date}`

const resolved = new Map<string, MarkingMatchRow[]>()
const pending = new Map<string, Promise<void>>()
let actLabel = ''

const validCode = (c: string | null | undefined): c is string => /^\d{10}$/.test((c ?? '').trim())

/** Загрузить коды, которых нет в кэше (на дату). Сбой — в кэше ничего не остаётся (повтор при следующем вызове). */
export async function loadMarkingList(codes: readonly (string | null | undefined)[], onDate: string | null | undefined): Promise<void> {
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
    const run = nationalListsApi.marking(chunk, date || null, { silent: true }).then((res) => {
      actLabel = res.actLabel
      const byCode = new Map(res.items.map((x) => [x.code, x.rows]))
      for (const c of chunk) resolved.set(keyOf(c, date), byCode.get(c) ?? [])
    }).finally(() => { for (const c of chunk) pending.delete(keyOf(c, date)) })
    for (const c of chunk) pending.set(keyOf(c, date), run)
    waits.push(run)
  }
  await Promise.all(waits)
}

/** Позиции перечня маркировки для кода на дату из кэша (не загружено или не в перечне — []). */
export const markingRows = (code: string | null | undefined, onDate: string | null | undefined): MarkingMatchRow[] =>
  (validCode(code) ? resolved.get(keyOf(code.trim(), (onDate ?? '').trim())) ?? [] : [])

/** Для тестов: сбросить кэш сессии. */
export function clearMarkingListCache(): void {
  resolved.clear()
  pending.clear()
  actLabel = ''
}

/** Позиции перечня маркировки для кода товара (реактивно); actLabel — «Приказ МТИ РК № 199-НҚ». */
export function useMarkingList(source: () => { code: string | null | undefined; onDate: string | null | undefined }) {
  const version = shallowRef(0)
  let alive = true
  watch(() => { const s = source(); return `${(s.onDate ?? '').trim()}#${(s.code ?? '').trim()}` }, () => {
    const s = source()
    if (!validCode(s.code)) return
    loadMarkingList([s.code], s.onDate).then(() => { if (alive) version.value++ }, () => { /* тихо: подсказки нет */ })
  }, { immediate: true })
  onBeforeUnmount(() => { alive = false })

  const rows = (): MarkingMatchRow[] => {
    void version.value // зависимость: перерисовать после загрузки
    const s = source()
    return markingRows(s.code, s.onDate)
  }
  const act = (): string => {
    void version.value
    return actLabel
  }
  return { rows, act }
}
