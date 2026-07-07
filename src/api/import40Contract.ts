import apiClient from './client'

export interface ClientCompanyProfileDto {
  clientId: string
  companyName: string
  bin: string
  directorName: string
  directorBasis: string
  legalAddress: string
  bank: string
  iik: string
  bik: string
  phone: string
  email: string
  isComplete: boolean
  updatedAtUtc: string | null
}

export type ClientCompanyProfileUpsert = Partial<
  Omit<ClientCompanyProfileDto, 'clientId' | 'isComplete' | 'updatedAtUtc'>
>

export interface SigexStartDto {
  qrCode: string
  eGovMobileLaunchLink: string
  eGovBusinessLaunchLink: string
  dataUrl: string
  qrId: string
  expireAt: number
}

export interface SigexPollDto {
  pending: boolean
  sign: string | null
}

export interface Import40ContractFileDto {
  id: string
  section: string
  originalFileName: string
  createdAtUtc: string
}

export interface Import40ContractDto {
  id: string
  clientId: string
  number: string
  year: number
  generatedAtUtc: string
  status: number // 0 Draft, 1 AwaitingSignature, 2 Active
  clientSigned: boolean
  clientSignedAtUtc: string | null
  providerSigned: boolean
  providerSignedAtUtc: string | null
  files: Import40ContractFileDto[]
}

export interface Import40DocumentFileDto {
  id: string
  section: string
  originalFileName: string
  createdAtUtc: string
}

export interface Import40DocumentDto {
  id: string
  clientId: string
  kind: 'contract' | 'poa'
  number: string
  year: number
  generatedAtUtc: string
  status: number // 0 Draft, 1 AwaitingSignature, 2 Active
  clientSigned: boolean
  clientSignedAtUtc: string | null
  providerSigned: boolean
  providerSignedAtUtc: string | null
  isSingleUse: boolean
  validUntilUtc: string | null
  consumedByCaseId: string | null
  files: Import40DocumentFileDto[]
}

export interface Import40DocumentGenerateRequest {
  kind: 'contract' | 'poa'
  isSingleUse: boolean
  validUntilUtc?: string | null
}

const base = (clientId: string) => `/import40/company/${encodeURIComponent(clientId)}`

export const import40ContractApi = {
  getProfile: async (clientId: string): Promise<ClientCompanyProfileDto> => {
    const response = await apiClient.get<ClientCompanyProfileDto>(`${base(clientId)}/profile`)
    return response.data
  },

  saveProfile: async (
    clientId: string,
    data: ClientCompanyProfileUpsert,
  ): Promise<ClientCompanyProfileDto> => {
    const response = await apiClient.put<ClientCompanyProfileDto>(`${base(clientId)}/profile`, data)
    return response.data
  },

  getContract: async (clientId: string): Promise<Import40ContractDto | null> => {
    const response = await apiClient.get<Import40ContractDto | null>(`${base(clientId)}/contract`)
    return response.data
  },

  generate: async (clientId: string): Promise<Import40ContractDto> => {
    const response = await apiClient.post<Import40ContractDto>(`${base(clientId)}/contract/generate`)
    return response.data
  },

  download: async (clientId: string): Promise<Blob> => {
    const response = await apiClient.get(`${base(clientId)}/contract/download`, {
      responseType: 'blob',
    })
    return response.data
  },

  sign: async (
    clientId: string,
    side: 'client' | 'provider',
    file: File,
  ): Promise<Import40ContractDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Import40ContractDto>(
      `${base(clientId)}/contract/sign`,
      formData,
      { params: { side }, headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return response.data
  },

  sigexStartSigning: async (clientId: string): Promise<SigexStartDto> => {
    const response = await apiClient.post<SigexStartDto>(`${base(clientId)}/contract/sigex/start-signing`)
    return response.data
  },

  sigexPoll: async (clientId: string, qrId: string): Promise<SigexPollDto> => {
    const response = await apiClient.get<SigexPollDto>(
      `${base(clientId)}/contract/sigex/${encodeURIComponent(qrId)}/poll`,
    )
    return response.data
  },

  sigexComplete: async (
    clientId: string,
    qrId: string,
    side: 'client' | 'provider',
  ): Promise<Import40ContractDto> => {
    const response = await apiClient.post<Import40ContractDto>(
      `${base(clientId)}/contract/sigex/${encodeURIComponent(qrId)}/complete`,
      { side },
    )
    return response.data
  },

  downloadSignedFile: async (clientId: string, fileId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `${base(clientId)}/contract/files/${encodeURIComponent(fileId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  // ───────── документы (договор + доверенность) — общая машинерия ─────────

  listDocuments: async (
    clientId: string,
    kind?: 'contract' | 'poa',
  ): Promise<Import40DocumentDto[]> => {
    const response = await apiClient.get<Import40DocumentDto[]>(`${base(clientId)}/documents`, {
      params: kind ? { kind } : undefined,
    })
    return response.data
  },

  generateDocument: async (
    clientId: string,
    data: Import40DocumentGenerateRequest,
  ): Promise<Import40DocumentDto> => {
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/generate`,
      data,
    )
    return response.data
  },

  signDocument: async (
    clientId: string,
    docId: string,
    side: 'client' | 'provider',
    file: File,
  ): Promise<Import40DocumentDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sign`,
      formData,
      { params: { side }, headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return response.data
  },

  downloadDocument: async (clientId: string, docId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  sigexStartSigningDocument: async (clientId: string, docId: string): Promise<SigexStartDto> => {
    const response = await apiClient.post<SigexStartDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/start-signing`,
    )
    return response.data
  },

  sigexPollDocument: async (clientId: string, docId: string, qrId: string): Promise<SigexPollDto> => {
    const response = await apiClient.get<SigexPollDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/${encodeURIComponent(qrId)}/poll`,
    )
    return response.data
  },

  sigexCompleteDocument: async (
    clientId: string,
    docId: string,
    qrId: string,
    side: 'client' | 'provider',
  ): Promise<Import40DocumentDto> => {
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/${encodeURIComponent(qrId)}/complete`,
      { side },
    )
    return response.data
  },
}
