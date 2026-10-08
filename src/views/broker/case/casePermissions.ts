import type { Import40CaseDto } from '@/api/import40'

// Права карточки заявки сотрудника (редизайн, волна 4а) — чистые функции от (auth, заявка).
// Перенос проверок прежней Import40CaseView один к одному (разбор §2), плюс согласованные с сервером правки:
// - «Запрос таможни / проблема» доступен и по праву import40.problem (сервер его принимает);
// - администратор подтверждает оплату СВХ без чека (сервер разрешает);
// - черновик ведут сотрудники с import40.declarant или import40.assign (Task 1 на сервере).

/** Что нужно знать о пользователе — подходит и стор auth (поля распакованы Pinia). */
export interface CaseAuth {
  role: string | null
  businessRole: string | null
  businessRoles: string[]
  permissions: string[]
  userId: string | null
}

export type StepRole = 'kpp' | 'declarant'
export type RoleMode = 'admin' | 'client' | 'kpp' | 'declarant' | 'other'

/** Снять назначение — сервер понимает Guid.Empty. */
export const GUID_EMPTY = '00000000-0000-0000-0000-000000000000'

const PERM_FOR: Record<StepRole, string> = { kpp: 'import40.kpp', declarant: 'import40.declarant' }
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export const isAdmin = (a: CaseAuth): boolean => lower(a.role) === 'administrator'
/** Как auth.hasPermission: администратору — всегда. */
export const hasPerm = (a: CaseAuth, p: string): boolean => isAdmin(a) || a.permissions.includes(p)
/** Как auth.hasBusinessRole: любая из ролей пользователя или основная. */
export const hasBiz = (a: CaseAuth, r: string): boolean => a.businessRoles.includes(r) || a.businessRole === r

/** Прежний roleMode: по системной роли и основной бизнес-роли. */
export function roleModeOf(a: CaseAuth): RoleMode {
  const sys = lower(a.role)
  const biz = lower(a.businessRole)
  if (sys === 'administrator') return 'admin'
  if (sys === 'client' || biz === 'client') return 'client'
  if (biz === 'kpp') return 'kpp'
  if (biz === 'declarant' || biz === 'rop') return 'declarant'
  return 'other'
}

/**
 * Прежний can(role): администратор; совпадение roleMode; для КПП и декларанта — ещё бизнес-роль,
 * руководитель отдела (rop) или право из матрицы (import40.kpp / import40.declarant).
 * can('client') у сотрудника — только администратор.
 */
export function can(a: CaseAuth, role: StepRole | 'client'): boolean {
  const mode = roleModeOf(a)
  if (mode === 'admin' || mode === role) return true
  if (role === 'client') return false
  return hasBiz(a, role) || hasBiz(a, 'rop') || hasPerm(a, PERM_FOR[role])
}

/** Назначать исполнителей, шаг назад, отмена, обход «занято коллегой» — администратор или import40.assign. */
export const canAssign = (a: CaseAuth): boolean => hasPerm(a, 'import40.assign')

/** Право именно на роль шага, без «руководитель может всё» (для «Взять в работу»). */
export const hasStepPermission = (a: CaseAuth, role: StepRole): boolean => hasBiz(a, role) || hasPerm(a, PERM_FOR[role])

export const assignedIdOf = (c: Import40CaseDto, role: StepRole): string | null =>
  (role === 'kpp' ? c.assignedKppId : c.assignedDeclarantId) || null
export const assignedNameOf = (c: Import40CaseDto, role: StepRole): string | null =>
  (role === 'kpp' ? c.assignedKppName : c.assignedDeclarantName) || null

/** «Взять в работу»: не руководителю (у него назначение), есть право на роль шага, исполнитель не назначен. */
export const claimVisible = (a: CaseAuth, c: Import40CaseDto, role: StepRole): boolean =>
  !canAssign(a) && hasStepPermission(a, role) && !assignedIdOf(c, role)

/** Шаг ведёт другой сотрудник: имя (null — имени нет, «назначен»). Руководитель не блокируется. */
export function stepBlockedBy(a: CaseAuth, c: Import40CaseDto, role: StepRole): { name: string | null } | null {
  if (canAssign(a)) return null
  const id = assignedIdOf(c, role)
  if (!id || id === a.userId) return null
  return { name: assignedNameOf(c, role) }
}

/** Кнопка действия шага выключена: нет права на роль или шаг ведёт коллега. */
export const actionDisabled = (a: CaseAuth, c: Import40CaseDto, role: StepRole): boolean =>
  !can(a, role) || !!stepBlockedBy(a, c, role)

/** Почему действие недоступно: «Заявку ведёт …» или «Действие выполняет …»; null — доступно. */
export type ActionHint = { kind: 'busy'; name: string | null } | { kind: 'role'; role: StepRole | 'client' } | null
export function actionHint(a: CaseAuth, c: Import40CaseDto, role: StepRole | 'client'): ActionHint {
  if (role !== 'client') {
    const b = stepBlockedBy(a, c, role)
    if (b) return { kind: 'busy', name: b.name }
  }
  return can(a, role) ? null : { kind: 'role', role }
}
/** Текст подсказки (прежние import40Case.busyBy / hintFor). */
export function hintText(h: ActionHint, t: (k: string, p?: Record<string, unknown>) => string): string {
  if (!h) return ''
  if (h.kind === 'busy') return t('import40Case.busyBy', { name: h.name || t('import40Case.staffAssigned') })
  return t('import40Case.hintFor', { role: t(`enum.role.${h.role}`) })
}

