import apiClient from './client'

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
  catalog: async (): Promise<BusinessRoleInfo[]> => (await apiClient.get<BusinessRoleInfo[]>('/users/business-roles/catalog')).data,
  userRoles: async (userId: string): Promise<string[]> =>
    (await apiClient.get<{ userId: string; roles: string[] }>(`/users/${encodeURIComponent(userId)}/business-roles`)).data.roles,
  setUserRoles: async (userId: string, roles: string[]) => {
    await apiClient.put(`/users/${encodeURIComponent(userId)}/business-roles`, { roles })
  },
}

// Подписи бизнес-ролей для тегов (единый источник на фронте).
export const BUSINESS_ROLE_LABELS: Record<string, string> = {
  declarant: 'Декларант',
  kpp: 'Менеджер КПП',
  mpp: 'Брокер (транзит)',
  accountant: 'Бухгалтер',
  sales: 'Продажи и клиенты',
  rop: 'Руководитель отдела',
  client: 'Клиент',
  expeditor: 'Экспедитор',
}
export const businessRoleLabel = (code: string) => BUSINESS_ROLE_LABELS[(code || '').toLowerCase()] ?? code
