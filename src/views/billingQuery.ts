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
