import apiClient from './client'
import type {
  ChangeDocumentPackageStatusRequest,
  CreateDocumentPackageRequest,
  DocumentPackageDto,
  DocumentPackageFileDto,
  DocumentPackageListResponse,
  DocumentPackageStatus,
} from '@/types/api'

export const documentPackagesApi = {
  list: async (params?: {
    search?: string
    status?: DocumentPackageStatus | null
  }): Promise<DocumentPackageListResponse> => {
    const response = await apiClient.get<DocumentPackageListResponse>('/document-packages', {
      params: {
        ...(params?.search ? { search: params.search } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
    })
    return response.data
  },

  getById: async (id: string): Promise<DocumentPackageDto> => {
    const response = await apiClient.get<DocumentPackageDto>(`/document-packages/${id}`)
    return response.data
  },

  create: async (data: CreateDocumentPackageRequest): Promise<DocumentPackageDto> => {
    const response = await apiClient.post<DocumentPackageDto>('/document-packages', data)
    return response.data
  },

  uploadFile: async (id: string, file: File): Promise<DocumentPackageFileDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<DocumentPackageFileDto>(
      `/document-packages/${id}/files`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    return response.data
  },

  downloadFile: async (id: string, fileId: string): Promise<Blob> => {
    const response = await apiClient.get(`/document-packages/${id}/files/${fileId}/download`, {
      responseType: 'blob',
    })
    return response.data
  },

  deleteFile: async (id: string, fileId: string): Promise<void> => {
    await apiClient.delete(`/document-packages/${id}/files/${fileId}`)
  },

  changeStatus: async (
    id: string,
    data: ChangeDocumentPackageStatusRequest,
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.patch<DocumentPackageDto>(
      `/document-packages/${id}/status`,
      data,
    )
    return response.data
  },
}
