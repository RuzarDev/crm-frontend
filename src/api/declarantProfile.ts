import apiClient from './client'

// Профиль декларанта (гр.54): ФИО/доверенность/удостоверение текущего пользователя.
export interface DeclarantProfileDto {
  fullName: string | null
  position: string | null
  phone: string | null
  powerOfAttorneyNumber: string | null
  powerOfAttorneyDate: string | null
  powerOfAttorneyValidUntil: string | null
  idDocTypeCode: string | null
  idDocNumber: string | null
  idDocIssueDate: string | null
  idDocIssuedBy: string | null
  idDocCountryCode: string | null
}

export const declarantProfileApi = {
  get: async (): Promise<DeclarantProfileDto> =>
    (await apiClient.get<DeclarantProfileDto>('/import40/declarant-profile')).data,
  update: async (data: DeclarantProfileDto): Promise<DeclarantProfileDto> =>
    (await apiClient.put<DeclarantProfileDto>('/import40/declarant-profile', data)).data,
}
