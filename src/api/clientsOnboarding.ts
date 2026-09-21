import apiClient from './client'

// Путь клиента (2026-09-21): список со статусами, приглашения, блокировка.
export type ClientStatus = 'Invited' | 'Active' | 'Blocked'

export interface ClientOnboardingRow {
  id: string
  username: string
  email: string | null
  companyName: string | null
  bin: string | null
  phone: string | null
  status: ClientStatus
  emailConfirmed: boolean
  hasContract: boolean
  hasPoa: boolean
  createdAtUtc: string
  inviteExpiresAtUtc: string | null
}

export interface InviteClientRequest {
  email: string
  bin: string
  companyName?: string | null
  phone?: string | null
}

export interface InviteClientResponse {
  clientId: string
  invitePath: string
  expiresAtUtc: string
  reissued: boolean
}

export interface InviteInfo {
  email: string
  companyName: string | null
  bin: string | null
  expiresAtUtc: string
}

export const clientsOnboardingApi = {
  list: async (): Promise<ClientOnboardingRow[]> => (await apiClient.get<ClientOnboardingRow[]>('/clients/onboarding')).data,
  invite: async (data: InviteClientRequest): Promise<InviteClientResponse> =>
    (await apiClient.post<InviteClientResponse>('/clients/invite', data)).data,
  block: async (id: string) => { await apiClient.post(`/clients/${encodeURIComponent(id)}/block`) },
  unblock: async (id: string) => { await apiClient.post(`/clients/${encodeURIComponent(id)}/unblock`) },
  // публичные
  inviteInfo: async (token: string): Promise<InviteInfo> =>
    (await apiClient.get<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`)).data,
  acceptInvite: async (token: string, password: string): Promise<{ username: string }> =>
    (await apiClient.post<{ username: string }>('/auth/invite/accept', { token, password })).data,
}
