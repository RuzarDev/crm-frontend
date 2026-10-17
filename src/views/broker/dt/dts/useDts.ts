// ДТС страницы ДТ (волна 6в, Task 4): один загрузчик GET …/dts — и для страницы (отметка и число раздела «ДТС»,
// строки «До подачи»), и для самого раздела (основной и добавочный лист), плюс действия раздела.
//
// - Загрузка: при загрузке ДТ, после каждого сохранения и при каждом входе в раздел (вызывает страница). Раздел
//   сам не грузит: прежде он делал свой GET, и при открытом разделе каждое сохранение давало два запроса (§5-8).
//   Без права декларанта (enabled = false) — без запроса.
//   Ответы по порядку: ответ устаревшего запроса (после reset или более нового запроса) состояние не меняет.
//   Вход в раздел, пока идёт загрузка (сразу после сохранения), — тот же запрос, а не второй (refresh({ reuse })).
//   Не загрузилось — прежний лист остаётся (раздел говорит, что он не обновлён), отметки раздела — «неизвестно».
// - Пункты: раздел и «До подачи» показывают только пункты самой ДТС (Graph «ДТС»); пункты ДТ из того же ответа —
//   только числом («XML ДТС требует и готовности ДТ»), их показывает готовность ДТ (§5-7).
// - Печать / инф. лист / XML: сначала saveForAction (несохранённое не теряется; в просмотре — без PUT и без тоста
//   «ДТ сохранена»). Ошибка PDF/XML — один тост с текстом сервера. XML 400 — список недостающего в плашке раздела
//   (xmlErrors) до следующей загрузки.
// - «Пересчитать гр. 45» — шаг 1 расчёта платежей (recalcCustomsValues: гр. 45/46 по счёту и расходам — та же
//   формула, а не копия гр. 25 ДТС; изменённые товары — «Пересчитать»), затем тихое сохранение — после него
//   страница обновит ДТС (onSaved); итог — после того, как ДТС обновилась. Гр. 45 не изменилась — без сохранения,
//   ДТС перечитывается, итог — «гр. 45 не изменилась».
import { computed, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import { dtsApi, type DtsView } from '@/api/dts'
import { i18n } from '@/i18n'
import { message } from '@/ui/message'
import { dtsReadinessItems } from '../dtPageModel'
import { graphFromText, normalizeGraph } from '../dtSections'
import { openPdf, saveFile } from '../dtFiles'
import type { DtReadinessItem } from '../useDtReadiness'

const t = (key: string, p?: Record<string, unknown>) => (p ? i18n.global.t(key, p) : i18n.global.t(key))

export interface UseDtsOptions {
  /** Спрашивать ли ДТС: право декларанта. */
  enabled: MaybeRefOrGetter<boolean>
  /** Право править ДТ: «Пересчитать гр. 45» только с ним. По умолчанию — нет. */
  editable?: MaybeRefOrGetter<boolean>
  /** Сохранение перед печатью и XML (useDtForm.saveForAction, тихо): в просмотре — true без PUT. */
  saveForAction?: () => Promise<boolean>
  /** Подтверждение перед XML ДТС (вариант разделения ЕТТ/ВТО — как у XML ДТ): false — не выгружать. */
  confirmXml?: () => Promise<boolean>
  /** Тихое сохранение после «Пересчитать гр. 45» (useDtForm.save). */
  save?: () => Promise<boolean>
  /** Шаг 1 расчёта платежей (useDtPayments.recalcCustomsValues): ошибку пробрасывает. */
  recalcCustomsValues?: () => Promise<{ updated: number; total: number }>
  /** Гр. 45 товаров формы (до и после шага 1 — сколько изменилось). */
  customsValues?: () => readonly (number | null | undefined)[]
  /**
   * Сохранить сейчас можно (нет конфликта 409, ДТ не грузится): иначе «Пересчитать гр. 45» останавливается до шага 1 —
   * гр. 45 и «Пересчитать» не тронуты (как «Рассчитать» в «Платежах»). По умолчанию — да.
   */
  canSave?: () => boolean
}

export function useDts(caseId: MaybeRefOrGetter<string>, dtId: MaybeRefOrGetter<string>, opts: UseDtsOptions) {
  const view = shallowRef<DtsView | null>(null)
  const loading = ref(false)
  /** Последняя загрузка не удалась (прежний лист, если был, остаётся). */
  const failed = ref(false)
  /** Ответ XML 400: что не даёт сформировать XML ДТС (ДТ и ДТС вместе). До следующей загрузки. */
  const xmlErrors = shallowRef<string[] | null>(null)
  const printing = ref<'pdf' | 'info-sheet-pdf' | null>(null)
  const xmlLoading = ref(false)
  const recalcLoading = ref(false)

  let seq = 0
  /** Идущая загрузка (для reuse). */
  let pending: Promise<void> | null = null

  /** Новая ДТ или перезагрузка: прежний ответ не показываем, идущий запрос не применяем. */
  const reset = () => {
    seq += 1
    pending = null
    view.value = null
    failed.value = false
    loading.value = false
    xmlErrors.value = null
  }

  const load = async (my: number): Promise<void> => {
    try {
      const v = await dtsApi.get(toValue(caseId), toValue(dtId), { silent: true })
      if (my !== seq) return
      view.value = v
      failed.value = false
    } catch {
      if (my === seq) failed.value = true
    } finally {
      if (my === seq) {
        loading.value = false
        pending = null
      }
    }
  }

  /**
   * Перечитать ДТС. reuse — если загрузка уже идёт (её начало сохранение или загрузка ДТ), дождаться её, а не
   * спрашивать снова: она не старше последнего сохранения.
   */
  const refresh = (o: { reuse?: boolean } = {}): Promise<void> => {
    if (o.reuse && pending) return pending
    const my = ++seq
    xmlErrors.value = null
    if (!toValue(opts.enabled)) {
      pending = null
      view.value = null
      failed.value = false
      loading.value = false
      return Promise.resolve()
    }
    loading.value = true
    pending = load(my)
    return pending
  }

  /** Пункты самой ДТС (число и галочка раздела «ДТС», строки «До подачи»); null — ответа нет. */
  const items = computed<DtReadinessItem[] | null>(() => (view.value && !failed.value ? dtsReadinessItems(view.value) : null))
  /** Сколько не хватает самой ДТ (XML ДТС требует и её готовности). */
  const dtMissingCount = computed(() => {
    const v = view.value
    if (!v) return 0
    if (v.items) return v.items.filter((i) => normalizeGraph(i.graph) !== 'ДТС').length
    return (v.missing ?? []).filter((m) => graphFromText(m) !== 'ДТС').length
  })
  /** Товары (номер с 1), у которых гр. 45 ДТ не совпадает с гр. 25а ДТС (до копейки — сервер). */
  const mismatch = computed(() => new Set(view.value?.mismatchGoods ?? []))

  /** Спрашивается ли ДТС (нет — нет права декларанта). */
  const enabled = computed(() => !!toValue(opts.enabled))

  const busy = computed(() => printing.value !== null || xmlLoading.value)

  const print = async (kind: 'pdf' | 'info-sheet-pdf') => {
    if (busy.value) return
    if (opts.saveForAction && !(await opts.saveForAction())) return
    printing.value = kind
    try {
      openPdf(await dtsApi.pdf(toValue(caseId), toValue(dtId), kind))
    } catch (e) {
      message.error((e as Error | undefined)?.message || t('broker.dt.dts.printError'))
    } finally {
      printing.value = null
    }
  }

  const xml = async () => {
    if (busy.value) return
    if (opts.confirmXml && !(await opts.confirmXml())) return
    if (opts.saveForAction && !(await opts.saveForAction())) return
    xmlLoading.value = true
    try {
      const res = await dtsApi.xml(toValue(caseId), toValue(dtId))
      if ('errors' in res) {
        xmlErrors.value = res.errors
        message.warning(t('broker.dt.dts.xmlNotReady'))
        return
      }
      saveFile(res.blob, res.fileName)
      message.success(t('broker.dt.dts.xmlDone'))
    } catch (e) {
      message.error((e as Error | undefined)?.message || t('broker.dt.dts.xmlError'))
    } finally {
      xmlLoading.value = false
    }
  }

  /** «Пересчитать гр. 45»: шаг 1 расчёта платежей → тихое сохранение (после него страница обновит ДТС). */
  const recalc45 = async (): Promise<boolean> => {
    if (!toValue(opts.editable) || recalcLoading.value || !opts.recalcCustomsValues || !opts.save) return false
    if (opts.canSave && !opts.canSave()) {
      message.warning(t('broker.dt.dts.sheet.recalcBlocked'))
      return false
    }
    recalcLoading.value = true
    try {
      const before = opts.customsValues?.().slice() ?? null
      let updated: number
      try {
        ({ updated } = await opts.recalcCustomsValues())
      } catch {
        return false // текст ошибки показал общий перехватчик
      }
      const after = opts.customsValues?.() ?? null
      const changed = before && after
        ? Math.max(before.length, after.length) - before.filter((v, i) => (v ?? null) === (after[i] ?? null)).length
        : updated
      const seqBefore = seq
      if (changed > 0 && !(await opts.save())) {
        message.warning(t('broker.dt.dts.sheet.recalcNotSaved'))
        return false
      }
      // Сохранение уже начало загрузку ДТС (onSaved страницы) — ждём её (могла и закончиться); не начало — сами.
      if (seq !== seqBefore) await (pending ?? Promise.resolve())
      else await refresh()
      if (failed.value) message.warning(t('broker.dt.dts.sheet.recalcNoRefresh'))
      else if (changed > 0) message.success(t('broker.dt.dts.sheet.recalcDone', { n: changed }))
      else message.info(t('broker.dt.dts.sheet.recalcSame'))
      return true
    } finally {
      recalcLoading.value = false
    }
  }

  return {
    enabled,
    view,
    loading,
    failed,
    xmlErrors,
    items,
    dtMissingCount,
    mismatch,
    printing,
    xmlLoading,
    recalcLoading,
    reset,
    refresh,
    print,
    xml,
    recalc45,
  }
}

export type DtsState = ReturnType<typeof useDts>
