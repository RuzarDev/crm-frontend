import { describe, expect, it } from 'vitest'
import {
  actionDisabled, actionHint, assignedTag, can, canAssign, canAssignTeam, canCancel, canCompleteWithoutInvoice, canConfirmSvhWithoutCheck, canDeleteCaseDt, canEditCaseDt, dtDeleteBlockedByRelease, dtEditHint,
  canIssueAqnietInvoice, canManageDraft, canOpenClient, canProblem, canSeeBilling, canStepBack, casePerms, claimVisible, hintText,
  readinessAvailable, roleModeOf, showProblemAction, stepBlockedBy, stepRoleOf,
} from '../casePermissions'
import { USERS, caseDto } from './caseFixture'

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}${JSON.stringify(p)}` : k)
const other = caseDto({ status: 2, assignedDeclarantId: 'u2', assignedDeclarantName: 'Айгерим К.', assignedKppId: 'u3', assignedKppName: 'Ерлан Б.' })
const mine = caseDto({ status: 2, assignedDeclarantId: 'me', assignedDeclarantName: 'Я' })
const free = caseDto({ status: 2 })

describe('casePermissions: роли', () => {
  it('roleMode — как раньше: система → администратор, основная бизнес-роль, rop → декларант', () => {
    expect(roleModeOf(USERS.admin)).toBe('admin')
    expect(roleModeOf(USERS.declarant)).toBe('declarant')
    expect(roleModeOf(USERS.kpp)).toBe('kpp')
    expect(roleModeOf(USERS.rop)).toBe('declarant')
    expect(roleModeOf(USERS.accountant)).toBe('other')
    expect(roleModeOf({ ...USERS.admin, role: 'Client' })).toBe('client')
  })

  it('администратор: всё, без «Взять в работу» и без блокировки коллегой', () => {
    const a = USERS.admin
    expect([can(a, 'kpp'), can(a, 'declarant'), can(a, 'client')]).toEqual([true, true, true])
    expect(canAssign(a)).toBe(true)
    expect(claimVisible(a, free, 'declarant')).toBe(false)
    expect(stepBlockedBy(a, other, 'declarant')).toBeNull()
    expect(actionDisabled(a, other, 'declarant')).toBe(false)
    expect(showProblemAction(a, free)).toBe(true)
    expect(canStepBack(a, free)).toBe(true)
    expect(canCancel(a, free)).toBe(true)
    expect([canSeeBilling(a), canIssueAqnietInvoice(a), canCompleteWithoutInvoice(a), canConfirmSvhWithoutCheck(a)]).toEqual([true, true, true, true])
    expect(canManageDraft(a, caseDto({ status: 0 }))).toBe(true)
    expect(readinessAvailable(a)).toBe(true)
    expect(canOpenClient(a)).toBe(true)
  })

  it('декларант: шаги декларанта и КПП (право import40.kpp), «Взять в работу» на свободной, без назначения/отмены/финансов', () => {
    const a = USERS.declarant
    expect([can(a, 'declarant'), can(a, 'kpp'), can(a, 'client')]).toEqual([true, true, false])
    expect(canAssign(a)).toBe(false)
    expect(claimVisible(a, free, 'declarant')).toBe(true)
    expect(claimVisible(a, mine, 'declarant')).toBe(false)
    // S-12 (30.10.2026): право import40.kpp у декларанта есть, но «Взять в работу» в строке КПП — только роли КПП.
    expect(claimVisible(a, caseDto({ status: 1 }), 'kpp')).toBe(false)
    expect(can(a, 'kpp')).toBe(true) // допуск к действию не изменился
    expect(stepBlockedBy(a, mine, 'declarant')).toBeNull()
    expect(stepBlockedBy(a, other, 'declarant')).toEqual({ name: 'Айгерим К.' })
    expect(actionDisabled(a, other, 'declarant')).toBe(true)
    expect(actionDisabled(a, mine, 'declarant')).toBe(false)
    expect(actionHint(a, other, 'declarant')).toEqual({ kind: 'busy', name: 'Айгерим К.' })
    expect(actionHint(a, mine, 'declarant')).toBeNull()
    expect(showProblemAction(a, free)).toBe(true)
    expect([canStepBack(a, free), canCancel(a, free), canSeeBilling(a), canIssueAqnietInvoice(a)]).toEqual([false, false, false, false])
    expect(canStepBack(a, caseDto({ status: 8 }))).toBe(false)
    expect(casePerms(a, free).canUnmarkPaid).toBe(false)
    expect(canManageDraft(a, caseDto({ status: 0 }))).toBe(true)
    expect(canManageDraft(a, caseDto({ status: 1 }))).toBe(false)
    expect(readinessAvailable(a)).toBe(true)
    expect(canOpenClient(a)).toBe(false)
  })

  it('КПП: свои шаги, декларанта — нет (подсказка «Действие выполняет декларант»), счета видит', () => {
    const a = USERS.kpp
    expect([can(a, 'kpp'), can(a, 'declarant')]).toEqual([true, false])
    expect(actionHint(a, free, 'declarant')).toEqual({ kind: 'role', role: 'declarant' })
    expect(actionDisabled(a, free, 'declarant')).toBe(true)
    expect(claimVisible(a, caseDto({ status: 1 }), 'kpp')).toBe(true)
    expect(claimVisible(a, free, 'declarant')).toBe(false)
    expect(canSeeBilling(a)).toBe(true)
    expect(canIssueAqnietInvoice(a)).toBe(false)
    expect(canManageDraft(a, caseDto({ status: 0 }))).toBe(false)
    expect(canConfirmSvhWithoutCheck(a)).toBe(false)
    expect(readinessAvailable(a)).toBe(true)
  })

  it('руководитель (rop): назначает, шаг назад, отмена; коллега его не блокирует; «Взять в работу» не нужен', () => {
    const a = USERS.rop
    expect([can(a, 'kpp'), can(a, 'declarant')]).toEqual([true, true])
    expect(canAssign(a)).toBe(true)
    expect(claimVisible(a, free, 'declarant')).toBe(false)
    expect(stepBlockedBy(a, other, 'kpp')).toBeNull()
    expect([canStepBack(a, free), canCancel(a, free)]).toEqual([true, true])
    // S-27: выполненную — тоже (шаг назад), отменённую — нет; снять отметку оплаты — может.
    expect(canStepBack(a, caseDto({ status: 8 }))).toBe(true)
    expect(canStepBack(a, caseDto({ status: 9 }))).toBe(false)
    expect(casePerms(a, free).canUnmarkPaid).toBe(true)
    expect(canCompleteWithoutInvoice(a)).toBe(false)
    // M-6 ревью: РОП с ролью декларанта (Ирина) видит «Взять в работу» в строке декларанта, но не КПП.
    const irina = { ...a, businessRoles: ['rop', 'declarant'] }
    expect(claimVisible(irina, free, 'declarant')).toBe(true)
    expect(claimVisible(irina, caseDto({ status: 1 }), 'kpp')).toBe(false)
    expect(canManageDraft(a, caseDto({ status: 0 }))).toBe(true)
  })

  it('бухгалтер: ни КПП, ни декларанта, без проблемы и готовности; счёт AQNIET — может', () => {
    const a = USERS.accountant
    expect([can(a, 'kpp'), can(a, 'declarant')]).toEqual([false, false])
    expect(canProblem(a)).toBe(false)
    expect(showProblemAction(a, free)).toBe(false)
    expect(readinessAvailable(a)).toBe(false)
    expect([canSeeBilling(a), canIssueAqnietInvoice(a)]).toEqual([true, true])
    expect(claimVisible(a, free, 'declarant')).toBe(false)
  })

  it('право import40.problem — «проблема» доступна и без роли КПП/декларанта (как сервер)', () => {
    const a = USERS.problemOnly
    expect([can(a, 'kpp'), can(a, 'declarant')]).toEqual([false, false])
    expect(canProblem(a)).toBe(true)
    expect(showProblemAction(a, free)).toBe(true)
    expect(showProblemAction(a, caseDto({ isProblem: true }))).toBe(false)
    expect(showProblemAction(a, caseDto({ status: 8 }))).toBe(false)
    expect(showProblemAction(a, caseDto({ status: 9 }))).toBe(false)
  })
})

describe('casePermissions: статусы', () => {
  // S-27 (30.10.2026): шаг назад и с «Выполнено» (руководитель возвращает выполненную заявку).
  it('шаг назад — 2..8 (с границы нельзя, S-29); отмена — до выполнения', () => {
    const a = USERS.admin
    expect([0, 1, 2, 7, 8, 9].map((status) => canStepBack(a, caseDto({ status })))).toEqual([false, false, true, true, true, false])
    expect([0, 7, 8, 9].map((status) => canCancel(a, caseDto({ status })))).toEqual([true, true, false, false])
  })

  it('роль текущего статуса и «в работе у меня / занято коллегой»', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stepRoleOf)).toEqual([null, 'kpp', 'declarant', 'declarant', 'kpp', 'kpp', 'kpp', null, null, null])
    expect(assignedTag(USERS.declarant, mine)).toBe('me')
    expect(assignedTag(USERS.declarant, other)).toBe('other')
    expect(assignedTag(USERS.declarant, free)).toBeNull()
    expect(assignedTag(USERS.kpp, caseDto({ status: 4, assignedKppId: 'u3' }))).toBe('other')
  })

  it('hintText — прежние тексты import40Case.busyBy / hintFor', () => {
    expect(hintText({ kind: 'busy', name: 'Айгерим К.' }, t)).toBe('import40Case.busyBy{"name":"Айгерим К."}')
    expect(hintText({ kind: 'busy', name: null }, t)).toBe('import40Case.busyBy{"name":"import40Case.staffAssigned"}')
    expect(hintText({ kind: 'role', role: 'kpp' }, t)).toBe('import40Case.hintFor{"role":"enum.role.kpp"}')
    expect(hintText(null, t)).toBe('')
  })

  it('canAssignTeam: администратор, import40.assign и РОП (даже без права в матрице); декларант и прочие — нет', () => {
    expect(canAssignTeam(USERS.admin)).toBe(true)
    expect(canAssignTeam(USERS.rop)).toBe(true)
    expect(canAssignTeam({ ...USERS.rop, permissions: ['import40.read'] })).toBe(true)
    expect(canAssignTeam({ ...USERS.declarant, permissions: [...USERS.declarant.permissions, 'import40.assign'] })).toBe(true)
    expect(canAssignTeam(USERS.declarant)).toBe(false)
    expect(canAssignTeam(USERS.kpp)).toBe(false)
    expect(canAssignTeam(USERS.accountant)).toBe(false)
    // остальные действия руководителя (шаг назад, отмена) по-прежнему по import40.assign
    expect(canAssign({ ...USERS.rop, permissions: ['import40.read'] })).toBe(false)
  })

  it('casePerms собирает всё для заявки', () => {
    const p = casePerms(USERS.declarant, other)
    expect(p.stepRole).toBe('declarant')
    expect(p.assignedTag).toBe('other')
    expect(p.actionDisabled('declarant')).toBe(true)
    expect(p.stepBlockedBy('declarant')).toEqual({ name: 'Айгерим К.' })
    expect(p.canAssign).toBe(false)
    expect(p.canAssignTeam).toBe(false)
    expect(p.userId).toBe('me')
  })
})

describe('canEditCaseDt / dtEditHint — правка ДТ из карточки как на странице ДТ и сервере (решения 09.10)', () => {
  const k = (status: number, assignedDeclarantId: string | null, assignedDeclarantName: string | null = null) =>
    caseDto({ status, assignedDeclarantId, assignedDeclarantName })

  it('РОП и админ — любая ДТ при любом статусе и назначении', () => {
    for (const s of [0, 2, 4, 8, 9]) {
      expect(canEditCaseDt(USERS.rop, k(s, 'other'))).toBe(true)
      expect(canEditCaseDt(USERS.admin, k(s, 'other'))).toBe(true)
    }
  })

  it('РОП второй ролью и без права import40.declarant в матрице — тоже правит', () => {
    const kppRop = { ...USERS.kpp, businessRoles: ['kpp', 'rop'] }
    expect(canEditCaseDt(kppRop, k(4, 'other'))).toBe(true)
  })

  it('декларант: назначен я или никто — правит и после выпуска; назначен другой — нет, подсказка с именем', () => {
    expect(canEditCaseDt(USERS.declarant, k(8, 'me'))).toBe(true)
    expect(canEditCaseDt(USERS.declarant, k(9, null))).toBe(true)
    expect(canEditCaseDt(USERS.declarant, k(4, 'other'))).toBe(false)
    expect(dtEditHint(USERS.declarant, k(4, 'other', 'Асель'))).toEqual({ kind: 'busy', name: 'Асель' })
  })

  it('без права декларанта — нет, подсказка «выполняет декларант»', () => {
    expect(canEditCaseDt(USERS.kpp, k(2, null))).toBe(false)
    expect(dtEditHint(USERS.accountant, k(2, null))).toEqual({ kind: 'role', role: 'declarant' })
    expect(dtEditHint(USERS.declarant, k(2, null))).toBeNull()
  })
})

describe('canDeleteCaseDt — с выпуска ДТ удаляет только администратор (решение 09.10)', () => {
  it('до выпуска — кто может править; с выпуска — только админ', () => {
    expect(canDeleteCaseDt(USERS.rop, caseDto({ status: 3, assignedDeclarantId: 'other' }))).toBe(true)
    expect(canDeleteCaseDt(USERS.declarant, caseDto({ status: 2, assignedDeclarantId: 'me' }))).toBe(true)
    for (const status of [4, 8, 9]) {
      expect(canDeleteCaseDt(USERS.admin, caseDto({ status }))).toBe(true)
      expect(canDeleteCaseDt(USERS.rop, caseDto({ status }))).toBe(false)
      expect(dtDeleteBlockedByRelease(USERS.rop, caseDto({ status }))).toBe(true)
      expect(dtDeleteBlockedByRelease(USERS.kpp, caseDto({ status }))).toBe(false) // править тоже нельзя — пункта нет
    }
  })
})
