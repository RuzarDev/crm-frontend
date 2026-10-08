import type { AppNotification } from '@/types/api'

// Куда ведёт клик по уведомлению. Финансист (только finance.read) не пускается в карточку заявки
// (guard уводит его на /finance), поэтому по заявке ему открываем список «Счета и акты», отфильтрованный
// по ней: /billing?case=… — только фильтр (в отличие от ?caseId=, который открывает форму создания счёта).
export function notificationTarget(
  n: Pick<AppNotification, 'caseId' | 'reestrEntryId'>,
  isFinanceOnly: boolean,
): string | null {
  if (n.caseId) {
    const id = encodeURIComponent(n.caseId)
    return isFinanceOnly ? `/billing?case=${id}` : `/import-40/${id}`
  }
  if (n.reestrEntryId) return '/reestr'
  return null
}
