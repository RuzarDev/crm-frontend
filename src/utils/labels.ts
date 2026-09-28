// Аудит 2026-09-28, п.10: подписи ролей/прав были жёстко на русском —
// добавлена локализация через enum.systemRole.* / enum.permission.*, RU-карты ниже остаются запасным вариантом.
import { i18n } from '@/i18n'

const roleMap: Record<string, string> = {
  client: 'Клиент',
  broker: 'Брокер',
  expeditor: 'Экспедитор',
  administrator: 'Администратор',
  importer: 'Импорт',
  sales: 'Продажи',
}

const permissionMap: Record<string, string> = {
  'reestr.read': 'Реестр: просмотр',
  'reestr.write': 'Реестр: редактирование',
  'reestr.delete': 'Реестр: удаление',
  'users.read': 'Пользователи: просмотр',
  'users.write': 'Пользователи: создание',
  'users.delete': 'Пользователи: удаление',
  'users.assign_role': 'Пользователи: назначение роли',
  'clients.manage': 'Клиенты: привязки',
  'endpoints.read': 'Система: каталог API',
  'roles.manage': 'Роли: управление',
  'status.change': 'Реестр: смена статуса',
  'tnved.manage': 'ТН ВЭД: администрирование',
}

// Коды событий журнала действий (audit.Add на бэке) — сверено с CRM.API,
// аудит 2026-09-28 п.7: журнал не должен показывать сырые коды.
const auditActionMap: Record<string, string> = {
  'client.invite': 'Приглашение клиента',
  'client.block': 'Блокировка клиента',
  'client.unblock': 'Разблокировка клиента',
  'document.revoke': 'Отзыв документа',
  'document.sign.upload': 'Загрузка подписанного документа',
  'invoice.remind': 'Напоминание об оплате счёта',
  'organization.update': 'Изменение реквизитов организации',
}

export function formatRole(role: string): string {
  const key = role.trim().toLowerCase()
  // Ключ enum.systemRole, а не enum.role: в locale-файлах enum.role уже занят
  // другой картой (ответственный за шаг заявки — клиент/КПП/декларант и т.п.).
  return i18n.global.te(`enum.systemRole.${key}`) ? String(i18n.global.t(`enum.systemRole.${key}`)) : (roleMap[key] ?? role)
}

export function formatPermission(permission: string): string {
  const key = permission.trim().toLowerCase().replace(/\./g, '_')
  return i18n.global.te(`enum.permission.${key}`)
    ? String(i18n.global.t(`enum.permission.${key}`))
    : (permissionMap[permission] ?? permission)
}

export function formatAuditAction(action: string): string {
  const key = action.trim().toLowerCase().replace(/\./g, '_')
  return i18n.global.te(`enum.auditAction.${key}`)
    ? String(i18n.global.t(`enum.auditAction.${key}`))
    : (auditActionMap[action] ?? action)
}
