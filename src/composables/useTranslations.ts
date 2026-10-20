import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { translationApi } from '@/api/preBorder'

/** Какие файлы заявки уже переведены ИИ (кнопка «Перевод» вместо «Перевести (ИИ)»). Ошибка — как будто переводов нет. */
export function useTranslations(caseId: MaybeRefOrGetter<string>) {
  const ids = ref<Set<string>>(new Set())
  let seq = 0
  const reload = async () => {
    const id = toValue(caseId)
    const my = ++seq
    if (!id) { ids.value = new Set(); return }
    try {
      const list = await translationApi.list(id)
      if (my === seq) ids.value = new Set(list.map((x) => x.fileId))
    } catch {
      if (my === seq) ids.value = new Set()
    }
  }
  const mark = (fileId: string) => { ids.value = new Set([...ids.value, fileId]) }
  watch(() => toValue(caseId), () => { void reload() }, { immediate: true })
  return { ids, reload, mark }
}
