import apiClient from './client'

export type Import40Action =
  | 'submit-calculation'
  | 'approve-offer'
  | 'accept-offer'
  | 'sign-contract'
  | 'generate-power-of-attorney'
  | 'return-power-of-attorney'
  | 'photo-control'
  | 'submit-declaration'
  | 'release-declaration'
  | 'upload-svh-invoice'
  | 'confirm-payment'
  | 'verify-payment'
  | 'upload-closed-declaration'

export interface Import40LogDto {
  id: string
  createdAtUtc: string
  text: string
  changedByBusinessRole: string
}

export interface Import40CaseDto {
  id: string
  createdAtUtc: string
  updatedAtUtc: string
  clientId: string
  clientName: string
  clientType: 'Одноразовый' | 'Постоянный'
  cargo: string
  post: string
  manager: string
  declarant: string
  status: number
  corridor: 'green' | 'yellow' | 'blue' | 'red'
  costCalculation: string
  riskNote: string
  vehicleNumber: string
  driverName: string
  driverPhone: string
  transportType: string
  svhInvoice: string
  paymentCheck: string
  declarationNumber: string
  finalDeclarationFile: string
  powerOfAttorneyGenerated: boolean
  powerOfAttorneyReturned: boolean
  controlPhotosCount: number
  closedDeclarationUploaded: boolean
  ropApproved: boolean
  clientAcceptedOffer: boolean
  contractSigned: boolean
  svhPaymentConfirmed: boolean
  logs: Import40LogDto[]
}

export interface Import40ListResponse {
  items: Import40CaseDto[]
}

export type Import40FileSection =
  | 'photo'
  | 'svh-invoice'
  | 'payment-check'
  | 'closed-declaration'
  | 'offer'
  | 'contract'
  | 'power-of-attorney'

export interface Import40FileDto {
  id: string
  section: Import40FileSection
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedByBusinessRole: string
  createdAtUtc: string
}

export interface Import40CreateRequest {
  clientId: string
  clientName: string
  clientType: 'Одноразовый' | 'Постоянный'
  cargo: string
  post: string
  manager: string
}

export type Import40UpdateRequest = Partial<
  Pick<
    Import40CaseDto,
    | 'clientName'
    | 'clientType'
    | 'cargo'
    | 'post'
    | 'manager'
    | 'declarant'
    | 'corridor'
    | 'costCalculation'
    | 'riskNote'
    | 'vehicleNumber'
    | 'driverName'
    | 'driverPhone'
    | 'transportType'
    | 'svhInvoice'
    | 'paymentCheck'
    | 'declarationNumber'
    | 'finalDeclarationFile'
  >
>

export const import40Api = {
  list: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40')
    return response.data.items
  },

  get: async (id: string): Promise<Import40CaseDto> => {
    const response = await apiClient.get<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`)
    return response.data
  },

  create: async (data: Import40CreateRequest): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>('/import40', data)
    return response.data
  },

  update: async (id: string, data: Import40UpdateRequest): Promise<Import40CaseDto> => {
    const response = await apiClient.patch<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`, data)
    return response.data
  },

  action: async (id: string, action: Import40Action, value?: string): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/actions/${action}`,
      { value: value ?? null },
    )
    return response.data
  },

  listClients: async (): Promise<{ id: string; username: string }[]> => {
    const response = await apiClient.get<{ id: string; username: string }[]>('/import40/clients')
    return response.data
  },

  listFiles: async (id: string): Promise<Import40FileDto[]> => {
    const response = await apiClient.get<Import40FileDto[]>(
      `/import40/${encodeURIComponent(id)}/files`,
    )
    return response.data
  },

  uploadFile: async (
    id: string,
    section: Import40FileSection,
    file: File,
  ): Promise<Import40FileDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Import40FileDto>(
      `/import40/${encodeURIComponent(id)}/files`,
      formData,
      {
        params: { section },
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },

  downloadFile: async (id: string, fileId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `/import40/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  deleteFile: async (id: string, fileId: string): Promise<void> => {
    await apiClient.delete(
      `/import40/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
    )
  },
}