/** «Запрос таможни / проблема» и «Снять проблему»: КПП, декларант или право import40.problem (как сервер). */
export const canProblem = (a: CaseAuth): boolean => can(a, 'kpp') || can(a, 'declarant') || hasPerm(a, 'import40.problem')
/** Пункт «Запрос таможни / проблема» в меню: заявка не в проблеме и не завершена/отменена. */
export const showProblemAction = (a: CaseAuth, c: Import40CaseDto): boolean => canProblem(a) && !c.isProblem && c.status < 8
/** Шаг назад: статус 1..7, администратор или import40.assign. */
export const canStepBack = (a: CaseAuth, c: Import40CaseDto): boolean => c.status > 0 && c.status < 8 && canAssign(a)
/** Отмена: незавершённая заявка, администратор или import40.assign. */
export const canCancel = (a: CaseAuth, c: Import40CaseDto): boolean => c.status < 8 && canAssign(a)
/** «Счета и акты»: finance.read или администратор. */
export const canSeeBilling = (a: CaseAuth): boolean => hasPerm(a, 'finance.read')
/** Выставить счёт AQNIET (переход в «Счета»): finance.write или администратор. */
export const canIssueAqnietInvoice = (a: CaseAuth): boolean => hasPerm(a, 'finance.write')
/** «Завершить без счёта AQNIET» — только администратор (сервер так же). */
export const canCompleteWithoutInvoice = (a: CaseAuth): boolean => isAdmin(a)
/** Подтвердить оплату СВХ без чека может только администратор (сервер требует чек у остальных). */
export const canConfirmSvhWithoutCheck = (a: CaseAuth): boolean => isAdmin(a)
/** Вести черновик за клиента (правка, документы, отправка): статус 0, import40.declarant или import40.assign. */
export const canManageDraft = (a: CaseAuth, c: Import40CaseDto): boolean =>
  c.status === 0 && (hasPerm(a, 'import40.declarant') || hasPerm(a, 'import40.assign'))
/** Сводку готовности ДТ грузим, как раньше: всем, кроме roleMode client/other. */
export const readinessAvailable = (a: CaseAuth): boolean => {
  const m = roleModeOf(a)
  return m !== 'client' && m !== 'other'
}
/** Ссылка на карточку клиента — по праву clients.read. */
export const canOpenClient = (a: CaseAuth): boolean => hasPerm(a, 'clients.read')

/** Чья роль ведёт текущий статус: КПП — 1, 4, 5, 6; декларант — 2, 3; иначе никто (как claim на сервере). */
export const stepRoleOf = (status: number): StepRole | null =>
  [1, 4, 5, 6].includes(status) ? 'kpp' : status === 2 || status === 3 ? 'declarant' : null

/** «в работе у меня» / «занято коллегой» — по исполнителю роли текущего статуса. */
export function assignedTag(a: CaseAuth, c: Import40CaseDto): 'me' | 'other' | null {
  const role = stepRoleOf(c.status)
  if (!role || !a.userId) return null
  const id = assignedIdOf(c, role)
  if (!id) return null
  return id === a.userId ? 'me' : 'other'
}

/** Всё о правах на одну заявку — объект для шаблонов и шагов (контракт шагов, caseContext.ts). */
export interface CasePerms {
  userId: string | null
  isAdmin: boolean
  roleMode: RoleMode
  can: (role: StepRole | 'client') => boolean
  canAssign: boolean
  claimVisible: (role: StepRole) => boolean
  stepBlockedBy: (role: StepRole) => { name: string | null } | null
  actionDisabled: (role: StepRole) => boolean
  actionHint: (role: StepRole | 'client') => ActionHint
  canProblem: boolean
  showProblemAction: boolean
  canStepBack: boolean
  canCancel: boolean
  canSeeBilling: boolean
  canIssueAqnietInvoice: boolean
  canCompleteWithoutInvoice: boolean
  canConfirmSvhWithoutCheck: boolean
  canManageDraft: boolean
  readinessAvailable: boolean
  canOpenClient: boolean
  stepRole: StepRole | null
  assignedTag: 'me' | 'other' | null
}

export function casePerms(a: CaseAuth, c: Import40CaseDto): CasePerms {
  return {
    userId: a.userId,
    isAdmin: isAdmin(a),
    roleMode: roleModeOf(a),
    can: (role) => can(a, role),
    canAssign: canAssign(a),
    claimVisible: (role) => claimVisible(a, c, role),
    stepBlockedBy: (role) => stepBlockedBy(a, c, role),
    actionDisabled: (role) => actionDisabled(a, c, role),
    actionHint: (role) => actionHint(a, c, role),
    canProblem: canProblem(a),
    showProblemAction: showProblemAction(a, c),
    canStepBack: canStepBack(a, c),
    canCancel: canCancel(a, c),
    canSeeBilling: canSeeBilling(a),
    canIssueAqnietInvoice: canIssueAqnietInvoice(a),
    canCompleteWithoutInvoice: canCompleteWithoutInvoice(a),
    canConfirmSvhWithoutCheck: canConfirmSvhWithoutCheck(a),
    canManageDraft: canManageDraft(a, c),
    readinessAvailable: readinessAvailable(a),
    canOpenClient: canOpenClient(a),
    stepRole: stepRoleOf(c.status),
    assignedTag: assignedTag(a, c),
  }
}
