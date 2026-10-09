import { computed, reactive, readonly, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  prohibitionCodesApi, type ProhibitionCodeItem, type ProhibitionSuggestResult, type SuggestedProhibitionCode,
} from '@/api/prohibitionCodes'

// Гр. 33 — коды запретов и ограничений (признаки нетарифного регулирования, XML ProhibitionCode) по ТН ВЭД товара.
// Источник подсказок — «Справка по товару» КЕДЕН (GET ref/prohibition-codes/suggest?tnved=…). Правила (как раньше):
// - КЕДЕН по коду ответил — выбор ТОЛЬКО из его кодов: другие КЕДЕН не примет, готовность XML их не пропустит
//   (KedenXmlReadiness, gr33Allowed). Весь справочник (Приказ МФ РК № 259) — только когда ответа нет (код не 10 знаков,
//   КЕДЕН недоступен).
// - При импорте экспортные коды (exportOnly) скрыты; экспорт — процедура товара, иначе ДТ: 10/21/23/31 (как
//   Gr33Direction.IsExportProcedure на сервере).
// - НИЧЕГО не подставляется само: коды выбирает декларант (юридическая ответственность) — здесь только списки.
// Ответы кэшируются на сессию по коду: повторное открытие товара получает подсказки сразу, без запроса и «загрузки».

/** Процедура вывоза (гр. 1 «10», гр. 37 товара «1000» — первые две цифры). */
export const isExportProcedure = (procedure: string | null | undefined): boolean =>
  ['10', '21', '23', '31'].includes((procedure ?? '').trim().slice(0, 2))

const resolved = new Map<string, ProhibitionSuggestResult>()
const reference = shallowRef<readonly ProhibitionCodeItem[]>([])
let referenceRequested = false

/** Справочник кодов гр. 33 — один запрос на сессию, тихо; не загрузился — повторим при следующем товаре. */
export function ensureGr33Reference(): void {
  if (referenceRequested) return
  referenceRequested = true
  prohibitionCodesApi.list().then((list) => { reference.value = list }).catch(() => { referenceRequested = false })
}

/** Для тестов: забыть кэш подсказок и справочник. */
export function resetGr33Suggest(): void {
  resolved.clear()
  reference.value = []
  referenceRequested = false
}

export interface Gr33Source {
  /** Код ТН ВЭД товара (подсказки — только по 10 цифрам). */
  tnved: string | null | undefined
  /** Процедура товара, иначе ДТ — для «экспортные скрыты при импорте». */
  procedure: string | null | undefined
}

export interface Gr33SuggestState {
  /** 10-значный код, по которому спрошены подсказки; '' — кода нет. */
  tnved: string
  loading: boolean
  /** КЕДЕН не ответил (ошибка или только старый пустой кэш). */
  failed: boolean
  /** Подсказки из старого кэша сервера — КЕДЕН сейчас не отвечает. */
  warning: boolean
  codes: SuggestedProhibitionCode[]
}

export function useGr33Suggest(source: MaybeRefOrGetter<Gr33Source>) {
  ensureGr33Reference()
  const state = reactive<Gr33SuggestState>({ tnved: '', loading: false, failed: false, warning: false, codes: [] })

  const apply = (r: ProhibitionSuggestResult) => {
    state.codes = r.codes
    state.warning = r.stale && r.codes.length > 0
    state.failed = r.stale && r.codes.length === 0
  }

  let seq = 0
  const load = async (raw: string | null | undefined) => {
    const tnved = (raw ?? '').replace(/\D/g, '')
    const my = ++seq
    if (tnved.length !== 10) {
      Object.assign(state, { tnved: '', loading: false, failed: false, warning: false, codes: [] })
      return
    }
    state.tnved = tnved
    const hit = resolved.get(tnved)
    if (hit) {
      apply(hit)
      state.loading = false
      return
    }
    Object.assign(state, { loading: true, failed: false, warning: false, codes: [] })
    try {
      const r = await prohibitionCodesApi.suggest(tnved)
      // Пустой старый кэш — «КЕДЕН не отвечает»: не запоминаем, следующее открытие спросит снова.
      if (!(r.stale && r.codes.length === 0)) resolved.set(tnved, r)
      if (my === seq) apply(r)
    } catch {
      if (my === seq) state.failed = true
    } finally {
      if (my === seq) state.loading = false
    }
  }
  watch(() => toValue(source).tnved, (v) => { void load(v) }, { immediate: true })

  const isExport = computed(() => isExportProcedure(toValue(source).procedure))
  /** Подсказки, которые можно выбрать: при импорте — без экспортных. */
  const visible = computed(() => state.codes.filter((c) => isExport.value || !c.exportOnly))
  const visibleSet = computed(() => new Set(visible.value.map((c) => c.code)))
  /** КЕДЕН по коду ответил (в т.ч. пусто или только экспортные при импорте) — список ровно из его ответа. */
  const byTnved = computed(() => !!state.tnved && !state.loading && !state.failed)
  const referenceByCode = computed(() => new Map(reference.value.map((c) => [c.code, c])))

  const nameOf = (code: string): string | null =>
    referenceByCode.value.get(code)?.name ?? state.codes.find((c) => c.code === code)?.name ?? null

  /** Коды, из которых выбирают: подсказки КЕДЕН, когда он ответил, иначе весь справочник. */
  const choices = computed<{ code: string; name: string | null; category: string | null }[]>(() => (byTnved.value
    ? visible.value.map((c) => ({ code: c.code, name: nameOf(c.code), category: null }))
    : reference.value.map((c) => ({ code: c.code, name: c.name, category: c.categoryName }))))

  /** Выбранные коды, которые КЕДЕН для этого ТН ВЭД не примет (вне его списка; при импорте — и экспортные). */
  const rejected = (selected: readonly string[]): string[] =>
    (byTnved.value ? selected.filter((c) => !visibleSet.value.has(c)) : [])
  /** Коды «не подпадает» (XX00) из подсказок, которых ещё нет среди выбранных. */
  const negativeToAdd = (selected: readonly string[]): string[] =>
    visible.value.filter((c) => c.isNegative && !selected.includes(c.code)).map((c) => c.code)
  /** Без ответа КЕДЕН: коды формата D0110, которых нет в справочнике (справочник не загрузился — молчим). */
  const unknown = (selected: readonly string[]): string[] =>
    (byTnved.value || !reference.value.length ? [] : selected.filter((c) => /^[A-Z]\d{4}$/.test(c) && !referenceByCode.value.has(c)))

  return {
    state: readonly(state),
    isExport,
    visible,
    byTnved,
    choices,
    referenceSize: computed(() => reference.value.length),
    nameOf,
    rejected,
    negativeToAdd,
    unknown,
  }
}

export type Gr33Suggest = ReturnType<typeof useGr33Suggest>
