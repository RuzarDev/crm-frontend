import apiClient from './client'

// Карточка по 12 цифрам — см. CompanyLookupEndpoints на бэке: юрлицо из ГБД ЮЛ (data.egov.kz),
// а если это ИИН ИП — из КГД «Поиск налогоплательщика» (только наименование и даты, без адреса).
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
  kind?: 'ul' | 'ip'
  isActive?: boolean
}

export const isBinLike = (v: string | null | undefined) => /^\d{12}$/.test((v ?? '').replace(/\D/g, ''))

export const companyLookupApi = {
  // 200 найдено · 404 нет в реестре · 503 ключ не настроен · 502 портал недоступен.
  // silent: BinLookupButton сам показывает результат/ошибку разными тостами по статусу
  // (аудит 1.1) — общий тост перехватчика был бы дублем.
  byBin: async (bin: string, anonymous = false): Promise<CompanyLookupDto> =>
    (await apiClient.get<CompanyLookupDto>(
      `/${anonymous ? 'auth' : 'ref'}/company-by-bin/${encodeURIComponent(bin.replace(/\D/g, ''))}`,
      { silent: true },
    )).data,
}
