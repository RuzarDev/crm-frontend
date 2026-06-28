import apiClient from './client'
import type { ReestrGoodsItemInput, ReestrDoc44ItemInput } from '@/types/api'

export type Import40Action =
  | 'submit-for-processing'
  | 'border-passed'
  | 'submit-declaration'
  | 'release-declaration'
  | 'close-svh'
  | 'issue-invoice'
  | 'confirm-payment'
  | 'complete'
  | 'set-problem'
  | 'clear-problem'

// Статусы заявки (совпадают с Import40Status на бэке)
export const IMPORT40_STATUSES = [
  { id: 0, key: 'Draft', short: 'Новая', phase: 'Заявка' },
  { id: 1, key: 'AtBorder', short: 'На границе', phase: 'КПП' },
  { id: 2, key: 'Declaring', short: 'Декларирование', phase: 'Декларант' },
  { id: 3, key: 'Submitted', short: 'ДТ подана', phase: 'Декларант' },
  { id: 4, key: 'Released', short: 'ДТ выпущена', phase: 'Декларант' },
  { id: 5, key: 'SvhClosing', short: 'Закрытие СВХ', phase: 'КПП' },
  { id: 6, key: 'Invoiced', short: 'Счёт выставлен', phase: 'Финансы' },
  { id: 7, key: 'Paid', short: 'Оплата получена', phase: 'Финансы' },
  { id: 8, key: 'Done', short: 'Выполнено', phase: 'Архив' },
] as const

export interface Import40LogDto {
  id: string
  createdAtUtc: string
  text: string
  changedByBusinessRole: string
}

export interface Import40Party {
  name?: string | null
  countryCode?: string | null
  region?: string | null
  city?: string | null
  street?: string | null
}

export interface Import40GoodsItemDto {
  id: string
  sortOrder: number
  description?: string | null
  tnvedCode?: string | null
  tnvedDescription?: string | null
  countryOfOrigin?: string | null
  quantity?: number | null
  unit?: string | null
  unitCode?: string | null
  grossWeightKg?: number | null
  netWeightKg?: number | null
  packagesCount?: number | null
  quantityTypeCode?: string | null
  customsValue?: number | null
  currency?: string | null
  procedureCode?: string | null
  dutyAmount?: number | null
  vatAmount?: number | null
  feesAmount?: number | null
}

export interface Import40Doc44ItemDto {
  id: string
  sortOrder: number
  docTypeCode?: string | null
  docTypeName?: string | null
  docNumber?: string | null
  docDate?: string | null
}

export interface Import40DeclarationDto {
  id: string
  caseId: string
  declarationNumber: string
  corridor: string
  procedureCode: string
  sender?: Import40Party | null
  receiver?: Import40Party | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  svhCost?: number | null
  releasedAtUtc?: string | null
  goodsItems: Import40GoodsItemDto[]
  doc44Items: Import40Doc44ItemDto[]
}

export interface Import40DeclarationUpsert {
  declarationNumber?: string | null
  corridor?: string | null
  procedureCode?: string | null
  sender?: Import40Party | null
  receiver?: Import40Party | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  svhCost?: number | null
  goodsItems?: ReestrGoodsItemInput[]
  doc44Items?: ReestrDoc44ItemInput[]
}

export const IMPORT40_TRANSPORT_MODES: { value: number; label: string }[] = [
  { value: 0, label: 'ЖД' },
  { value: 1, label: 'Авто' },
  { value: 2, label: 'Авиа' },
  { value: 3, label: 'Море' },
]

export interface Import40ContainerDto {
  id: string
  containerNumber: string
  containerType: string
  notes: string
}

export interface Import40CaseDto {
  id: string
  createdAtUtc: string
  updatedAtUtc: string
  clientId: string
  clientName: string
  cargo: string
  post: string
  status: number
  isProblem: boolean
  problemNote: string
  assignedKppId: string | null
  assignedDeclarantId: string | null
  vehicleNumber: string
  driverName: string
  driverPhone: string
  powerOfAttorneyGenerated: boolean
  powerOfAttorneyReturned: boolean
  svhInvoiceNote: string
  svhClosed: boolean
  paymentConfirmed: boolean
  transportMode: number
  wagonNumber: string
  station: string
  trailerNumber: string
  flightNumber: string
  airWaybill: string
  vesselName: string
  billOfLading: string
  containers: Import40ContainerDto[]
  declarations: Import40DeclarationDto[]
  logs: Import40LogDto[]
}

export interface Import40ListResponse {
  items: Import40CaseDto[]
}

export type Import40FileSection =
  | 'documents'
  | 'power-of-attorney'
  | 'svh-invoice'
  | 'payment-check'
  | 'declaration-stamp'

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
  cargo: string
  post: string
}

export interface Import40UpdateRequest {
  cargo?: string
  post?: string
  vehicleNumber?: string
  driverName?: string
  driverPhone?: string
  svhInvoiceNote?: string
  assignedKppId?: string | null
  assignedDeclarantId?: string | null
  transportMode?: number
  wagonNumber?: string
  station?: string
  trailerNumber?: string
  flightNumber?: string
  airWaybill?: string
  vesselName?: string
  billOfLading?: string
}

export interface Import40ContainerUpsertRequest {
  containerNumber: string
  containerType?: string
  notes?: string
}

export const import40Api = {
  list: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40')
    return response.data.items
  },

  myTasks: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40/my-tasks')
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
    const response = await apiClient.put<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`, data)
    return response.data
  },

  action: async (id: string, action: Import40Action, value?: string): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/actions/${action}`,
      { value: value ?? null },
    )
    return response.data
  },

  addContainer: async (
    id: string,
    data: Import40ContainerUpsertRequest,
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers`,
      data,
    )
    return response.data
  },

  updateContainer: async (
    id: string,
    containerId: string,
    data: Import40ContainerUpsertRequest,
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.put<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}`,
      data,
    )
    return response.data
  },

  deleteContainer: async (id: string, containerId: string): Promise<Import40CaseDto> => {
    const response = await apiClient.delete<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}`,
    )
    return response.data
  },

  createDeclaration: async (
    caseId: string,
    data: Import40DeclarationUpsert,
  ): Promise<Import40DeclarationDto> => {
    const response = await apiClient.post<Import40DeclarationDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations`,
      data,
    )
    return response.data
  },

  updateDeclaration: async (
    caseId: string,
    declarationId: string,
    data: Import40DeclarationUpsert,
  ): Promise<Import40DeclarationDto> => {
    const response = await apiClient.put<Import40DeclarationDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}`,
      data,
    )
    return response.data
  },

  deleteDeclaration: async (caseId: string, declarationId: string): Promise<void> => {
    await apiClient.delete(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}`,
    )
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
