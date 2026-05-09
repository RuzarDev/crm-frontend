import { defineStore } from 'pinia'
import { ref } from 'vue'
import { rolesApi } from '@/api/roles'
import type { RoleItem } from '@/types/api'
import { message } from 'ant-design-vue'

export const useRolesStore = defineStore('roles', () => {
  const roles = ref<RoleItem[]>([])
  const permissions = ref<string[]>([])
  const loading = ref(false)

  const fetchRoles = async () => {
    loading.value = true
    try {
      roles.value = await rolesApi.getRoles()
    } catch (error) {
      return false
    } finally {
      loading.value = false
    }
    return true
  }

  const fetchPermissions = async () => {
    try {
      permissions.value = await rolesApi.getPermissions()
    } catch (error) {
      return false
    }
    return true
  }

  const createRole = async (name: string, selectedPermissions: string[]) => {
    try {
      await rolesApi.createRole({ name, permissions: selectedPermissions })
      message.success('Роль создана')
      await fetchRoles()
      return true
    } catch (error) {
      return false
    }
  }

  const updateRolePermissions = async (name: string, selectedPermissions: string[]) => {
    try {
      await rolesApi.updateRolePermissions(name, { permissions: selectedPermissions })
      message.success('Роль обновлена')
      await fetchRoles()
      return true
    } catch (error) {
      return false
    }
  }

  const deleteRole = async (name: string) => {
    try {
      await rolesApi.deleteRole(name)
      message.success('Роль удалена')
      await fetchRoles()
      return true
    } catch (error) {
      return false
    }
  }

  return {
    roles,
    permissions,
    loading,
    fetchRoles,
    fetchPermissions,
    createRole,
    updateRolePermissions,
    deleteRole,
  }
})
