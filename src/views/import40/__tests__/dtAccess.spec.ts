import { describe, expect, it, vi } from 'vitest'
import {
  DECLARING_STATUS,
  canEditDt,
  canManageDeclarations,
  dtUserFrom,
  isDtReadOnly,
  saveBeforeAction,
  type DtAccessUser,
} from '../dtAccess'

const ME = 'user-me'
const OTHER = 'user-other'

const user = (over: Partial<DtAccessUser> = {}): DtAccessUser => ({
  isAdmin: false,
  isClient: false,
  isRop: false,
  canDeclare: false,
  userId: ME,
  ...over,
})
const admin = user({ isAdmin: true })
const declarant = user({ canDeclare: true })
// КПП/бухгалтер/продажи/МПП — без права import40.declarant.
const staffNoPerm = user()
const client = user({ isClient: true })

describe('dtAccess — редактирование ДТ как на сервере (CanManageDeclarations + CanEditCaseData)', () => {
  it('админ правит всегда, в любом статусе и при чужом назначении', () => {
    for (const status of [0, 1, 2, 3, 5, 9]) {
      expect(canEditDt(admin, { status, assignedDeclarantId: OTHER })).toBe(true)
    }
  })

  it('R1: сотрудник без права import40.declarant не правит даже до «Декларирования»', () => {
    expect(isDtReadOnly(staffNoPerm, { status: 0 })).toBe(true)
    expect(isDtReadOnly(staffNoPerm, { status: 1, assignedDeclarantId: null })).toBe(true)
    expect(isDtReadOnly(staffNoPerm, { status: DECLARING_STATUS, assignedDeclarantId: ME })).toBe(true)
  })

  it('клиент — только просмотр', () => {
    expect(isDtReadOnly(client, { status: 0 })).toBe(true)
    expect(isDtReadOnly({ ...client, canDeclare: true }, { status: 0 })).toBe(true)
  })

  it('декларант до «Декларирования» правит независимо от назначения', () => {
    expect(canEditDt(declarant, { status: 1, assignedDeclarantId: OTHER })).toBe(true)
  })

  it('со статуса 2: назначен я или никто — правлю; назначен другой — просмотр', () => {
    expect(canEditDt(declarant, { status: DECLARING_STATUS, assignedDeclarantId: ME })).toBe(true)
    expect(canEditDt(declarant, { status: DECLARING_STATUS, assignedDeclarantId: null })).toBe(true)
    expect(canEditDt(declarant, { status: 3 })).toBe(true)
    expect(canEditDt(declarant, { status: DECLARING_STATUS, assignedDeclarantId: OTHER })).toBe(false)
  })

  it('РОП (решение 09.10): любая ДТ при любом статусе и назначении, даже без права import40.declarant', () => {
    const rop = user({ isRop: true })
    for (const status of [0, 2, 4, 8, 9]) expect(canEditDt(rop, { status, assignedDeclarantId: OTHER })).toBe(true)
    expect(canManageDeclarations(rop)).toBe(true)
  })

  it('R3: после выпуска/отмены (статусы 4–9) назначенный декларант правит, как пускает сервер', () => {
    expect(canEditDt(declarant, { status: 6, assignedDeclarantId: ME })).toBe(true)
    expect(canEditDt(declarant, { status: 9, assignedDeclarantId: OTHER })).toBe(false)
  })

  it('R2: решает право (из всех ролей), а не основная бизнес-роль', () => {
    // мультироль [kpp, declarant] с основной kpp: право import40.declarant в JWT есть
    expect(canEditDt(user({ canDeclare: true }), { status: DECLARING_STATUS, assignedDeclarantId: ME })).toBe(true)
  })

  it('без userId чужое назначение не совпадает с «я»', () => {
    expect(canEditDt(user({ canDeclare: true, userId: null }), { status: 2, assignedDeclarantId: OTHER })).toBe(false)
  })

  it('заявка ещё не загружена — решает только право', () => {
    expect(canEditDt(declarant, null)).toBe(true)
    expect(canEditDt(staffNoPerm, null)).toBe(false)
  })

  it('готовность КЕДЕН видна тем, кого пускает сервер: админ и декларант (в т.ч. в просмотре)', () => {
    expect(canManageDeclarations(admin)).toBe(true)
    expect(canManageDeclarations(declarant)).toBe(true)
    expect(canManageDeclarations(staffNoPerm)).toBe(false)
    expect(canManageDeclarations(client)).toBe(false)
  })
})

describe('saveBeforeAction — печать/XML без сохранения в просмотре (B2)', () => {
  it('в просмотре не вызывает сохранение и разрешает действие', async () => {
    const save = vi.fn().mockResolvedValue(false)
    await expect(saveBeforeAction(true, save)).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('в редактировании сначала сохраняет и продолжает только при успехе', async () => {
    const ok = vi.fn().mockResolvedValue(true)
    await expect(saveBeforeAction(false, ok)).resolves.toBe(true)
    expect(ok).toHaveBeenCalledOnce()

    const fail = vi.fn().mockResolvedValue(false)
    await expect(saveBeforeAction(false, fail)).resolves.toBe(false)
    expect(fail).toHaveBeenCalledOnce()
  })
})

describe('dtUserFrom — пользователь из стора auth / CaseAuth', () => {
  const src = (o: Record<string, unknown> = {}) => ({ role: 'broker', businessRole: null, businessRoles: [], permissions: [], userId: ME, ...o })

  it('РОП — по любой из бизнес-ролей, а не только по основной', () => {
    expect(dtUserFrom(src({ businessRole: 'kpp', businessRoles: ['kpp', 'rop'] })).isRop).toBe(true)
    expect(dtUserFrom(src({ businessRole: 'rop' })).isRop).toBe(true)
    expect(dtUserFrom(src({ businessRole: 'kpp', businessRoles: ['kpp'] })).isRop).toBe(false)
    // Основная роль считается, только если списка ролей нет (как BusinessRolesOf на сервере).
    expect(dtUserFrom(src({ businessRole: 'rop', businessRoles: ['kpp'] })).isRop).toBe(false)
  })

  it('право декларанта — из permissions; администратору — всегда; клиент — по системной или бизнес-роли', () => {
    expect(dtUserFrom(src({ permissions: ['import40.declarant'] })).canDeclare).toBe(true)
    expect(dtUserFrom(src({ role: 'Administrator' })).canDeclare).toBe(true)
    expect(dtUserFrom(src({ role: 'client' })).isClient).toBe(true)
    expect(dtUserFrom(src({ businessRole: 'client' })).isClient).toBe(true)
  })
})
