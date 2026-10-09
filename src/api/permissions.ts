import apiClient from './client'
import { i18n } from '@/i18n'

// Матрица прав и мультироли (спека 2026-09-21).
export interface PermissionInfo { code: string; label: string }
export interface PermissionGroup { area: string; permissions: PermissionInfo[] }
export interface RoleRow { code: string; label: string; scope: string; editable: boolean; permissions: string[] }
export interface PermissionMatrix { roles: RoleRow[]; groups: PermissionGroup[] }
export interface BusinessRoleInfo { code: string; label: string; scope: string }

export const permissionsApi = {
  matrix: async (): Promise<PermissionMatrix> => (await apiClient.get<PermissionMatrix>('/system/permissions')).data,
  updateRole: async (role: string, permissions: string[]) => {
    await apiClient.put(`/system/permissions/${encodeURIComponent(role)}`, { permissions })
  },
  reset: async () => { await apiClient.post('/system/permissions/reset') },
  catalog: async (opts?: { silent?: boolean }): Promise<BusinessRoleInfo[]> =>
    (await apiClient.get<BusinessRoleInfo[]>('/users/business-roles/catalog', opts?.silent ? { silent: true } : undefined)).data,
  userRoles: async (userId: string): Promise<string[]> =>
    (await apiClient.get<{ userId: string; roles: string[] }>(`/users/${encodeURIComponent(userId)}/business-roles`)).data.roles,
  setUserRoles: async (userId: string, roles: string[], opts?: { silent?: boolean }) => {
    await apiClient.put(`/users/${encodeURIComponent(userId)}/business-roles`, { roles }, opts?.silent ? { silent: true } : undefined)
  },
  // Представители по доверенности клиентов (флаг в профиле декларанта; complete = есть ФИО/ИИН/удостоверение).
  poaRepresentatives: async (): Promise<{ userId: string; enabled: boolean; complete: boolean }[]> =>
    (await apiClient.get('/users/poa-representatives')).data,
  setPoaRepresentative: async (userId: string, enabled: boolean) => {
    await apiClient.put(`/users/${encodeURIComponent(userId)}/poa-representative`, { enabled })
  },
}

// Подписи бизнес-ролей для тегов (единый источник на фронте).
export const BUSINESS_ROLE_LABELS: Record<string, string> = {
  declarant: 'Брокер-декларант (импорт)',
  kpp: 'Менеджер КПП',
  mpp: 'Транзит (реестр)',
  accountant: 'Бухгалтер',
  sales: 'Продажи и клиенты',
  rop: 'Руководитель отдела',
  client: 'Клиент',
  expeditor: 'Экспедитор',
}
// Локализованная подпись (enum.businessRole.*), RU-константы выше — запасной вариант.
export const businessRoleLabel = (code: string) => {
  const c = (code || '').toLowerCase()
  return i18n.global.te(`enum.businessRole.${c}`) ? i18n.global.t(`enum.businessRole.${c}`) : (BUSINESS_ROLE_LABELS[c] ?? code)
}
