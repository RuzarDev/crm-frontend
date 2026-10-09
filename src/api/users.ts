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
  TeamMemberDto,
} from '@/types/api'
import type { DeclarantProfileDto } from './declarantProfile'

// opts.silent — экран «Команда» сам показывает ошибку на месте (без тоста перехватчика).
export interface SilentOpts { silent?: boolean }
const cfg = (opts?: SilentOpts) => (opts?.silent ? { silent: true } : undefined)

export const usersApi = {
  getCatalogAdministrators: async (): Promise<CatalogAdministratorRow[]> => {
    const response = await apiClient.get<CatalogAdministratorRow[]>('/catalog/administrators')
    return response.data
  },

  getCatalogBrokers: async (): Promise<CatalogBrokerRow[]> => {
    const response = await apiClient.get<CatalogBrokerRow[]>('/catalog/brokers')
    return response.data
  },

  getCatalogClients: async (opts?: SilentOpts): Promise<CatalogClientRow[]> => {
    const response = await apiClient.get<CatalogClientRow[]>('/catalog/clients', cfg(opts))
    return response.data
  },

  getCatalogExpeditors: async (opts?: SilentOpts): Promise<CatalogExpeditorRow[]> => {
    const response = await apiClient.get<CatalogExpeditorRow[]>('/catalog/expeditors', cfg(opts))
    return response.data
  },

  // Сотрудники одной выборкой: имя, роли, представитель по доверенности, число клиентов (users.read).
  team: async (opts?: SilentOpts): Promise<TeamMemberDto[]> =>
    (await apiClient.get<TeamMemberDto[]>('/users/team', cfg(opts))).data,

  // Профиль декларанта сотрудника (users.read): 204 — профиль не заполнен.
  declarantProfile: async (id: string, opts?: SilentOpts): Promise<DeclarantProfileDto | null> => {
    const res = await apiClient.get<DeclarantProfileDto | ''>(`/users/${encodeURIComponent(id)}/declarant-profile`, cfg(opts))
    return res.status === 204 || !res.data ? null : (res.data as DeclarantProfileDto)
  },

  // Новый сотрудник: ошибку (в т.ч. 403 «администратора заводит только администратор») показывает форма.
  registerStaff: async (data: { username: string; password: string; role: string; businessRole?: string }): Promise<void> => {
    await apiClient.post('/auth/register/staff', data, { silent: true })
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

  editExpeditor: async (expeditorId: string, data: EditExpeditorRequest, opts?: SilentOpts): Promise<void> => {
    await apiClient.put(`/users/expeditors/${encodeURIComponent(expeditorId)}`, {
      username: data.username,
      clientsId: data.clientsId,
    }, cfg(opts))
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
