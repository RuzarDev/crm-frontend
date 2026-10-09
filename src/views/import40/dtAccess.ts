// Доступ к редактору ДТ (Импорт 40). Чистые функции — зеркало серверных гейтов
// Import40Endpoints.CanManageDeclarations + CanEditCaseData (PUT /import40/{caseId}/declarations/{id}).
//
// (баг R1–R3, 09.10) Раньше фронт считал по основной бизнес-роли (businessRole): КПП/бухгалтер/продажи
// при статусе < 2 видели редактируемую форму (сервер отвечал 403, автосейв крутился без конца),
// а мультироль [kpp, declarant] с основной kpp со статуса 2 попадала в просмотр, хотя сервер пускает.

/** Статус заявки «Декларирование» (Import40Status.Declaring). */
export const DECLARING_STATUS = 2

export interface DtAccessUser {
  /** Системная роль administrator. */
  isAdmin: boolean
  /** Клиент (системная или бизнес-роль client) — всегда только просмотр. */
  isClient: boolean
  /** Право import40.declarant (из JWT; учитывает все роли сотрудника). */
  canDeclare: boolean
  userId: string | null
}

export interface DtAccessCase {
  status: number
  assignedDeclarantId?: string | null
}

/** CanManageDeclarations: админ или право import40.declarant. Им же сервер отдаёт keden-readiness, keden-xml, ДТС. */
export const canManageDeclarations = (u: DtAccessUser): boolean => u.isAdmin || (!u.isClient && u.canDeclare)

/**
 * Можно ли править ДТ: admin || (import40.declarant && (status < Declaring || никто не назначен || назначен я)).
 * Заявка ещё не загружена — решаем только по праву (без id формы сохранение всё равно не уходит).
 */
export function canEditDt(u: DtAccessUser, c: DtAccessCase | null | undefined): boolean {
  if (u.isAdmin) return true
  if (!canManageDeclarations(u)) return false
  if (!c) return true
  if (c.status < DECLARING_STATUS) return true
  return !c.assignedDeclarantId || (u.userId != null && c.assignedDeclarantId === u.userId)
}

export const isDtReadOnly = (u: DtAccessUser, c: DtAccessCase | null | undefined): boolean => !canEditDt(u, c)

/**
 * Сохранение перед действием (печать бланка, XML, ДТС): в просмотре сохранять нечего и нельзя —
 * сервер ответит 403 и действие не выполнится (баг B2). Тогда сразу «можно продолжать».
 */
export async function saveBeforeAction(readOnly: boolean, save: () => Promise<boolean>): Promise<boolean> {
  if (readOnly) return true
  return save()
}
