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
  TeamMemberDto,
} from '@/types/api'
import type { DeclarantProfileDto } from './declarantProfile'

// opts.silent — экран «Команда» сам показывает ошибку на месте (без тоста перехватчика).
export interface SilentOpts { silent?: boolean }
const cfg = (opts?: SilentOpts) => (opts?.silent ? { silent: true } : undefined)

export const usersApi = {
  getCatalogAdministrators: async (opts?: SilentOpts): Promise<CatalogAdministratorRow[]> => {
    const response = await apiClient.get<CatalogAdministratorRow[]>('/catalog/administrators', cfg(opts))
    return response.data
  },

  getCatalogBrokers: async (opts?: SilentOpts): Promise<CatalogBrokerRow[]> => {
    const response = await apiClient.get<CatalogBrokerRow[]>('/catalog/brokers', cfg(opts))
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
  // Сервер возвращает id и логин созданного сотрудника.
  registerStaff: async (data: { username: string; password: string; role: string; businessRole?: string }): Promise<{ id: string; username: string }> =>
    (await apiClient.post<{ id: string; username: string }>('/auth/register/staff', data, { silent: true })).data,

  getCatalogImporters: async (opts?: SilentOpts): Promise<CatalogImporterRow[]> => {
    const response = await apiClient.get<CatalogImporterRow[]>('/catalog/importers', cfg(opts))
    return response.data
  },

  getCatalogSalespersons: async (opts?: SilentOpts): Promise<CatalogSalespersonRow[]> => {
    const response = await apiClient.get<CatalogSalespersonRow[]>('/catalog/salespersons', cfg(opts))
    return response.data
  },

  editBroker: async (brokerId: string, data: EditBrokerRequest, opts?: SilentOpts): Promise<void> => {
    await apiClient.put(`/users/brokers/${encodeURIComponent(brokerId)}`, {
      username: data.username,
      clientIds: data.clientIds,
    }, cfg(opts))
  },

  editExpeditor: async (expeditorId: string, data: EditExpeditorRequest, opts?: SilentOpts): Promise<void> => {
    await apiClient.put(`/users/expeditors/${encodeURIComponent(expeditorId)}`, {
      username: data.username,
      clientsId: data.clientsId,
    }, cfg(opts))
  },

  // Волна 5: привязка клиентов реестра транзита для сотрудника не из таблицы Broker (мпп-importer).
  editStaffClients: async (staffUserId: string, data: EditStaffClientsRequest, opts?: SilentOpts): Promise<void> => {
    await apiClient.put(`/users/staff/${encodeURIComponent(staffUserId)}/clients`, {
      clientIds: data.clientIds,
    }, cfg(opts))
  },

  // Клиенты, привязанные к сотруднику: берём строку из справочника по его системному типу (broker / importer / sales / administrator).
  linkedClients: async (staffId: string, systemRole: string, opts?: SilentOpts): Promise<{ id: string; username: string }[]> => {
    const role = (systemRole || '').toLowerCase()
    const rows: { id: string; clients: { id: string; username: string }[] }[] =
      role === 'broker' ? await usersApi.getCatalogBrokers(opts)
        : role === 'sales' ? await usersApi.getCatalogSalespersons(opts)
          : role === 'administrator' ? await usersApi.getCatalogAdministrators(opts)
            : await usersApi.getCatalogImporters(opts)
    return rows.find((r) => r.id === staffId)?.clients ?? []
  },

  // Сброс пароля админом: временный пароль показывается один раз.
  resetPassword: async (id: string, opts?: SilentOpts): Promise<{ username: string; temporaryPassword: string }> =>
    (await apiClient.post(`/users/${encodeURIComponent(id)}/reset-password`, undefined, cfg(opts))).data,
  deleteUser: async (id: string, opts?: SilentOpts): Promise<void> => {
    await apiClient.delete(`/users/${encodeURIComponent(id)}`, cfg(opts))
  },
}
