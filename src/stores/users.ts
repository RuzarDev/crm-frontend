import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usersApi } from '@/api/users'
import type { RegisterRequest, User } from '@/types/api'
import { message } from 'ant-design-vue'

export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([])
  const loading = ref(false)

  const fetchUsers = async () => {
    loading.value = true
    try {
      users.value = await usersApi.getUsers()
    } catch (error) {
      return false
    } finally {
      loading.value = false
    }
    return true
  }

  const createUser = async (payload: RegisterRequest) => {
    try {
      await usersApi.createUser(payload)
      message.success('User created')
      await fetchUsers()
      return true
    } catch (error) {
      return false
    }
  }

  return {
    users,
    loading,
    fetchUsers,
    createUser,
  }
})
