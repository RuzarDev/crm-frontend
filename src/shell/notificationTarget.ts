import type { AppNotification } from '@/types/api'
import { kedenNotificationDtPath } from '@/utils/kedenLink'

// Чек об оплате по счёту AQNIET (редизайн, волна 2b): уведомление получают бухгалтерия и админы —
// всегда в «Счета и акты», а не в карточку заявки, даже если у получателя есть доступ к заявкам.
export const INVOICE_CHECK_UPLOADED = 'InvoiceCheckUploaded'
// Новая редакция ЕТТ из PDF ЕЭК (применена или ждёт подтверждения): без заявки и записи реестра — ведёт
// на «Справочники → ТН ВЭД → Обновления ЕЭК». Сервер шлёт n.Type.ToString() («EecTariffUpdate»), сравниваем без регистра.
export const EEC_TARIFF_UPDATE = 'EecTariffUpdate'
export const EEC_UPDATES_PATH = '/tnved/eec'

// Куда ведёт клик по уведомлению. Финансист (только finance.read) не пускается в карточку заявки
// (guard уводит его на /finance), поэтому по заявке ему открываем список «Счета и акты», отфильтрованный
// по ней: /billing?case=… — только фильтр (в отличие от ?caseId=, который открывает форму создания счёта).
// hasPermission (если передан): экран «Обновления ЕЭК» — по праву tnved.manage; без права (РОП получает уведомление,
// но экран ему закрыт) клик только отмечает прочитанным, а не уводит guard'ом на главную.
export function notificationTarget(
  n: Pick<AppNotification, 'caseId' | 'reestrEntryId'> & Partial<Pick<AppNotification, 'type' | 'declarationId'>>,
  isFinanceOnly: boolean,
  hasPermission?: (p: string) => boolean,
): string | null {
  if (n.type && n.type.toLowerCase() === EEC_TARIFF_UPDATE.toLowerCase()) {
    return !isFinanceOnly && (!hasPermission || hasPermission('tnved.manage')) ? EEC_UPDATES_PATH : null
  }
  if (n.type === INVOICE_CHECK_UPLOADED) {
    return n.caseId ? `/billing?case=${encodeURIComponent(n.caseId)}` : '/billing'
  }
  // Статус КЕДЕН по ДТ (17.10) — сразу страница этой ДТ (финансисту — как прочие уведомления по заявке).
  const dtPath = isFinanceOnly ? null : kedenNotificationDtPath(n)
  if (dtPath) return dtPath
  if (n.caseId) {
    const id = encodeURIComponent(n.caseId)
    return isFinanceOnly ? `/billing?case=${id}` : `/import-40/${id}`
  }
  if (n.reestrEntryId) return '/reestr'
  return null
}
