import apiClient from './client'

// Справочник фирм-брокеров (гр.54 item L). Ключ — БИН.
export interface BrokerFirmDto {
  id: string
  name: string
  bin: string
  address: string | null
  contractNumber: string | null
  contractDate: string | null
  contractValidUntil: string | null
  createdAtUtc: string
  updatedAtUtc: string
}

export interface BrokerFirmUpsertRequest {
  name: string
  bin: string
  address?: string | null
  contractNumber?: string | null
  contractDate?: string | null
  contractValidUntil?: string | null
}

// GET /broker-firms?bin=<bin> → одна фирма или null.
export const getBrokerFirmByBin = async (bin: string): Promise<BrokerFirmDto | null> => {
  const response = await apiClient.get<BrokerFirmDto | null>('/broker-firms', { params: { bin } })
  return response.data
}

// POST /broker-firms → upsert по БИН.
export const upsertBrokerFirm = async (body: BrokerFirmUpsertRequest): Promise<BrokerFirmDto> => {
  const response = await apiClient.post<BrokerFirmDto>('/broker-firms', body)
  return response.data
}
