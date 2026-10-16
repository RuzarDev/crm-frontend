import { computed, reactive, readonly, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  prohibitionCodesApi, type Gr33EditionStatus, type ProhibitionCodeItem, type ProhibitionSuggestResult, type SuggestedProhibitionCode,
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
// Редакция Приказа № 259 (с 09.10.2026): пока переход не включён на сервере (activeFrom = null — КЕДЕН ещё на своей
// нумерации), всё как раньше, запросы без даты. После перехода ДТ с гр. А от даты перехода получают справочник и подсказки
// по редакции Приказа (в запросы уходит дата перехода — ответ одинаков для всех дат после неё), ДТ раньше — по-старому.

/** Процедура вывоза (гр. 1 «10», гр. 37 товара «1000» — первые две цифры). */
export const isExportProcedure = (procedure: string | null | undefined): boolean =>
  ['10', '21', '23', '31'].includes((procedure ?? '').trim().slice(0, 2))

const resolved = new Map<string, ProhibitionSuggestResult>()
/** Справочники по редакции: '' — список КЕДЕН, дата перехода — редакция Приказа № 259. */
const references = shallowRef<ReadonlyMap<string, readonly ProhibitionCodeItem[]>>(new Map())
const referenceRequested = new Set<string>()
const edition = shallowRef<Gr33EditionStatus | null>(null)
let editionRequested = false

/** Справочник кодов гр. 33 — один запрос на сессию (на редакцию), тихо; не загрузился — повторим при следующем товаре. */
export function ensureGr33Reference(key = ''): void {
  if (referenceRequested.has(key)) return
  referenceRequested.add(key)
  ;(key ? prohibitionCodesApi.list(key) : prohibitionCodesApi.list())
    .then((list) => { references.value = new Map(references.value).set(key, list) })
    .catch(() => { referenceRequested.delete(key) })
}

/** Включён ли переход на редакцию Приказа № 259 — один тихий запрос на сессию; сбой = как раньше (список КЕДЕН). */
function ensureGr33Edition(): void {
  if (editionRequested) return
  editionRequested = true
  Promise.resolve()
    .then(() => prohibitionCodesApi.editionStatus())
    .then((s) => { edition.value = s })
    .catch(() => { editionRequested = false })
}

const todayKz = (): string => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)

/** Дата гр. А → YYYY-MM-DD (принимает ISO и ДД.ММ.ГГГГ); пусто — сегодня. */
export function gr33Date(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  if (iso) return iso[1]
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(v)
  return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : todayKz()
}

/** Редакция для даты гр. А: '' — список КЕДЕН; иначе дата перехода (activeFrom) — по редакции Приказа № 259. */
export function gr33EditionKey(activeFrom: string | null | undefined, date: string | null | undefined): string {
  if (!activeFrom) return ''
  return gr33Date(date) >= activeFrom ? activeFrom : ''
}

/** Для тестов: забыть кэш подсказок, справочники и статус редакции. */
export function resetGr33Suggest(): void {
  resolved.clear()
  references.value = new Map()
  referenceRequested.clear()
  edition.value = null
  editionRequested = false
}

export interface Gr33Source {
  /** Код ТН ВЭД товара (подсказки — только по 10 цифрам). */
  tnved: string | null | undefined
  /** Процедура товара, иначе ДТ — для «экспортные скрыты при импорте». */
  procedure: string | null | undefined
  /** Дата гр. А ДТ (пусто — сегодня): после перехода на редакцию Приказа № 259 выбирает нумерацию кодов. */
  date?: string | null
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
  ensureGr33Edition()
  /** '' — список КЕДЕН (как до редакции), иначе дата перехода на редакцию Приказа № 259. */
  const editionKey = computed(() => gr33EditionKey(edition.value?.activeFrom, toValue(source).date))
  watch(editionKey, (k) => ensureGr33Reference(k), { immediate: true })
  const reference = computed(() => references.value.get(editionKey.value) ?? [])
  const state = reactive<Gr33SuggestState>({ tnved: '', loading: false, failed: false, warning: false, codes: [] })

  const apply = (r: ProhibitionSuggestResult) => {
    state.codes = r.codes
    state.warning = r.stale && r.codes.length > 0
    state.failed = r.stale && r.codes.length === 0
  }

  let seq = 0
  const load = async (raw: string | null | undefined, key: string) => {
    const tnved = (raw ?? '').replace(/\D/g, '')
    const cacheKey = key ? `${key}|${tnved}` : tnved
    const my = ++seq
    if (tnved.length !== 10) {
      Object.assign(state, { tnved: '', loading: false, failed: false, warning: false, codes: [] })
      return
    }
    state.tnved = tnved
    const hit = resolved.get(cacheKey)
    if (hit) {
      apply(hit)
      state.loading = false
      return
    }
    Object.assign(state, { loading: true, failed: false, warning: false, codes: [] })
    try {
      const r = await (key ? prohibitionCodesApi.suggest(tnved, key) : prohibitionCodesApi.suggest(tnved))
      // Старый кэш сервера (КЕДЕН не ответил — пусто или с прежними кодами) не запоминаем: следующее открытие товара
      // спросит снова, и «КЕДЕН не отвечает» / «сохранённые ранее» уйдут, когда он ответит.
      if (!r.stale) resolved.set(cacheKey, r)
      if (my === seq) apply(r)
    } catch {
      if (my === seq) state.failed = true
    } finally {
      if (my === seq) state.loading = false
    }
  }
  watch(() => [toValue(source).tnved, editionKey.value] as const, ([v, k]) => { void load(v, k) }, { immediate: true })

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
    /** '' — коды КЕДЕН; иначе дата, с которой коды по редакции Приказа № 259. */
    editionKey,
    nameOf,
    rejected,
    negativeToAdd,
    unknown,
  }
}

export type Gr33Suggest = ReturnType<typeof useGr33Suggest>
