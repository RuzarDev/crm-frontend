import apiClient from './client'
import type { ExtractionResultDto } from '@/types/api'

export const invoiceApi = {
  extractGoods: async (file: File): Promise<ExtractionResultDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<ExtractionResultDto>(
      '/invoice/extract',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },
}
