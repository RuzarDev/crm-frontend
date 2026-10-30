import type { AppNotification } from '@/types/api'
import { kedenNotificationDtPath } from '@/utils/kedenLink'

// Чек об оплате по счёту AQNIET (редизайн, волна 2b): уведомление получают бухгалтерия и админы —
// всегда в «Счета и акты», а не в карточку заявки, даже если у получателя есть доступ к заявкам.
export const INVOICE_CHECK_UPLOADED = 'InvoiceCheckUploaded'
// Новая редакция ЕТТ из PDF ЕЭК (применена или ждёт подтверждения): без заявки и записи реестра — ведёт
// на «Справочники → ТН ВЭД → Обновления ЕЭК». Сервер шлёт n.Type.ToString() («EecTariffUpdate»), сравниваем без регистра.
export const EEC_TARIFF_UPDATE = 'EecTariffUpdate'
export const EEC_UPDATES_PATH = '/tnved/eec'
// Договор и доверенность клиента (30.10.2026, аудит C-3): клиенту — «Моя компания», сотруднику — «Документы клиентов».
export const CLIENT_DOCUMENT = 'ClientDocument'
// Саморегистрация клиента (30.10.2026, аудит S-52): ведёт в карточку нового клиента.
export const CLIENT_REGISTERED = 'ClientRegistered'

// Куда ведёт клик по уведомлению. Финансист (только finance.read) не пускается в карточку заявки
// (guard уводит его на /finance), поэтому по заявке ему открываем список «Счета и акты», отфильтрованный
// по ней: /billing?case=… — только фильтр (в отличие от ?caseId=, который открывает форму создания счёта).
// hasPermission (если передан): экран «Обновления ЕЭК» — по праву tnved.manage; без права (РОП получает уведомление,
// но экран ему закрыт) клик только отмечает прочитанным, а не уводит guard'ом на главную.
export function notificationTarget(
  n: Pick<AppNotification, 'caseId' | 'reestrEntryId'> & Partial<Pick<AppNotification, 'type' | 'declarationId' | 'foreignContractId' | 'clientId'>>,
  isFinanceOnly: boolean,
  hasPermission?: (p: string) => boolean,
  isClient?: boolean,
): string | null {
  const canClients = !isFinanceOnly && (!hasPermission || hasPermission('clients.read'))
  // Сотруднику — вкладка «Документы» карточки этого клиента (30.10.2026, аудит S-1/S-52); старые уведомления без
  // clientId — «Документы клиентов».
  if (n.type === CLIENT_DOCUMENT) {
    if (isClient) return '/import-40/company'
    if (!canClients) return null
    return n.clientId ? `/clients/${encodeURIComponent(n.clientId)}?tab=docs` : '/client-documents'
  }
  // Новый клиент: карточка клиента; старые уведомления без clientId — список клиентов.
  if (n.type === CLIENT_REGISTERED) {
    if (!canClients) return null
    return n.clientId ? `/clients/${encodeURIComponent(n.clientId)}` : '/clients'
  }
  if (n.type && n.type.toLowerCase() === EEC_TARIFF_UPDATE.toLowerCase()) {
    return !isFinanceOnly && (!hasPermission || hasPermission('tnved.manage')) ? EEC_UPDATES_PATH : null
  }
  // Срок внешнеторгового контракта (17.10): получает только клиент — его карточка контракта.
  if (n.foreignContractId) return `/contracts/${encodeURIComponent(n.foreignContractId)}`
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
  // Запись реестра — её страница (30.10.2026, аудит S-53/C-23), а не общий список.
  if (n.reestrEntryId) return isFinanceOnly ? null : `/reestr/${encodeURIComponent(n.reestrEntryId)}`
  return null
}
