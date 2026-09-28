import apiClient from './client'
import type { LoginResponse } from '@/types/api'

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
  // silent: экран сам показывает состояние «ссылка недействительна» на любую ошибку —
  // общий тост перехватчика был бы лишним (аудит 1.2/1.11).
  inviteInfo: async (token: string): Promise<InviteInfo> =>
    (await apiClient.get<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`, { silent: true })).data,
  // Аудит 5.22: бэк отдаёт тот же AuthResponse, что и логин — сразу авто-вход после установки пароля.
  acceptInvite: async (token: string, password: string): Promise<LoginResponse> =>
    (await apiClient.post<LoginResponse>('/auth/invite/accept', { token, password })).data,
}
