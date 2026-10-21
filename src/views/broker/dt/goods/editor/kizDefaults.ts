import { reactive, toRaw } from 'vue'
import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'

// Коды идентификации гр. 31.13 (правка №12, 21.10.2026): уровень, идентификатор применения, вид и количество КИЗ задаются
// один раз — «Для всех кодов», дальше вводится только номер (GTIN). Общие значения НЕ хранятся на сервере (вариант А
// kiz-design §4): каждая строка по-прежнему несёт полный набор полей (XML R.055, бланк, копирование, разделение — как
// раньше), а при открытии товара общие значения выводятся из строк — самое частое значение каждого поля.
// В сеансе общие значения и ручные правки строк живут в WeakMap по самому объекту товара (toRaw): автосейв форму не
// пересобирает, переход между товарами их не теряет. Если объект товара подменят (загрузка ДТ, «Отменить» импорта —
// восстановление из клонов), значения снова выведутся из строк.

export const KIZ_SHARED = ['levelCode', 'idApplicationCode', 'idTypeCode', 'kizCount', 'aggregated'] as const
export type KizSharedField = typeof KIZ_SHARED[number]

export interface KizDefaults {
  levelCode: string | null
  idApplicationCode: string | null
  idTypeCode: string | null
  /** Количество КИЗ на каждый код (в XML CIMQuantity — сумма по строкам). */
  kizCount: number | null
  aggregated: boolean
  /** «Маркировка после выпуска» — один признак на товар (XML: «ПВ», коды не выгружаются). */
  afterRelease: boolean
}

export const emptyKizDefaults = (): KizDefaults => ({
  levelCode: null, idApplicationCode: null, idTypeCode: null, kizCount: null, aggregated: false, afterRelease: false,
})

const blank = (v: unknown) => v === undefined || v === null || v === ''

/** '' / undefined / null равны; булевы (агрегированная упаковка) сравниваются через !!. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b
  if (blank(a) && blank(b)) return true
  return a === b
}

/** Номер строки без пробелов (пустой — строка без кода). */
export const hasKizNumber = (m: Import40GoodsMarking) => !!(m.number ?? '').trim()

const fieldValue = (m: Import40GoodsMarking, f: KizSharedField): string | number | boolean | null => {
  const v = m[f]
  if (f === 'aggregated') return !!v
  return blank(v) ? null : (v as string | number)
}

/**
 * Общие значения из строк: по каждому полю — самое частое среди строк с номером (при равенстве — из более ранней
 * строки); номеров нет ни в одной строке — по всем строкам. «После выпуска» — есть ли признак хотя бы у одной строки
 * (как считает XML). Строк нет — пусто.
 */
export function deriveKizDefaults(rows: readonly Import40GoodsMarking[]): KizDefaults {
  const d = emptyKizDefaults()
  if (!rows.length) return d
  const numbered = rows.filter(hasKizNumber)
  const base = numbered.length ? numbered : rows
  for (const f of KIZ_SHARED) {
    const counts = new Map<string | number | boolean | null, number>()
    for (const m of base) {
      const v = fieldValue(m, f)
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    // Map хранит порядок первого появления — при равенстве остаётся значение более ранней строки.
    let best: string | number | boolean | null = null
    let bestN = 0
    for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n }
    ;(d as unknown as Record<string, unknown>)[f] = f === 'aggregated' ? !!best : best
  }
  d.afterRelease = rows.some((m) => !!m.markingAfterRelease)
  return d
}

/** Новая строка с общими значениями; вводится только номер. */
export function markingFromDefaults(d: KizDefaults, number: string | null = null): Import40GoodsMarking {
  return {
    markingAfterRelease: d.afterRelease,
    kizCount: d.kizCount,
    levelCode: d.levelCode,
    idTypeCode: d.idTypeCode,
    idApplicationCode: d.idApplicationCode,
    number: number && number.trim() ? number : null,
    aggregated: d.aggregated,
  }
}

/** Строка отличается от общих значений (чип «свои значения»). */
export function isCustomMarking(m: Import40GoodsMarking, d: KizDefaults): boolean {
  return KIZ_SHARED.some((f) => !sameValue(m[f], d[f]))
}

/** Поля строки, отличающиеся от общих. */
export function customFields(m: Import40GoodsMarking, d: KizDefaults): KizSharedField[] {
  return KIZ_SHARED.filter((f) => !sameValue(m[f], d[f]))
}

/** Общие значения пусты (ни одного поля). */
export function kizDefaultsEmpty(d: KizDefaults): boolean {
  return KIZ_SHARED.every((f) => (f === 'aggregated' ? !d.aggregated : blank(d[f])))
}

export interface KizState {
  defaults: KizDefaults
  overridden(m: Import40GoodsMarking, f: KizSharedField): boolean
  markOverride(m: Import40GoodsMarking, f: KizSharedField): void
  clearOverrides(m: Import40GoodsMarking): void
}

