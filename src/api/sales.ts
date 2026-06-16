import apiClient from './client'

export interface SalesServiceItem {
  id: string
  name: string
  unit: string
  price: number
  sortOrder: number
  isActive: boolean
}

export interface SalesCalcServiceLine {
  name: string
  unit: string
  unitPrice: number
  quantity: number
  discountPercent: number
}

export interface SalesCalcGoodsLine {
  description: string
  code: string
  customsValue: number
  currencyCode: string
  weightKg?: number | null
  quantity?: number | null
  engineVolumeCm3?: number | null
}

export interface SalesCalcServiceResult {
  name: string
  unit: string
  unitPrice: number
  quantity: number
  discountPercent: number
  total: number
}

export interface SalesCalcGoodsResult {
  description: string
  code: string
  codeName: string | null
  customsValueKzt: number
  importDutyKzt: number
  exciseKzt: number
  customsFeeKzt: number
  vatKzt: number
  tpinTotalKzt: number
  error: string | null
}

export interface SalesCalcResponse {
  services: SalesCalcServiceResult[]
  goods: SalesCalcGoodsResult[]
  servicesTotal: number
  tpinTotal: number
  grandTotal: number
}

export interface SalesQuoteListItem {
  id: string
  number: string
  year: number
  clientName: string
  status: number
  grandTotal: number
  createdByName: string
  createdAtUtc: string
}

export interface SalesQuoteDto {
  id: string
  number: string
  year: number
  clientName: string
  clientContact: string
  comment: string
  status: number
  servicesTotal: number
  tpinTotal: number
  grandTotal: number
  createdByName: string
  createdAtUtc: string
  serviceLines: SalesCalcServiceResult[]
  goodsLines: SalesCalcGoodsResult[]
}

export const SALES_QUOTE_STATUS = ['Черновик', 'Отправлено', 'Принято', 'Отклонено']

export const salesApi = {
  listServices: async (): Promise<SalesServiceItem[]> => {
    const response = await apiClient.get<SalesServiceItem[]>('/sales/services')
    return response.data
  },
  createService: async (data: Partial<SalesServiceItem>): Promise<SalesServiceItem> => {
    const response = await apiClient.post<SalesServiceItem>('/sales/services', data)
    return response.data
  },
  updateService: async (id: string, data: Partial<SalesServiceItem>): Promise<SalesServiceItem> => {
    const response = await apiClient.put<SalesServiceItem>(`/sales/services/${id}`, data)
    return response.data
  },
  deleteService: async (id: string): Promise<void> => {
    await apiClient.delete(`/sales/services/${id}`)
  },

  calculate: async (data: {
    services: SalesCalcServiceLine[]
    goods: SalesCalcGoodsLine[]
  }): Promise<SalesCalcResponse> => {
    const response = await apiClient.post<SalesCalcResponse>('/sales/calculate', data)
    return response.data
  },

  listQuotes: async (): Promise<SalesQuoteListItem[]> => {
    const response = await apiClient.get<SalesQuoteListItem[]>('/sales/quotes')
    return response.data
  },
  getQuote: async (id: string): Promise<SalesQuoteDto> => {
    const response = await apiClient.get<SalesQuoteDto>(`/sales/quotes/${id}`)
    return response.data
  },
  createQuote: async (data: {
    clientName: string
    clientContact?: string
    comment?: string
    services: SalesCalcServiceLine[]
    goods: SalesCalcGoodsLine[]
  }): Promise<SalesQuoteDto> => {
    const response = await apiClient.post<SalesQuoteDto>('/sales/quotes', data)
    return response.data
  },
  changeStatus: async (id: string, status: number): Promise<void> => {
    await apiClient.patch(`/sales/quotes/${id}/status`, { status })
  },
}
