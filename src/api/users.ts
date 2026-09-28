import apiClient from './client'
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

export const usersApi = {
  getCatalogAdministrators: async (): Promise<CatalogAdministratorRow[]> => {
    const response = await apiClient.get<CatalogAdministratorRow[]>('/catalog/administrators')
    return response.data
  },

  getCatalogBrokers: async (): Promise<CatalogBrokerRow[]> => {
    const response = await apiClient.get<CatalogBrokerRow[]>('/catalog/brokers')
    return response.data
  },

  getCatalogClients: async (): Promise<CatalogClientRow[]> => {
    const response = await apiClient.get<CatalogClientRow[]>('/catalog/clients')
    return response.data
  },

  getCatalogExpeditors: async (): Promise<CatalogExpeditorRow[]> => {
    const response = await apiClient.get<CatalogExpeditorRow[]>('/catalog/expeditors')
    return response.data
  },

  getCatalogImporters: async (): Promise<CatalogImporterRow[]> => {
    const response = await apiClient.get<CatalogImporterRow[]>('/catalog/importers')
    return response.data
  },

  getCatalogSalespersons: async (): Promise<CatalogSalespersonRow[]> => {
    const response = await apiClient.get<CatalogSalespersonRow[]>('/catalog/salespersons')
    return response.data
  },

  createUser: async (data: RegisterRequest): Promise<void> => {
    if (data.role === 'client') {
      await apiClient.post('/auth/register', {
        username: data.username,
        password: data.password,
      })
      return
    }

    await apiClient.post('/auth/register/staff', {
      username: data.username,
      password: data.password,
      role: data.role,
      ...(data.businessRole ? { businessRole: data.businessRole } : {}),
    })
  },

  changeBusinessRole: async (userId: string, businessRole: string): Promise<void> => {
    await apiClient.patch(`/users/${encodeURIComponent(userId)}/business-role`, {
      businessRole,
    })
  },

  linkUsers: async (data: LinkUsersRequest): Promise<void> => {
    await apiClient.post('/users/links', {
      staffUserId: data.staffUserId,
      clientUserId: data.clientUserId,
    })
  },

  editBroker: async (brokerId: string, data: EditBrokerRequest): Promise<void> => {
    await apiClient.put(`/users/brokers/${encodeURIComponent(brokerId)}`, {
      username: data.username,
      clientIds: data.clientIds,
    })
  },

  editExpeditor: async (expeditorId: string, data: EditExpeditorRequest): Promise<void> => {
    await apiClient.put(`/users/expeditors/${encodeURIComponent(expeditorId)}`, {
      username: data.username,
      clientsId: data.clientsId,
    })
  },

  // Волна 5: привязка клиентов реестра транзита для сотрудника не из таблицы Broker (мпп-importer).
  editStaffClients: async (staffUserId: string, data: EditStaffClientsRequest): Promise<void> => {
    await apiClient.put(`/users/staff/${encodeURIComponent(staffUserId)}/clients`, {
      clientIds: data.clientIds,
    })
  },

  // Сброс пароля админом: временный пароль показывается один раз.
  resetPassword: async (id: string): Promise<{ username: string; temporaryPassword: string }> =>
    (await apiClient.post(`/users/${encodeURIComponent(id)}/reset-password`)).data,
  deleteUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${encodeURIComponent(id)}`)
  },

  changeUserRole: async (id: string, role: string): Promise<void> => {
    await apiClient.patch(`/users/${encodeURIComponent(id)}/role`, { role })
  },
}