let states = new WeakMap<object, KizState>()

function createState(item: Import40GoodsItemInput): KizState {
  // Чтение без отслеживания: состояние создаётся внутри computed секции — без toRaw computed зависел бы от строк.
  const raw = toRaw(item)
  const defaults = reactive(deriveKizDefaults(raw.markings ?? [])) as KizDefaults
  const overrides = new WeakMap<object, Set<KizSharedField>>()
  return {
    defaults,
    overridden: (m, f) => overrides.get(toRaw(m))?.has(f) ?? false,
    markOverride: (m, f) => {
      const k = toRaw(m)
      let s = overrides.get(k)
      if (!s) overrides.set(k, (s = new Set()))
      s.add(f)
    },
    clearOverrides: (m) => { overrides.delete(toRaw(m)) },
  }
}

/** Состояние сеанса по товару: общие значения (reactive) и ручные правки строк. Ключ — toRaw(item). */
export function kizState(item: Import40GoodsItemInput): KizState {
  const k = toRaw(item)
  let s = states.get(k)
  if (!s) states.set(k, (s = createState(item)))
  return s
}

/** У товара уже есть состояние сеанса (общие значения выводились или задавались). */
export function hasKizState(item: Import40GoodsItemInput): boolean {
  return states.has(toRaw(item))
}

const list = (item: Import40GoodsItemInput): Import40GoodsMarking[] => {
  item.markings ??= []
  return item.markings
}

const coerce = (f: KizSharedField, v: unknown): string | number | boolean | null =>
  (f === 'aggregated' ? !!v : blank(v) ? null : (v as string | number))

/** Строки, которые сейчас следуют общему значению поля: равны ему и не изменены вручную. */
export function kizFollowers(item: Import40GoodsItemInput, f: KizSharedField): Import40GoodsMarking[] {
  const st = kizState(item)
  return (item.markings ?? []).filter((m) => !st.overridden(m, f) && sameValue(m[f], st.defaults[f]))
}

/**
 * Новое общее значение поля: у каждой строки, где поле равно прежнему общему и не изменено вручную в этом сеансе,
 * ставится новое. followers — строки, следовавшие общему значению до начала набора (kizFollowers): при наборе числа
 * «1 → 2 → 20» промежуточное «2» не должно захватить строку, у которой своё «2». Возвращает число изменённых строк.
 */
export function setKizDefault(
  item: Import40GoodsItemInput, f: KizSharedField, v: unknown, followers?: readonly Import40GoodsMarking[],
): number {
  const st = kizState(item)
  const old = st.defaults[f]
  const next = coerce(f, v)
  ;(st.defaults as unknown as Record<string, unknown>)[f] = next
  if (sameValue(old, next)) return 0
  const rows = item.markings ?? []
  const present = followers ? new Set(rows.map((m) => toRaw(m))) : null
  let n = 0
  for (const m of followers ?? rows) {
    if (present && !present.has(toRaw(m))) continue
    if (st.overridden(m, f) || (!followers && !sameValue(m[f], old)) || sameValue(m[f], next)) continue
    ;(m as unknown as Record<string, unknown>)[f] = next
    n += 1
  }
  return n
}

/**
 * «Маркировка после выпуска» — признак всего товара. Включили — всем строкам; строк нет — добавляется одна строка-носитель
 * без номера (при нуле строк XML-блока нет, признак не сохранился бы). Выключили — снимается у всех; если осталась одна
 * строка без номера (носитель), она удаляется.
 */
export function setKizAfterRelease(item: Import40GoodsItemInput, v: boolean): void {
  const st = kizState(item)
  st.defaults.afterRelease = v
  const arr = list(item)
  if (v) {
    if (!arr.length) arr.push(markingFromDefaults(st.defaults))
    else for (const m of arr) m.markingAfterRelease = true
    return
  }
  for (const m of arr) m.markingAfterRelease = false
  if (arr.length === 1 && !hasKizNumber(arr[0])) arr.splice(0, 1)
}

/** «Как у всех»: строке — общие значения, ручные правки сняты. */
export function resetMarkingToDefaults(item: Import40GoodsItemInput, m: Import40GoodsMarking): void {
  const st = kizState(item)
  for (const f of KIZ_SHARED) (m as unknown as Record<string, unknown>)[f] = st.defaults[f]
  m.markingAfterRelease = st.defaults.afterRelease
  st.clearOverrides(m)
}

/** Скопировать общие значения товару, у которого нет ни строк, ни своего состояния (раскладка Excel по товарам). */
export function adoptKizDefaults(item: Import40GoodsItemInput, d: KizDefaults): void {
  if ((item.markings?.length ?? 0) > 0 || hasKizState(item)) return
  Object.assign(kizState(item).defaults, { ...d })
}

/** Для тестов: забыть состояние сеанса всех товаров. */
export function resetKizState(): void {
  states = new WeakMap()
}
