import apiClient from './client'
import type {
  CatalogAdministratorRow,
  CatalogBrokerRow,
  CatalogClientRow,
  CatalogExpeditorRow,
  EditBrokerRequest,
  EditExpeditorRequest,
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

  deleteUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${encodeURIComponent(id)}`)
  },
}
