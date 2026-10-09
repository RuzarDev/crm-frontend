// Готовность ДТ к КЕДЕН для страницы ДТ — волна 6а, Task 2.
// - Сервер (GET …/keden-readiness, тихо): пункты с графой и номером товара (items, Task 1 сервера);
//   старый сервер без items — разбор номера графы из строки (dtSections, регистр не важен).
// - Запрос только при enabled (право import40.declarant / CanManageDeclarations): иначе ничего не спрашиваем,
//   без тостов; «готово» — только по загруженному ответу (B4: раньше пустое состояние читалось как «готово»).
// - Ошибки последней выгрузки XML (400 с перечнем) важнее серверной готовности, но лишь до следующего
//   успешного сохранения (afterSave): B1 — раньше они висели до повторной выгрузки.
import { computed, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { import40Api, type KedenReadinessDto } from '@/api/import40'
import { goodsIndexFromText, graphFromText, normalizeGraph, sectionForReadinessItem, type DtSectionKey } from './dtSections'

export interface DtReadinessItem {
  text: string
  /** Графа в каноническом виде («А», «8», «30», «ДТС»); не определена — null. */
  graph: string | null
  goodsIndex: number | null
  section: DtSectionKey
  /** Пункт из ответа выгрузки XML, а не из проверки готовности. */
  fromXml: boolean
}

export interface DtBlankProgress {
  filled: number
  total: number
  /** Процент заполнения бланка, округлённый. */
  pct: number
  complete: boolean
  emptyGraphs: string[]
}

export interface DtReadinessOptions {
  enabled: MaybeRefOrGetter<boolean>
}

const fromText = (text: string, fromXml: boolean): DtReadinessItem => {
  const goodsIndex = goodsIndexFromText(text)
  return { text, graph: graphFromText(text), goodsIndex, section: sectionForReadinessItem({ text, goodsIndex }), fromXml }
}

export function useDtReadiness(
  caseId: MaybeRefOrGetter<string>,
  dtId: MaybeRefOrGetter<string>,
  opts: DtReadinessOptions,
) {
  const readiness = shallowRef<KedenReadinessDto | null>(null)
  const xmlErrors = ref<string[]>([])
  const loaded = computed(() => readiness.value !== null)

  const serverItems = computed<DtReadinessItem[]>(() => {
    const r = readiness.value
    if (!r) return []
    if (r.items) {
      return r.items.map((i) => ({
        text: i.text,
        graph: normalizeGraph(i.graph),
        goodsIndex: i.goodsIndex ?? null,
        section: sectionForReadinessItem(i),
        fromXml: false,
      }))
    }
    return (r.missing ?? []).map((m) => fromText(m, false))
  })

  /** Чего не хватает: ошибки последней выгрузки XML, а без них — серверная готовность. */
  const items = computed<DtReadinessItem[]>(() =>
    xmlErrors.value.length ? xmlErrors.value.map((e) => fromText(e, true)) : serverItems.value,
  )

  const bySection = computed(() => {
    const out: Partial<Record<DtSectionKey, number>> = {}
    for (const i of items.value) out[i.section] = (out[i.section] ?? 0) + 1
    return out
  })

  /** Готово к выгрузке: ответ сервера есть и пунктов нет. */
  const ready = computed(() => loaded.value && items.value.length === 0)

  const blank = computed<DtBlankProgress | null>(() => {
    const r = readiness.value
    if (!r) return null
    const total = r.blankTotal ?? 0
    const filled = r.blankFilled ?? 0
    return {
      filled,
      total,
      pct: total ? Math.round((filled / total) * 100) : 0,
      complete: total > 0 && filled >= total,
      emptyGraphs: r.blankEmptyGraphs ?? [],
    }
  })

  let seq = 0
  const refresh = async () => {
    const my = ++seq
    if (!toValue(opts.enabled)) {
      readiness.value = null
      return
    }
    try {
      const res = await import40Api.kedenReadiness(toValue(caseId), toValue(dtId), { silent: true })
      if (my === seq) readiness.value = res
    } catch {
      if (my === seq) readiness.value = null
    }
  }

  const setXmlErrors = (errors: string[]) => { xmlErrors.value = [...errors] }
  const clearXmlErrors = () => { xmlErrors.value = [] }

  /** После успешного сохранения: ошибки прошлой выгрузки XML устарели — сброс и свежая готовность. */
  const afterSave = async () => {
    clearXmlErrors()
    await refresh()
  }

  /** Новая ДТ или перезагрузка: всё прежнее не про неё. */
  const reset = () => {
    seq++
    readiness.value = null
    clearXmlErrors()
  }

  watch(() => toValue(opts.enabled), (on) => { if (!on) reset() })

  return { readiness, loaded, items, bySection, ready, blank, xmlErrors, refresh, setXmlErrors, clearXmlErrors, afterSave, reset }
}
