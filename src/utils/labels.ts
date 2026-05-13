const roleMap: Record<string, string> = {
  client: 'Клиент',
  broker: 'Брокер',
  expeditor: 'Экспедитор',
  administrator: 'Администратор',
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
}

export function formatRole(role: string): string {
  const key = role.trim().toLowerCase()
  return roleMap[key] ?? role
}

export function formatPermission(permission: string): string {
  return permissionMap[permission] ?? permission
}
