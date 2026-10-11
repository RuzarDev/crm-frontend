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
  legalCountryCode: string | null
  legalRegion: string | null
  legalCity: string | null
  legalStreet: string | null
  kbe: string | null
  okpo: string | null
  ownershipType: string | null
  contactPersonName: string | null
  contactPersonPosition: string | null
  contactPhone: string | null
  contactEmail: string | null
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
  // 'egov' — ЭЦП через eGov/Sigex, 'upload' — загружен подписанный файл, null — не подписано
  clientSignMethod: string | null
  providerSignMethod: string | null
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

// документ считается ДЕЙСТВУЮЩИМ, если он активен, не истёк по сроку
// и (для разовых) ещё не израсходован на заявку
// «Действующий» без учёта расхода разовой: подписан и не истёк. Для статуса онбординга —
// разовая доверенность, уже использованная заявкой, всё равно означает, что онбординг пройден.
export const isDocumentActive = (doc: Import40DocumentDto | null | undefined): boolean => {
  if (!doc) return false
  if (doc.status !== 2) return false
  if (doc.validUntilUtc && new Date(doc.validUntilUtc).getTime() <= Date.now()) return false
  return true
}

export const isDocumentEffective = (doc: Import40DocumentDto | null | undefined): boolean => {
  if (!doc) return false
  if (doc.status !== 2) return false
  if (doc.validUntilUtc && new Date(doc.validUntilUtc).getTime() <= Date.now()) return false
  if (doc.isSingleUse && doc.consumedByCaseId) return false
  return true
}

const base = (clientId: string) => `/import40/company/${encodeURIComponent(clientId)}`

export const import40ContractApi = {
  // opts.silent — «Моя компания» клиента и «Компания клиента» сотрудника сами показывают ошибку на месте, без тоста перехватчика.
  getProfile: async (clientId: string, opts?: { silent?: boolean }): Promise<ClientCompanyProfileDto> => {
    const response = await apiClient.get<ClientCompanyProfileDto>(`${base(clientId)}/profile`, opts?.silent ? { silent: true } : undefined)
    return response.data
  },

  saveProfile: async (
    clientId: string,
    data: ClientCompanyProfileUpsert,
    opts?: { silent?: boolean },
  ): Promise<ClientCompanyProfileDto> => {
    const response = await apiClient.put<ClientCompanyProfileDto>(`${base(clientId)}/profile`, data, opts?.silent ? { silent: true } : undefined)
    return response.data
  },

  // ───────── документы (договор + доверенность) — общая машинерия ─────────

  listDocuments: async (
    clientId: string,
    kind?: 'contract' | 'poa',
    opts?: { silent?: boolean },
  ): Promise<Import40DocumentDto[]> => {
    const response = await apiClient.get<Import40DocumentDto[]>(`${base(clientId)}/documents`, {
      params: kind ? { kind } : undefined,
      ...(opts?.silent ? { silent: true } : {}),
    })
    return response.data
  },

  generateDocument: async (
    clientId: string,
    data: Import40DocumentGenerateRequest,
    opts?: { silent?: boolean },
  ): Promise<Import40DocumentDto> => {
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/generate`,
      data,
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  signDocument: async (
    clientId: string,
    docId: string,
    side: 'client' | 'provider',
    file: File,
    opts?: { silent?: boolean },
  ): Promise<Import40DocumentDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sign`,
      formData,
      { params: { side }, headers: { 'Content-Type': 'multipart/form-data' }, ...(opts?.silent ? { silent: true } : {}) },
    )
    return response.data
  },

  // Отзыв документа (админ): перестаёт быть действующим, привязка к открытым заявкам снимается.
  revokeDocument: async (clientId: string, docId: string, opts?: { silent?: boolean }): Promise<Import40DocumentDto> =>
    (await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/revoke`,
      {},
      opts?.silent ? { silent: true } : undefined,
    )).data,
  downloadDocument: async (clientId: string, docId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  // Подписанный файл (ЭЦП-контейнер или скан), приложенный к документу.
  downloadDocumentSignedFile: async (clientId: string, docId: string, fileId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/files/${encodeURIComponent(fileId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  sigexStartSigningDocument: async (clientId: string, docId: string): Promise<SigexStartDto> => {
    const response = await apiClient.post<SigexStartDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/start-signing`,
      undefined,
      { silent: true },
    )
    return response.data
  },

  sigexPollDocument: async (clientId: string, docId: string, qrId: string): Promise<SigexPollDto> => {
    const response = await apiClient.get<SigexPollDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/${encodeURIComponent(qrId)}/poll`,
      { silent: true },
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
      { silent: true },
    )
    return response.data
  },
}
