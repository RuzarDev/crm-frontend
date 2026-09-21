import apiClient from './client'

// Карточка юрлица из ГБД ЮЛ (data.egov.kz) по БИН — см. CompanyLookupEndpoints на бэке.
// Только юрлица/филиалы/представительства; ИП по ИИН в открытых данных нет.
export interface CompanyLookupDto {
  bin: string
  nameRu: string | null
  nameKz: string | null
  addressRu: string | null
  addressKz: string | null
  director: string | null
  okedRu: string | null
  statusRu: string | null
  dateReg: string | null
  source: string
  fetchedAtUtc: string
}

export const isBinLike = (v: string | null | undefined) => /^\d{12}$/.test((v ?? '').replace(/\D/g, ''))

export const companyLookupApi = {
  // 200 найдено · 404 нет в реестре · 503 ключ не настроен · 502 портал недоступен
  byBin: async (bin: string): Promise<CompanyLookupDto> =>
    (await apiClient.get<CompanyLookupDto>(`/ref/company-by-bin/${encodeURIComponent(bin.replace(/\D/g, ''))}`)).data,
}
