import apiClient from './client'

// Профиль декларанта (гр.54): ФИО/доверенность/удостоверение текущего пользователя.
export interface DeclarantProfileDto {
  fullName: string | null
  position: string | null
  phone: string | null
  /** ИИН — ccecd:PersonId в КЕДЕН-XML (кто заполнил ДТ) */
  iin: string | null
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
  // silent — ошибку показывает сама карточка (состояние ошибки с «Повторить»), общий тост не нужен.
  get: async (opts?: { silent?: boolean }): Promise<DeclarantProfileDto> =>
    (await apiClient.get<DeclarantProfileDto>('/import40/declarant-profile', { silent: opts?.silent })).data,
  update: async (data: DeclarantProfileDto, opts?: { silent?: boolean }): Promise<DeclarantProfileDto> =>
    (await apiClient.put<DeclarantProfileDto>('/import40/declarant-profile', data, { silent: opts?.silent })).data,
}
