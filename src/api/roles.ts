import apiClient from './client'
import type { CreateRoleRequest, RoleItem, UpdateRolePermissionsRequest } from '@/types/api'

export const rolesApi = {
  getRoles: async (): Promise<RoleItem[]> => {
    const response = await apiClient.get<RoleItem[]>('/roles')
    return response.data
  },

  getPermissions: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/roles/permissions')
    return response.data
  },

  createRole: async (data: CreateRoleRequest): Promise<RoleItem> => {
    const response = await apiClient.post<RoleItem>('/roles', data)
    return response.data
  },

  updateRolePermissions: async (
    roleName: string,
    data: UpdateRolePermissionsRequest,
  ): Promise<RoleItem> => {
    const response = await apiClient.put<RoleItem>(`/roles/${encodeURIComponent(roleName)}/permissions`, data)
    return response.data
  },

  deleteRole: async (roleName: string): Promise<void> => {
    await apiClient.delete(`/roles/${encodeURIComponent(roleName)}`)
  },
}
