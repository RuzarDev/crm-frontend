import type { AppNotification } from '@/types/api'

// Куда ведёт клик по уведомлению. Финансист (только finance.read) не пускается в карточку заявки
// (guard уводит его на /finance), поэтому по заявке ему открываем «Счета и акты», отфильтрованные по ней.
export function notificationTarget(
  n: Pick<AppNotification, 'caseId' | 'reestrEntryId'>,
  isFinanceOnly: boolean,
): string | null {
  if (n.caseId) return isFinanceOnly ? `/billing?caseId=${encodeURIComponent(n.caseId)}` : `/import-40/${n.caseId}`
  if (n.reestrEntryId) return '/reestr'
  return null
}
