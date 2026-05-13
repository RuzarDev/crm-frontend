export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterClientRequest {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  expiresAtUtc: string
  role: string
  permissions: string[]
}

export interface BulkDeleteResponse {
  deleted: number
}

export interface CatalogLinkedPerson {
  id: string
  username: string
  role: string
}

export interface CatalogAdministratorRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
}

export interface CatalogBrokerRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export interface CatalogClientRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
  brokers: CatalogLinkedPerson[]
  expeditors: CatalogLinkedPerson[]
}

export interface CatalogExpeditorRow {
  id: string
  username: string
  role: string
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export type CatalogTabKey = 'administrators' | 'brokers' | 'clients' | 'expeditors'

export type CatalogTableRow =
  | CatalogAdministratorRow
  | CatalogBrokerRow
  | CatalogClientRow
  | CatalogExpeditorRow

export interface LinkUsersRequest {
  staffUserId: string
  clientUserId: string
}

export interface EditBrokerRequest {
  username: string | null
  clientIds: string[]
}

export interface EditExpeditorRequest {
  username: string
  clientsId: string[]
}

export const REESTR_COLUMN_KEYS = [
  '№',
  'Дата',
  'Контейнер',
  'Получатель',
  'Станция назначения',
  'Отправитель',
  'Отправка',
  'Груз',
  'Подкод',
  'Код ТНВЭД',
  'Количество мест',
  'Вес',
  'ТД',
  'Кол-во ТД',
  'Цена одной ТД, с НДС',
  'Количество доп.листов',
  'Цена одного доп.листа, с НДС',
  'Всего, ДЛ с НДС',
  'Итого, с НДС',
] as const

export type ReestrColumnKey = (typeof REESTR_COLUMN_KEYS)[number]

/** CRM.API.Entities.ReestrEntryStatus */
export const ReestrEntryStatus = {
  Release: 0,
  Problematic: 1,
  InspectionNotice: 2,
  InspectionAct: 3,
  SubmittedToCustoms: 4,
  PendingClarification: 5,
  Exit: 6,
  Abbreviated: 7,
} as const

export type ReestrEntryStatus = (typeof ReestrEntryStatus)[keyof typeof ReestrEntryStatus]

export interface ReestrEntryDto {
  id: string
  createdAtUtc: string
  rowNumber: string | null
  documentDate: string | null
  container: string | null
  consignee: string | null
  destinationStation: string | null
  shipper: string | null
  shipmentInfo: string | null
  cargoDescription: string | null
  subcode: string | null
  commodityCode: string | null
  packagesCount: number | null
  weightKg: number | null
  customsDeclarationNumber: string | null
  customsDeclarationCount: number | null
  pricePerDeclarationWithVat: number | null
  supplementalSheetsCount: number | null
  pricePerSupplementalSheetWithVat: number | null
  supplementalSheetsTotalWithVat: number | null
  grandTotalWithVat: number | null
  status: string | ReestrEntryStatus
}

export interface ReestrEntry {
  id: string
  createdAtUtc: string
  status: ReestrEntryStatus
  data: Record<string, string | null>
}

export interface ReestrUpsertBody {
  rowNumber?: string | null
  documentDate?: string | null
  container?: string | null
  consignee?: string | null
  destinationStation?: string | null
  shipper?: string | null
  shipmentInfo?: string | null
  cargoDescription?: string | null
  subcode?: string | null
  commodityCode?: string | null
  packagesCount?: number | null
  weightKg?: number | null
  customsDeclarationNumber?: string | null
  customsDeclarationCount?: number | null
  pricePerDeclarationWithVat?: number | null
  supplementalSheetsCount?: number | null
  pricePerSupplementalSheetWithVat?: number | null
  supplementalSheetsTotalWithVat?: number | null
  grandTotalWithVat?: number | null
  status: ReestrEntryStatus
}

export interface ChangeReestrEntryStatusRequest {
  status: ReestrEntryStatus
}

export interface ReestrListRequest {
  page?: number
  pageSize?: number
  search?: string
  status?: ReestrEntryStatus | null
  sortBy?: string | null
  sortDescending?: boolean
}

export interface ReestrListResponse {
  items: ReestrEntry[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}


export interface ImportResponse {
  imported: number
  fileName?: string
}

export interface RoleItem {
  name: string
  permissions: string[]
}

export interface CreateRoleRequest {
  name: string
  permissions: string[]
}

export interface UpdateRolePermissionsRequest {
  permissions: string[]
}

export interface RegisterRequest {
  username: string
  password: string
  role: string
}
