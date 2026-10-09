import { computed, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import { kedenListKey, kedenProcedureListsApi, type KedenProcedureLists } from '@/api/kedenProcedureLists'
import type { ZOption } from '@/ui/options'

// Списки КЕДЕН по процедуре гр. 1 (ref/keden-procedure-lists): какие коды КЕДЕН предлагает в блоке товара — гр. 36 ×4
// (сбор, пошлина, акциз, НДС), гр. 37 предшествующая процедура (prev) и особенность перемещения. Ключ — направление
// гр. 1 + 2 цифры процедуры товара или ДТ («ИМ40», «ЭК10»; как в KedenXmlReadiness на сервере). Список сужает выбор;
// выбранный код вне списка НЕ удаляется — остаётся пунктом и подсвечивается. Сочетание, которого нет в списках, не
// сужается. Процедура гр. 37 сужается тоже (K2): только процедуры, для которых у направления есть списки КЕДЕН —
// иначе гр. 36 «уезжает» на несуществующее сочетание.
// Списки грузятся один раз на сессию, тихо; не загрузились — полный список, без тоста и без повторов.

/** Поле списков: коды полей сервера + 'procedure' (гр. 37 — процедуры, для которых у направления есть списки). */
export type KedenListField = 'pref-fee' | 'pref-duty' | 'pref-excise' | 'pref-vat' | 'prev' | 'movement-features' | 'procedure'

const lists = shallowRef<KedenProcedureLists | null>(null)
let requested = false

/** Загрузить списки (один запрос на сессию; ошибка — молча, без сужения). */
export function ensureKedenLists(): void {
  if (requested) return
  requested = true
  kedenProcedureListsApi.get().then((l) => { lists.value = l }).catch(() => {})
}

/** Для тестов: забыть загруженные списки. */
export function resetKedenLists(): void {
  lists.value = null
  requested = false
}

/** гр. 36: «Без льгот» (ОО, О) и «Z» — первыми, остальные по коду. */
export const PREF_PINNED: readonly string[] = ['ОО', 'О', 'Z']
export const pinPreferences = (options: readonly ZOption[]): ZOption[] => {
  const rank = (v: string) => { const i = PREF_PINNED.indexOf(v); return i === -1 ? 99 : i }
  return [...options].sort((a, b) => rank(String(a.value)) - rank(String(b.value)) || String(a.value).localeCompare(String(b.value), 'ru'))
}

const directionOf = (d: string | null | undefined) => (d ?? '').trim().toUpperCase() || 'ИМ'

export interface KedenListsSource {
  /** гр. 1 — направление (ИМ/ЭК). */
  direction?: string | null
  /** Процедура для ключа: процедура товара, иначе ДТ. */
  procedure?: string | null
}

export function useKedenLists(source: MaybeRefOrGetter<KedenListsSource>) {
  ensureKedenLists()
  const key = computed(() => kedenListKey(toValue(source).direction, toValue(source).procedure))
  /** «ИМ 40» — для подписей. */
  const keyLabel = computed(() => key.value?.replace(/(\d{2})$/, ' $1') ?? '')

  const fieldSets = computed(() => {
    const entry = key.value ? lists.value?.[key.value] : undefined
    return entry ? new Map(Object.entries(entry).map(([f, codes]) => [f, new Set(codes)])) : null
  })
  const procedureSet = computed(() => {
    const l = lists.value
    if (!l) return null
    const dir = directionOf(toValue(source).direction)
    const codes = Object.keys(l).filter((k) => k.startsWith(dir) && k.length === dir.length + 2).map((k) => k.slice(dir.length))
    return codes.length ? new Set(codes) : null
  })

  /** Допустимые коды поля; null — не сужается (списки не загружены или сочетания нет). */
  const allowed = (field: KedenListField): ReadonlySet<string> | null =>
    field === 'procedure' ? procedureSet.value : fieldSets.value?.get(field) ?? null
  // Процедура товара бывает и 4-значной (старые ДТ, «4000») — сверяем первые 2 цифры, как ключ.
  const codeOf = (field: KedenListField, v: string) => (field === 'procedure' ? v.slice(0, 2) : v)

  /** Выбранный код, которого КЕДЕН при этой процедуре не предлагает. */
  const offList = (field: KedenListField, value: string | null | undefined): boolean => {
    const v = (value ?? '').trim()
    const set = allowed(field)
    return !!v && !!set && !set.has(codeOf(field, v))
  }

  /** Опции, суженные списком КЕДЕН; текущее значение остаётся всегда (вне справочника — пунктом «как есть»). */
  const narrow = (field: KedenListField, options: readonly ZOption[], current: string | null | undefined): ZOption[] => {
    const set = allowed(field)
    const cur = (current ?? '').trim()
    const list = set ? options.filter((o) => set.has(codeOf(field, String(o.value))) || String(o.value) === cur) : [...options]
    return cur && !list.some((o) => String(o.value) === cur) ? [{ value: cur, label: cur }, ...list] : list
  }

  /** Для ключа есть списки — гр. 36/37 сужены. */
  const narrowed = computed(() => !!fieldSets.value)

  return { key, keyLabel, narrowed, allowed, offList, narrow }
}
export type KedenLists = ReturnType<typeof useKedenLists>
