import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import {
  AUDIT_ACTIONS, auditExcelRows, auditParams, auditTone, buildAuditQuery, formatAuditWhen, parseAuditQuery,
} from '../audit'

const NEW_ACTIONS = [
  'user.create', 'user.delete', 'user.role', 'user.roles', 'user.password_reset', 'user.password_change', 'user.poa',
  'role.permissions', 'role.reset',
]

describe('auditTone — вид действия', () => {
  it('права и роли — фиолетовый, пароли — охра, блокировка и отзыв — красный, остальное — синий', () => {
    for (const a of ['role.permissions', 'role.reset', 'user.role', 'user.roles', 'user.poa']) expect(auditTone(a)).toBe('submitted')
    for (const a of ['user.password_reset', 'user.password_change']) expect(auditTone(a)).toBe('wait')
    for (const a of ['client.block', 'document.revoke']) expect(auditTone(a)).toBe('danger')
    for (const a of ['organization.update', 'user.create', 'user.delete', 'client.invite', 'client.unblock', 'invoice.remind', 'document.sign.upload']) {
      expect(auditTone(a)).toBe('info')
    }
  })
  it('неизвестное действие — синий, без падения', () => {
    expect(auditTone('something.new')).toBe('info')
  })
})

describe('подписи действий', () => {
  it('для всех известных действий есть enum.auditAction во всех трёх языках', () => {
    for (const [name, loc] of [['ru', ru], ['kk', kk], ['en', en]] as const) {
      const map = (loc as { enum: { auditAction: Record<string, string> } }).enum.auditAction
      for (const a of AUDIT_ACTIONS) {
        const v = map[a.replace(/\./g, '_')]
        expect(v, `${name}: ${a}`).toBeTruthy()
      }
    }
    expect(NEW_ACTIONS.every((a) => (AUDIT_ACTIONS as readonly string[]).includes(a))).toBe(true)
  })
})

describe('фильтры в адресе', () => {
  it('без параметров — 30 дней; days=0 — всё время; мусор — 30', () => {
    expect(parseAuditQuery({})).toEqual({ days: 30, action: '', actor: '', q: '' })
    expect(parseAuditQuery({ days: '0' }).days).toBe(0)
    expect(parseAuditQuery({ days: '90', action: 'client.block', actor: 'u1', q: ' Иван ' })).toEqual({ days: 90, action: 'client.block', actor: 'u1', q: 'Иван' })
    expect(parseAuditQuery({ days: 'abc' }).days).toBe(30)
  })
  it('адрес без значений по умолчанию, чужие параметры сохраняются', () => {
    expect(buildAuditQuery({}, { days: 30, action: '', actor: '', q: '' })).toEqual({})
    expect(buildAuditQuery({ x: '1', days: '7' }, { days: 0, action: 'user.role', actor: 'u1', q: ' a ' }))
      .toEqual({ x: '1', days: '0', action: 'user.role', actor: 'u1', q: 'a' })
  })
  it('параметры запроса: days=0 и пустые поля не отправляются', () => {
    expect(auditParams({ days: 0, action: '', actor: '', q: '' }, 0, 50)).toEqual({ offset: 0, limit: 50 })
    expect(auditParams({ days: 7, action: 'user.poa', actor: 'u9', q: 'x' }, 50, 50))
      .toEqual({ days: 7, action: 'user.poa', actorId: 'u9', q: 'x', offset: 50, limit: 50 })
  })
})

describe('formatAuditWhen', () => {
  const now = new Date('2026-10-09T12:00:00Z')
  const iso = '2026-10-08T12:42:00Z'
  const local = new Date(iso)
  const dd = String(local.getDate()).padStart(2, '0')
  const mm = String(local.getMonth() + 1).padStart(2, '0')
  const hh = String(local.getHours()).padStart(2, '0')
  const mi = String(local.getMinutes()).padStart(2, '0')

  it('ДД.ММ, ЧЧ:ММ — день первым во всех языках', () => {
    for (const l of ['ru', 'kk', 'en']) expect(formatAuditWhen(iso, l, now)).toBe(`${dd}.${mm}, ${hh}:${mi}`)
  })
  it('в другом году и по запросу — с годом; без пояса времени считается UTC', () => {
    expect(formatAuditWhen(iso, 'ru', new Date('2027-01-05T00:00:00Z'))).toBe(`${dd}.${mm}.2026, ${hh}:${mi}`)
    expect(formatAuditWhen(iso, 'ru', now, true)).toBe(`${dd}.${mm}.2026, ${hh}:${mi}`)
    expect(formatAuditWhen('2026-10-08T12:42:00', 'ru', now)).toBe(`${dd}.${mm}, ${hh}:${mi}`)
    expect(formatAuditWhen('bad', 'ru', now)).toBe('—')
  })
})

describe('auditExcelRows', () => {
  it('колонки как в таблице, действие — подписью, дата с годом', () => {
    const rows = auditExcelRows(
      [{ id: '1', atUtc: '2026-10-08T12:42:00Z', actorUserId: 'u1', actorName: 'Ахметов К.', actorRole: 'administrator', action: 'client.block', entityType: 'client', entityId: 'c1', summary: 'ТОО «Steppe Agro»' }],
      { when: 'Когда', who: 'Кто', action: 'Действие', what: 'Что' }, 'ru', (a) => `L:${a}`,
    )
    expect(Object.keys(rows[0])).toEqual(['Когда', 'Кто', 'Действие', 'Что'])
    expect(rows[0]['Кто']).toBe('Ахметов К.')
    expect(rows[0]['Действие']).toBe('L:client.block')
    expect(rows[0]['Что']).toBe('ТОО «Steppe Agro»')
    expect(String(rows[0]['Когда'])).toMatch(/^\d{2}\.\d{2}\.2026, \d{2}:\d{2}$/)
  })
})
