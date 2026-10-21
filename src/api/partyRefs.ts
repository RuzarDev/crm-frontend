import apiClient from './client'

// Справочник сторон ДТ (отправитель гр.2 / получатель гр.8).
export interface PartyRefDto {
  id: string
  name: string
  shortName: string | null
  bin: string | null
  countryCode: string | null
  city: string | null
  region: string | null
  street: string | null
  house: string | null
  apt: string | null
  categoryCode: string | null
  katoCode: string | null
}

export type PartyRefUpsert = Omit<PartyRefDto, 'id'>

export const partyRefsApi = {
  /** silent — без тоста перехватчика (импорт «Из документов» ищет отправителя сам и молча идёт дальше). */
  search: async (q: string, opts?: { silent?: boolean }): Promise<PartyRefDto[]> =>
    (await apiClient.get<PartyRefDto[]>('/party-refs', { params: { q }, ...(opts?.silent ? { silent: true } : {}) })).data,
  upsert: async (body: PartyRefUpsert): Promise<PartyRefDto> =>
    (await apiClient.post<PartyRefDto>('/party-refs', body)).data,
}
