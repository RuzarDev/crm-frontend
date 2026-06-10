export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterClientRequest {
  username: string
  password: string
  expeditorId: string
}

export interface ExpeditorOption {
  id: string
  username: string
}

export interface LoginResponse {
  accessToken: string
  expiresAtUtc: string
  role: string
  businessRole: string
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
  InProgress: 0,
  Submitted: 1,
  Released: 2,
  ConditionallyReleased: 3,
  Problematic: 4,
  Rejected: 5,
  Withdrawn: 6,
  Archived: 7,
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
  customsPost?: string | null
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
  clientId: string
  createdByUserId?: string | null
  createdByRole?: string | null
}

export interface ReestrEntry {
  id: string
  createdAtUtc: string
  status: ReestrEntryStatus
  clientId: string
  data: Record<string, string | null>
}

export interface ReestrUpsertBody {
  rowNumber?: string | null
  documentDate?: string | null
  container?: string | null
  consignee?: string | null
  destinationStation?: string | null
  customsPost?: string | null
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
  clientId: string
}

export interface ChangeReestrEntryStatusRequest {
  status: ReestrEntryStatus
}

export interface ReestrListRequest {
  page?: number
  pageSize?: number
  search?: string
  status?: ReestrEntryStatus | null
  clientId?: string | null
  documentDateFrom?: string | null
  documentDateTo?: string | null
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

export type ReestrDocumentSection = 'client' | 'broker'

export const ReestrBrokerDocumentType = {
  CustomsDeclaration: 0,
  ConformityCertificates: 1,
  PermitsAndLicenses: 2,
  Other: 3,
} as const

export type ReestrBrokerDocumentType =
  (typeof ReestrBrokerDocumentType)[keyof typeof ReestrBrokerDocumentType]

export interface ReestrDocumentDto {
  id: string
  reestrEntryId: string
  section: ReestrDocumentSection
  brokerDocumentType: ReestrBrokerDocumentType | null
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedByUserId: string
  uploadedByRole: string
  createdAtUtc: string
}

export type MyReestrDocumentListItem = {
  id: string
  reestrEntryId: string
  container: string | null
  reestrStatus: ReestrEntryStatus
  section: ReestrDocumentSection
  originalFileName: string
  contentType: string
  sizeBytes: number
  createdAtUtc: string
}

export interface MyReestrDocumentsListRequest {
  page?: number
  pageSize?: number
  section?: ReestrDocumentSection | null
  search?: string
}

export interface MyReestrDocumentsListResponse {
  items: MyReestrDocumentListItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ReestrClientOption {
  id: string
  username: string
  declarationCount: number
}

export interface ReestrStatusHistoryDto {
  id: string
  oldStatus: ReestrEntryStatus | null
  newStatus: ReestrEntryStatus
  changedByUserId: string
  changedByRole: string
  changedByUsername: string | null
  changedAtUtc: string
}

export type DocumentPackageStatus = 'uploaded' | 'accepted' | 'needsFix' | 'processed'

export interface DocumentPackageFileDto {
  id: string
  packageId: string
  containerId?: string | null
  clientConsolidationId?: string | null
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedByUserId: string
  uploadedAtUtc: string
}

export interface DocumentPackageClientConsolidationDto {
  id: string
  containerId: string
  clientName: string
  cargoDescription: string | null
  shipper?: string | null
  consignee?: string | null
  destinationStation?: string | null
  customsPost?: string | null
  subcode?: string | null
  commodityCode?: string | null
  packagesCount?: string | null
  weight?: string | null
}

export interface DocumentPackageContainerDto {
  id: string
  packageId: string
  containerNumber: string
  sealNumber: string | null
  weight: string | null
  shipper?: string | null
  consignee?: string | null
  destinationStation?: string | null
  customsPost?: string | null
  consolidations: DocumentPackageClientConsolidationDto[]
}

export interface DocumentPackageDto {
  id: string
  trainNumber: string
  comment: string | null
  status: DocumentPackageStatus
  createdByExpeditorId: string
  createdByExpeditorUsername: string
  createdAtUtc: string
  updatedAtUtc: string
  reviewedByUserId: string | null
  reviewedAtUtc: string | null
  reviewComment: string | null
  files: DocumentPackageFileDto[]
  containers: DocumentPackageContainerDto[]
}

export interface DocumentPackageListResponse {
  items: DocumentPackageDto[]
  totalCount: number
}

export interface CreateDocumentPackageRequest {
  trainNumber: string
  comment?: string | null
  containerNumbers?: string[]
}

export interface ChangeDocumentPackageStatusRequest {
  status: DocumentPackageStatus
  reviewComment?: string | null
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

export interface RefItem {
  id: string
  name: string
  isActive: boolean
}

export interface AppNotification {
  id: string
  title: string
  body: string
  reestrEntryId: string | null
  isRead: boolean
  createdAtUtc: string
}
