import apiClient from './client'

// Согласие на обработку персональных данных (30.10.2026): контакты оператора для /privacy (без входа),
// статус и подтверждение согласия клиентом после входа.
export interface PrivacyOperator {
  version: string
  companyName: string | null
  bin: string | null
  legalAddress: string | null
  phone: string | null
  email: string | null
}

export interface PrivacyConsentStatus {
  version: string
  /** true — показать окно согласия (нет согласия или оно на прежнюю редакцию). */
  required: boolean
  acceptedVersion: string | null
  acceptedAtUtc: string | null
}

export const privacyApi = {
  operator: async (): Promise<PrivacyOperator> =>
    (await apiClient.get<PrivacyOperator>('/privacy/operator', { silent: true })).data,
  status: async (): Promise<PrivacyConsentStatus> =>
    (await apiClient.get<PrivacyConsentStatus>('/privacy/consent', { silent: true })).data,
  accept: async (): Promise<PrivacyConsentStatus> =>
    (await apiClient.post<PrivacyConsentStatus>('/privacy/consent', { consent: true })).data,
}
