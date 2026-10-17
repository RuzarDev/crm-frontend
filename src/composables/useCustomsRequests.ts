import { ref, shallowRef, watch } from 'vue'
import { customsRequestsApi, type CustomsRequestDto } from '@/api/customsRequests'

/**
 * Запросы таможни заявки (волна 17.10, задача 5): тихая загрузка (блок необязателен — при сбое просто пуст),
 * перечитывание после действия; ответ по прежней заявке (сменился id) отбрасывается.
 */
export function useCustomsRequests(caseId: () => string | null | undefined) {
  const list = shallowRef<CustomsRequestDto[]>([])
  const loaded = ref(false)
  let seq = 0

  const reload = async (): Promise<void> => {
    const id = caseId()
    const my = ++seq
    if (!id) {
      list.value = []
      loaded.value = false
      return
    }
    try {
      const rows = await customsRequestsApi.list(id, { silent: true })
      if (my !== seq) return
      list.value = rows
      loaded.value = true
    } catch {
      if (my !== seq) return
      list.value = []
      loaded.value = false
    }
  }

  watch(caseId, () => {
    list.value = []
    loaded.value = false
    void reload()
  }, { immediate: true })

  return { list, loaded, reload }
}
