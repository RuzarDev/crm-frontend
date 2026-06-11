import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usersApi } from '@/api/users'
import type {
  CatalogAdministratorRow,
  CatalogBrokerRow,
  CatalogClientRow,
  CatalogExpeditorRow,
  CatalogImporterRow,
  EditBrokerRequest,
  EditExpeditorRequest,
  LinkUsersRequest,
  RegisterRequest,
} from '@/types/api'
import { message } from 'ant-design-vue'

export const useUsersStore = defineStore('users', () => {
  const administrators = ref<CatalogAdministratorRow[]>([])
  const brokers = ref<CatalogBrokerRow[]>([])
  const clients = ref<CatalogClientRow[]>([])
  const expeditors = ref<CatalogExpeditorRow[]>([])
  const importers = ref<CatalogImporterRow[]>([])
  const loading = ref(false)

  const fetchCatalogs = async () => {
    loading.value = true
    try {
      const [a, b, c, e, i] = await Promise.all([
        usersApi.getCatalogAdministrators(),
        usersApi.getCatalogBrokers(),
        usersApi.getCatalogClients(),
        usersApi.getCatalogExpeditors(),
        usersApi.getCatalogImporters(),
      ])
      administrators.value = a
      brokers.value = b.map((r) => ({ ...r, clients: r.clients ?? [] }))
      clients.value = c.map((r) => ({
        ...r,
        brokers: r.brokers ?? [],
        expeditors: r.expeditors ?? [],
      }))
      expeditors.value = e.map((r) => ({ ...r, clients: r.clients ?? [] }))
      importers.value = i
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

  const changeBusinessRole = async (userId: string, businessRole: string) => {
    try {
      await usersApi.changeBusinessRole(userId, businessRole)
      message.success('Бизнес-роль обновлена')
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const editExpeditor = async (expeditorId: string, payload: EditExpeditorRequest) => {
    try {
      await usersApi.editExpeditor(expeditorId, payload)
      message.success('Экспедитор обновлён')
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const changeUserRole = async (id: string, role: string) => {
    await usersApi.changeUserRole(id, role)
  }

  return {
    administrators,
    brokers,
    clients,
    expeditors,
    importers,
    loading,
    fetchCatalogs,
    createUser,
    deleteUser,
    linkUsers,
    editBroker,
    editExpeditor,
    changeUserRole,
    changeBusinessRole,
  }
})
