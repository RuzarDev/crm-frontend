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
