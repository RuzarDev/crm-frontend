import type { AppNotification } from '@/types/api'

// Чек об оплате по счёту AQNIET (редизайн, волна 2b): уведомление получают бухгалтерия и админы —
// всегда в «Счета и акты», а не в карточку заявки, даже если у получателя есть доступ к заявкам.
export const INVOICE_CHECK_UPLOADED = 'InvoiceCheckUploaded'

// Куда ведёт клик по уведомлению. Финансист (только finance.read) не пускается в карточку заявки
// (guard уводит его на /finance), поэтому по заявке ему открываем список «Счета и акты», отфильтрованный
// по ней: /billing?case=… — только фильтр (в отличие от ?caseId=, который открывает форму создания счёта).
export function notificationTarget(
  n: Pick<AppNotification, 'caseId' | 'reestrEntryId'> & Partial<Pick<AppNotification, 'type'>>,
  isFinanceOnly: boolean,
): string | null {
  if (n.type === INVOICE_CHECK_UPLOADED) {
    return n.caseId ? `/billing?case=${encodeURIComponent(n.caseId)}` : '/billing'
  }
  if (n.caseId) {
    const id = encodeURIComponent(n.caseId)
    return isFinanceOnly ? `/billing?case=${id}` : `/import-40/${id}`
  }
  if (n.reestrEntryId) return '/reestr'
  return null
}
