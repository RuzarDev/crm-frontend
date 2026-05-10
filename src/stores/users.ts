import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usersApi } from '@/api/users'
import type {
  CatalogAdministratorRow,
  CatalogBrokerRow,
  CatalogClientRow,
  CatalogExpeditorRow,
  EditBrokerRequest,
  LinkUsersRequest,
  RegisterRequest,
} from '@/types/api'
import { message } from 'ant-design-vue'

export const useUsersStore = defineStore('users', () => {
  const administrators = ref<CatalogAdministratorRow[]>([])
  const brokers = ref<CatalogBrokerRow[]>([])
  const clients = ref<CatalogClientRow[]>([])
  const expeditors = ref<CatalogExpeditorRow[]>([])
  const loading = ref(false)

  const fetchCatalogs = async () => {
    loading.value = true
    try {
      const [a, b, c, e] = await Promise.all([
        usersApi.getCatalogAdministrators(),
        usersApi.getCatalogBrokers(),
        usersApi.getCatalogClients(),
        usersApi.getCatalogExpeditors(),
      ])
      administrators.value = a
      brokers.value = b.map((r) => ({ ...r, clients: r.clients ?? [] }))
      clients.value = c.map((r) => ({
        ...r,
        brokers: r.brokers ?? [],
        expeditors: r.expeditors ?? [],
      }))
      expeditors.value = e.map((r) => ({ ...r, clients: r.clients ?? [] }))
    } catch {
      return false
    } finally {
      loading.value = false
    }
    return true
  }

  const createUser = async (payload: RegisterRequest) => {
    try {
      await usersApi.createUser(payload)
      message.success('Пользователь создан')
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const deleteUser = async (id: string) => {
    try {
      await usersApi.deleteUser(id)
      message.success('Пользователь удалён')
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const linkUsers = async (payload: LinkUsersRequest) => {
    try {
      await usersApi.linkUsers(payload)
      message.success('Связь сохранена')
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const editBroker = async (brokerId: string, payload: EditBrokerRequest) => {
    try {
      await usersApi.editBroker(brokerId, payload)
      message.success('Брокер обновлён')
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  return {
    administrators,
    brokers,
    clients,
    expeditors,
    loading,
    fetchCatalogs,
    createUser,
    deleteUser,
    linkUsers,
    editBroker,
  }
})
