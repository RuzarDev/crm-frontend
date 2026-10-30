import { watch, type WatchStopHandle } from 'vue'
import type { BrokerInvoice } from '@/api/billing'

// /billing?case=<caseId> — только фильтр списка (ссылка из уведомления бухгалтеру), форму создания не открывает.
// В отличие от ?caseId= (кнопка «Выставить счёт» в карточке заявки). Строка поиска — номер заявки
// из любого счёта этой заявки; счетов по ней нет — пустая строка, то есть полный список.
export const caseFilterSearch = (
  rows: Pick<BrokerInvoice, 'caseId' | 'caseNumber'>[],
  caseId: unknown,
): string => {
  const id = Array.isArray(caseId) ? caseId[0] : caseId
  if (!id || typeof id !== 'string') return ''
  return rows.find((r) => r.caseId === id && r.caseNumber)?.caseNumber ?? ''
}

// Повторный клик по уведомлению, когда «Счета и акты» уже открыты: компонент тот же, меняется
// только ?case= — onMounted второй раз не сработает, поэтому реагируем на смену параметра.
export const watchCaseQuery = (
  getCase: () => unknown,
  onChange: (caseId: unknown) => void | Promise<void>,
): WatchStopHandle =>
  watch(getCase, (next, prev) => {
    if (next !== prev) void onChange(next)
  })

// Варианты чипа «Клиент» в «Счетах и актах» (30.10.2026, аудит S-3/C-32): клиенты из всех загруженных документов
// (не из отфильтрованных), по одному на id, по алфавиту.
export const clientFilterOptions = (
  rows: Pick<BrokerInvoice, 'clientId' | 'clientName'>[],
): { value: string; label: string }[] => {
  const seen = new Map<string, string>()
  for (const r of rows) if (r.clientId && !seen.has(r.clientId)) seen.set(r.clientId, r.clientName || r.clientId)
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}
