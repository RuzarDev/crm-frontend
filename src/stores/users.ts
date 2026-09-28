import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usersApi } from '@/api/users'
import type {
  CatalogAdministratorRow,
  CatalogBrokerRow,
  CatalogClientRow,
  CatalogExpeditorRow,
  CatalogImporterRow,
  CatalogSalespersonRow,
  EditBrokerRequest,
  EditExpeditorRequest,
  EditStaffClientsRequest,
  LinkUsersRequest,
  RegisterRequest,
} from '@/types/api'
import { message } from 'ant-design-vue'
import { i18n } from '@/i18n'

export const useUsersStore = defineStore('users', () => {
  const administrators = ref<CatalogAdministratorRow[]>([])
  const brokers = ref<CatalogBrokerRow[]>([])
  const clients = ref<CatalogClientRow[]>([])
  const expeditors = ref<CatalogExpeditorRow[]>([])
  const importers = ref<CatalogImporterRow[]>([])
  const salespersons = ref<CatalogSalespersonRow[]>([])
  const loading = ref(false)

  const fetchCatalogs = async () => {
    loading.value = true
    try {
      const [a, b, c, e, i, sp] = await Promise.all([
        usersApi.getCatalogAdministrators(),
        usersApi.getCatalogBrokers(),
        usersApi.getCatalogClients(),
        usersApi.getCatalogExpeditors(),
        usersApi.getCatalogImporters(),
        usersApi.getCatalogSalespersons(),
      ])
      // clients — привязки staff_client_links; раньше приходили только для broker/expeditor/
      // importer, хотя админ и продажник тоже могут быть привязаны к клиентам транзита
      // (аудит 2026-09-28, раздел 10).
      administrators.value = a.map((r) => ({ ...r, clients: r.clients ?? [] }))
      brokers.value = b.map((r) => ({ ...r, clients: r.clients ?? [] }))
      clients.value = c.map((r) => ({
        ...r,
        brokers: r.brokers ?? [],
        expeditors: r.expeditors ?? [],
      }))
      expeditors.value = e.map((r) => ({ ...r, clients: r.clients ?? [] }))
      importers.value = i.map((r) => ({ ...r, clients: r.clients ?? [] }))
      salespersons.value = sp.map((r) => ({ ...r, clients: r.clients ?? [] }))
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
      message.success(i18n.global.t('admin.polzovatelSozdan'))
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const deleteUser = async (id: string) => {
    try {
      await usersApi.deleteUser(id)
      message.success(i18n.global.t('admin.polzovatelUdalen'))
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const linkUsers = async (payload: LinkUsersRequest) => {
    try {
      await usersApi.linkUsers(payload)
      message.success(i18n.global.t('admin.svyazSohranena'))
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const editBroker = async (brokerId: string, payload: EditBrokerRequest) => {
    try {
      await usersApi.editBroker(brokerId, payload)
      message.success(i18n.global.t('admin.brokerObnovlen'))
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const changeBusinessRole = async (userId: string, businessRole: string) => {
    try {
      await usersApi.changeBusinessRole(userId, businessRole)
      message.success(i18n.global.t('admin.biznesRolObnovlena'))
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const editExpeditor = async (expeditorId: string, payload: EditExpeditorRequest) => {
    try {
      await usersApi.editExpeditor(expeditorId, payload)
      message.success(i18n.global.t('admin.ekspeditorObnovlen'))
      await fetchCatalogs()
      return true
    } catch {
      return false
    }
  }

  const editStaffClients = async (staffUserId: string, payload: EditStaffClientsRequest) => {
    try {
      await usersApi.editStaffClients(staffUserId, payload)
      message.success(i18n.global.t('admin.privyazkiKKlientamObnovleny'))
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
    salespersons,
    loading,
    fetchCatalogs,
    createUser,
    deleteUser,
    linkUsers,
    editBroker,
    editExpeditor,
    editStaffClients,
    changeUserRole,
    changeBusinessRole,
  }
})
