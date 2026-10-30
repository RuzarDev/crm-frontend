import { ref, shallowRef, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { preBorderApi, type PreBorder } from '@/api/preBorder'

/**
 * Поставка до границы заявки (очередь 4, задача 1): тихая загрузка — ошибка не мешает остальной карточке
 * (этапы просто без подшагов до границы, блок показывает «Повторить»). set — ответ после правки.
 * refreshKey — состояние заявки, от которого зависит блок (статус, отметка прибытия): сменилось — перечитываем.
 */
export function usePreBorder(caseId: MaybeRefOrGetter<string>, refreshKey?: MaybeRefOrGetter<string>) {
  const data = shallowRef<PreBorder | null>(null)
  const state = ref<'loading' | 'ready' | 'error'>('loading')
  let seq = 0
  const reload = async () => {
    const id = toValue(caseId)
    const my = ++seq
    if (!id) return
    if (!data.value) state.value = 'loading'
    try {
      const r = await preBorderApi.get(id)
      if (my !== seq || id !== toValue(caseId)) return
      data.value = r
      state.value = 'ready'
    } catch {
      if (my === seq) state.value = 'error'
    }
  }
  const set = (r: PreBorder) => {
    seq++
    data.value = r
    state.value = 'ready'
  }
  watch(() => toValue(caseId), () => { data.value = null; void reload() }, { immediate: true })
  // E-2 (30.10.2026, живой прогон): блок грузился один раз — после «Машина прибыла» / «Граница пройдена» КПП в той же
  // карточке «Прибытие на границу» оставалось «Ожидается». Заявку перечитали с другим статусом/прибытием — перечитываем и блок.
  if (refreshKey !== undefined) {
    watch(() => [toValue(caseId), toValue(refreshKey)] as const, ([id, key], [prevId, prevKey]) => {
      if (id === prevId && prevKey && key !== prevKey) void reload()
    })
  }
  return { data, state, reload, set }
}
