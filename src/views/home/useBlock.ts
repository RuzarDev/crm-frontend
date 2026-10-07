import { reactive, ref, shallowRef } from 'vue'

export interface Block<T> {
  readonly data: T | null
  readonly loading: boolean
  readonly error: boolean
  /** Загрузить заново (кнопка «Повторить» — только этот блок). */
  load: () => Promise<void>
}

/**
 * Один блок Главной со своим состоянием: блоки грузятся независимо, ошибка одного не трогает остальные.
 * Выключенный блок (нет права) не грузится и не «висит» в загрузке. Ответ устаревшего запроса
 * (повтор нажат, пока шёл прежний) отбрасывается. Объект reactive — в шаблоне без .value.
 */
export function useBlock<T>(enabled: boolean, fetcher: () => Promise<T>): Block<T> {
  const data = shallowRef<T | null>(null)
  const loading = ref(enabled)
  const error = ref(false)
  let seq = 0

  const load = async () => {
    if (!enabled) return
    const my = ++seq
    loading.value = true
    error.value = false
    try {
      const res = await fetcher()
      if (my === seq) data.value = res
    } catch {
      if (my === seq) error.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }

  return reactive({ data, loading, error, load }) as Block<T>
}
