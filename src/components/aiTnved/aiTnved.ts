import { computed, ref } from 'vue'
import type { AiTnvedCode, AiTnvedResponseLike, AiTnvedStatus } from './types'
import { aiTnvedApi } from '@/api/aiTnved'

export type { AiTnvedCode }

// Чистая логика подбора кода с ИИ (17.10): уверенность, НДС, вопросы, статус для кнопки.

/** «87%» — уверенность модели. */
export const confidencePct = (c: number): string => `${Math.round(Math.max(0, Math.min(1, c)) * 100)}%`

export const confidenceTone = (c: number): 'done' | 'wait' | 'neutral' => (c >= 0.7 ? 'done' : c >= 0.4 ? 'wait' : 'neutral')

/** Ключ i18n подписи НДС: 16%, 5% по ПП №1204 или «5% — если товар в перечне». */
export const vatKey = (status: AiTnvedCode['info']['vatStatus']): string =>
  status === 'auto' ? 'aiTnved.vat.auto' : status === 'confirm' ? 'aiTnved.vat.confirm' : status === 'none' ? 'aiTnved.vat.none' : 'aiTnved.vat.unknown'

/** Уточняющие вопросы: общие и по кодам, без повторов (регистр и пробелы не важны), не больше max. */
export function collectQuestions(r: AiTnvedResponseLike, max = 6): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of [...r.questions, ...r.suggestions.flatMap((s) => s.questions)]) {
    const key = q.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(q.trim())
    if (out.length === max) break
  }
  return out
}

// Статус ИИ — один запрос на сессию страницы.
const status = ref<AiTnvedStatus | null>(null)
let loading: Promise<void> | null = null
export const loadAiTnvedStatus = (): Promise<void> => {
  loading ??= aiTnvedApi.status().then((s) => { status.value = s }).catch(() => { loading = null })
  return loading
}
export const resetAiTnvedStatus = () => { status.value = null; loading = null }

/**
 * Показывать ли кнопку «Подобрать с ИИ»: сотруднику — всегда (без ключа — обычный поиск с плашкой «ИИ недоступен»),
 * клиенту — только если модель подключена и администратор включил «ИИ для клиентов».
 */
export function useAiTnvedButton(isClient: () => boolean) {
  void loadAiTnvedStatus()
  return computed(() => (isClient() ? !!status.value?.available : true))
}
