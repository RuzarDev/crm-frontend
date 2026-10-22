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
        // скан или фото инвойса распознаётся OCR в Zircon AI (до ~170 с), сервер ждёт 200 с, nginx 210 с —
        // 30 с по умолчанию обрывали разбор, а сервер всё равно его доделывал (пакет «ocr», ревью 22.10)
        timeout: 220000,
      },
    )
    return response.data
  },
}
