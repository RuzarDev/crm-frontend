import { ref, shallowRef, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { preBorderApi, type PreBorder } from '@/api/preBorder'

/**
 * Поставка до границы заявки (очередь 4, задача 1): тихая загрузка — ошибка не мешает остальной карточке
 * (этапы просто без подшагов до границы, блок показывает «Повторить»). set — ответ после правки.
 */
export function usePreBorder(caseId: MaybeRefOrGetter<string>) {
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
  return { data, state, reload, set }
}
