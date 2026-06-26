import apiClient from './client'
import type {
  ChangeDocumentPackageStatusRequest,
  CreateDocumentPackageRequest,
  DocumentPackageDto,
  DocumentPackageFileDto,
  DocumentPackageListResponse,
  DocumentPackageStatus,
  PartyAddress,
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

  createContainer: async (
    id: string,
    data: {
      containerNumber: string
      sealNumber?: string | null
      weight?: string | null
      wagonNumber?: string | null
      destinationStation?: string | null
      destinationCustomsAuthority?: string | null
      shipper?: PartyAddress | null
      consignee?: PartyAddress | null
    },
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.post<DocumentPackageDto>(
      `/document-packages/${id}/containers`,
      data,
    )
    return response.data
  },

  updateContainer: async (
    id: string,
    containerId: string,
    data: {
      containerNumber: string
      sealNumber?: string | null
      weight?: string | null
      wagonNumber?: string | null
      destinationStation?: string | null
      destinationCustomsAuthority?: string | null
      shipper?: PartyAddress | null
      consignee?: PartyAddress | null
    },
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.put<DocumentPackageDto>(
      `/document-packages/${id}/containers/${containerId}`,
      data
    )
    return response.data
  },

  deleteContainer: async (id: string, containerId: string): Promise<DocumentPackageDto> => {
    const response = await apiClient.delete<DocumentPackageDto>(
      `/document-packages/${id}/containers/${containerId}`
    )
    return response.data
  },

  createClientConsolidation: async (
    id: string,
    containerId: string,
    data: {
      clientName: string
      destinationStation?: string | null
      destinationCustomsAuthority?: string | null
      subcode?: string | null
      commodityCode?: string | null
      packagesCount?: string | null
      weight?: string | null
      shipper?: PartyAddress | null
      consignee?: PartyAddress | null
      goodsItems?: unknown[] | null
      doc44Items?: unknown[] | null
    },
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.post<DocumentPackageDto>(
      `/document-packages/${id}/containers/${containerId}/clients`,
      data,
    )
    return response.data
  },

  updateClientConsolidation: async (
    id: string,
    containerId: string,
    clientId: string,
    data: {
      clientName: string
      destinationStation?: string | null
      destinationCustomsAuthority?: string | null
      subcode?: string | null
      commodityCode?: string | null
      packagesCount?: string | null
      weight?: string | null
      shipper?: PartyAddress | null
      consignee?: PartyAddress | null
      goodsItems?: unknown[] | null
      doc44Items?: unknown[] | null
    },
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.put<DocumentPackageDto>(
      `/document-packages/${id}/containers/${containerId}/clients/${clientId}`,
      data
    )
    return response.data
  },

  deleteClientConsolidation: async (
    id: string,
    containerId: string,
    clientId: string,
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.delete<DocumentPackageDto>(
      `/document-packages/${id}/containers/${containerId}/clients/${clientId}`
    )
    return response.data
  },

  linkFile: async (
    id: string,
    fileId: string,
    data: { containerId: string | null; clientConsolidationId: string | null; documentType?: string | null },
  ): Promise<DocumentPackageDto> => {
    const response = await apiClient.patch<DocumentPackageDto>(
      `/document-packages/${id}/files/${fileId}/link`,
      data,
    )
    return response.data
  },

  generateRows: async (id: string): Promise<{ generatedRowsCount: number }> => {
    const response = await apiClient.post<{ generatedRowsCount: number }>(
      `/document-packages/${id}/generate-rows`,
    )
    return response.data
  },
}
