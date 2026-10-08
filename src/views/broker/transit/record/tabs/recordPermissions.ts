import { useAuthStore } from '@/stores/auth'
import { ReestrEntryStatus, type ReestrDocumentDto, type ReestrCommentDto } from '@/types/api'

// Права вкладок записи транзита (редизайн, волна 4б) — чистые функции от (auth, запись). Правила прежних панелей
// (ReestrDocumentsPanel, ReestrCommentsPanel, ReestrForm) один к одному, разбор §4, §6, §9; сервер зеркалит их
// (Features/Reestr/ReestrDocuments.cs, ReestrComments.cs, ApplyExtraction.cs).
// useRecordPermissions() привязывает их к стору auth: функции читают стор при вызове — внутри computed/шаблона
// реактивно (права приходят в JWT, при смене роли страница обновится).

/** Что нужно знать о пользователе — подходит и стор auth (поля распакованы Pinia). */
export interface RecordAuth {
  role: string | null
  permissions: string[]
  userId: string | null
}

type Doc = Pick<ReestrDocumentDto, 'section' | 'uploadedByUserId'>
type Comment = Pick<ReestrCommentDto, 'authorId'>

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const isAdmin = (a: RecordAuth) => lower(a.role) === 'administrator'
/** Как auth.hasPermission: администратору — всегда. */
const hasPerm = (a: RecordAuth, p: string) => isAdmin(a) || a.permissions.includes(p)
const isClient = (a: RecordAuth) => lower(a.role) === 'client'
const isExpeditor = (a: RecordAuth) => lower(a.role) === 'expeditor'

/** «Выпущен» и «Архив»: брокерская секция документов закрыта (сервер: 409 Documents.Closed). */
export const isBrokerSectionClosed = (status: ReestrEntryStatus | null | undefined): boolean =>
  status === ReestrEntryStatus.Released || status === ReestrEntryStatus.Archived

/** Править «Данные»: право reestr.write и роль не клиент. */
export const canEditData = (a: RecordAuth): boolean => hasPerm(a, 'reestr.write') && !isClient(a)

/** Клиентская секция документов: клиент, экспедитор и администратор — всегда (readonly касается только полей данных). */
export const canUploadClientDoc = (a: RecordAuth): boolean => isClient(a) || isExpeditor(a) || isAdmin(a)

/**
 * Брокерская секция: право reestr.write (а не системная роль broker — МПП с ролью importer тоже грузит),
 * не клиент и не экспедитор, секция не закрыта статусом.
 */
export const canUploadBrokerDoc = (a: RecordAuth, status: ReestrEntryStatus): boolean =>
  !isBrokerSectionClosed(status) && !isClient(a) && !isExpeditor(a) && hasPerm(a, 'reestr.write')

/**
 * Удаление: нужно reestr.write; клиент и экспедитор — никогда; брокерский документ закрытой секции — никто;
 * администратор — любой, остальные сотрудники — только свои брокерские (uploadedByUserId = userId).
 */
export const canDeleteDoc = (a: RecordAuth, doc: Doc, status: ReestrEntryStatus): boolean => {
  if (!hasPerm(a, 'reestr.write')) return false
  if (isClient(a)) return false
  if (doc.section === 'broker' && isBrokerSectionClosed(status)) return false
  if (isAdmin(a)) return true
  if (isExpeditor(a)) return false
  return doc.section === 'broker' && !!a.userId && doc.uploadedByUserId === a.userId
}

/** История статусов скрыта клиенту. */
export const canSeeHistory = (a: RecordAuth): boolean => !isClient(a)

/** Комментарии: клиенту — только чтение, как в прежнем окне («клиентский вид»); остальные пишут. */
export const canPostComment = (a: RecordAuth): boolean => !isClient(a)

/** Удалить комментарий: администратор или автор (сервер зеркалит); тем, кто только читает, — нет. */
export const canDeleteComment = (a: RecordAuth, c: Comment): boolean => {
  if (!canPostComment(a)) return false
  return isAdmin(a) || (!!a.userId && c.authorId === a.userId)
}

/**
 * «Заполнить из инвойса» видна, если выполнены оба требования сервера: загрузка в клиентскую секцию
 * (клиент, экспедитор, администратор — иначе 403 Documents.Forbidden) и применение (reestr.write).
 */
export const canSeeAutofill = (a: RecordAuth): boolean => hasPerm(a, 'reestr.write') && canUploadClientDoc(a)

/** Активна без несохранённых правок на «Данных»: применение перечитывает запись и затёрло бы их. */
export const canAutofill = (a: RecordAuth, dirty: boolean): boolean => canSeeAutofill(a) && !dirty

/** Те же правила, привязанные к стору auth. */
export function useRecordPermissions() {
  const auth = useAuthStore()
  const a = (): RecordAuth => ({ role: auth.role, permissions: auth.permissions, userId: auth.userId })
  return {
    canEditData: () => canEditData(a()),
    canUploadClientDoc: () => canUploadClientDoc(a()),
    canUploadBrokerDoc: (status: ReestrEntryStatus) => canUploadBrokerDoc(a(), status),
    canDeleteDoc: (doc: Doc, status: ReestrEntryStatus) => canDeleteDoc(a(), doc, status),
    canDeleteComment: (c: Comment) => canDeleteComment(a(), c),
    canPostComment: () => canPostComment(a()),
    canSeeHistory: () => canSeeHistory(a()),
    canSeeAutofill: () => canSeeAutofill(a()),
    canAutofill: (dirty: boolean) => canAutofill(a(), dirty),
  }
}

export type RecordPermissions = ReturnType<typeof useRecordPermissions>
