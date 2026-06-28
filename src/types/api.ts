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
  businessRole: string
  createdAtUtc: string
}

export interface CatalogBrokerRow {
  id: string
  username: string
  role: string
  businessRole: string
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

export interface CatalogImporterRow {
  id: string
  username: string
  role: string
  businessRole: string
  createdAtUtc: string
}

export interface CatalogSalespersonRow {
  id: string
  username: string
  role: string
  businessRole: string
  createdAtUtc: string
}

export type CatalogTabKey = 'administrators' | 'brokers' | 'clients' | 'expeditors' | 'importers' | 'salespersons'

export type CatalogTableRow =
  | CatalogAdministratorRow
  | CatalogBrokerRow
  | CatalogClientRow
  | CatalogExpeditorRow
  | CatalogImporterRow
  | CatalogSalespersonRow

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
  'Количество доп.листов',
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

export interface TnvedDeprecationWarningDto {
  deprecatedCode: string
  replacementCodes: string[]
  sourceVersion: string | null
}

export interface TnvedNodeDto {
  id: number
  code: string
  treeName: string
  name: string
  parentId: number | null
  is10: boolean
  isLast: boolean
  unitShort: string | null
  nodeLevel: number
}

export interface TnvedTransitionDto {
  oldCode: string
  newCodes: string[]
  isDeprecated: boolean
  sourceVersion: string | null
  effectiveDate: string | null
}

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
  sealNumber?: string | null
  packagingType?: string | null
  goodsItems?: ReestrGoodsItemDto[] | null
  doc44Items?: ReestrDoc44ItemDto[] | null
  deprecationWarning?: TnvedDeprecationWarningDto | null
}

export interface ReestrEntry {
  id: string
  createdAtUtc: string
  status: ReestrEntryStatus
  clientId: string
  data: Record<string, string | null>
  deprecationWarning?: TnvedDeprecationWarningDto | null
  goods: ReestrGoodsItemInput[]
  doc44: ReestrDoc44ItemInput[]
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
  sealNumber?: string | null
  packagingType?: string | null
  status: ReestrEntryStatus
  clientId: string
  goodsItems?: ReestrGoodsItemInput[] | null
  doc44Items?: ReestrDoc44ItemInput[] | null
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

export type ClientReestrDocumentType = 'invoice' | 'packingList' | 'cmr' | 'other'

export interface ReestrDocumentDto {
  id: string
  reestrEntryId: string
  section: ReestrDocumentSection
  brokerDocumentType: ReestrBrokerDocumentType | null
  clientDocumentType: ClientReestrDocumentType | null
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
  documentType?: string | null
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedByUserId: string
  uploadedAtUtc: string
}

export interface PartyAddress {
  name?: string | null
  countryCode?: string | null
  region?: string | null
  city?: string | null
  street?: string | null
  house?: string | null
  office?: string | null
}

export interface DocumentPackageConsolidationGoodsItemDto {
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
}

export interface DocumentPackageConsolidationDoc44ItemDto {
  id: string
  sortOrder: number
  docTypeCode?: string | null
  docTypeName?: string | null
  docNumber?: string | null
  docDate?: string | null
}

export interface DocumentPackageClientConsolidationDto {
  id: string
  containerId: string
  clientName: string
  destinationStation?: string | null
  destinationCustomsAuthority?: string | null
  subcode?: string | null
  commodityCode?: string | null
  packagesCount?: string | null
  weight?: string | null
  sealNumber?: string | null
  shipper?: PartyAddress | null
  consignee?: PartyAddress | null
  goodsItems: DocumentPackageConsolidationGoodsItemDto[]
  doc44Items: DocumentPackageConsolidationDoc44ItemDto[]
}

export interface DocumentPackageContainerDto {
  id: string
  packageId: string
  containerNumber: string
  secondaryContainerNumber?: string | null
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

export interface ExtractionHeaderValuesDto {
  consignee: string | null
  shipper: string | null
  currencyCode: string | null
}

export interface ExtractionItemValuesDto {
  commodityCode: string | null
  customsValue: number | null
  weightKg: number | null
  quantity: number | null
}

export interface TnvedDeprecationWarningDto {
  deprecatedCode: string
  replacementCodes: string[]
  sourceVersion: string | null
}

export interface ExtractionItemSuggestionDto extends ExtractionItemValuesDto {
  commodityCodeDeprecation: TnvedDeprecationWarningDto | null
}

export type DocumentExtractionStatus =
  | 'queued'
  | 'templateHit'
  | 'awaitingAiConfirmation'
  | 'needsManualEntry'
  | 'applied'
  | 'error'

export type ExtractionMatchResult =
  | 'templateHitClientSpecific'
  | 'templateHitGlobal'
  | 'miss'
  | 'notDigital'
  | 'error'
  | 'nonDigitalAi'

export interface ExtractionResultDto {
  status: DocumentExtractionStatus
  matchResult: ExtractionMatchResult
  aiUsed: boolean
  confidence: number | null
  source: 'template' | 'ai'
  header: ExtractionHeaderValuesDto
  items: ExtractionItemSuggestionDto[]
  runId: string
}

export interface ApplyExtractionRequest {
  header: ExtractionHeaderValuesDto
  items: ExtractionItemValuesDto[]
}

export interface AppliedEntryDto {
  entry: ReestrEntryDto
  customsValue: number | null
  currencyCode: string | null
}

export interface ApplyExtractionResponse {
  entries: AppliedEntryDto[]
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
  businessRole?: string
}

export interface RefItem {
  id: string
  name: string
  isActive: boolean
}

export interface RefCodeItem {
  id: string
  code: string
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

// ── TNVED extended types ──────────────────────────────────────────────────────

export interface TnvedPathNodeDto {
  id: number
  code: string
  treeName: string
  nodeLevel: number
}

export interface TnvedRateDto {
  code: string
  treeName: string | null
  rateStr: string | null
  rateSourceName: string | null
  rateSourceUrl: string | null
  vtoStatus: string | null
  unitCode: string | null
  unitName: string | null
  updatedAtUtc: string | null
}

export interface TnvedGroupDto {
  code: string
  name: string
}

export interface TnvedSuggestDto {
  suggestions: string[]
  group: TnvedGroupDto | null
}

export interface TnvedClassifyMatch {
  code: string
  description: string
  probability: number
  rateStr: string | null
  unitName: string | null
}

export interface TnvedClassifyResponse {
  matches: TnvedClassifyMatch[]
  exactCodeInfo: TnvedRateDto | null
  suggestedGroup: TnvedGroupDto | null
}

export interface TnvedCalculateRequest {
  code: string
  customsValue: number
  currencyCode: string
  weightKg?: number | null
  quantity?: number | null
  engineVolumeCm3?: number | null
  onDate?: string | null
}

export interface TnvedCalculateResult {
  code: string
  codeName: string | null
  rateStr: string | null
  customsValueKzt: number
  importDutyKzt: number
  customsFeeKzt: number
  exciseKzt: number
  vatKzt: number
  totalKzt: number
  notes: string | null
  explanation: string | null
  nonTariffMeasures: TnvedNonTariffMeasureDto[]
}

export interface TnvedNonTariffMeasureDto {
  docType: string
  name: string
  comment: string | null
  resolutionNumber: string | null
  resolutionName: string | null
  resolutionUrl: string | null
}

export interface TnvedCurrencyDto {
  codeLat: string
  name: string
  rate: number
  updatedAtUtc: string
}

export interface TnvedNewsDto {
  title: string
  url: string
  publicationType: string
  itemDate: string | null
  isImportant: boolean
}

export interface TnvedRegulationDto {
  id: number
  number: string
  dateStr: string | null
  date: string | null
  url: string | null
}

export interface TnvedTimelineDto {
  typeId: number
  description: string
  showDate: string
}

export interface TnvedExplanationDto {
  code: string
  nodeType: string
  htmlContent: string | null
  updatedAtUtc: string | null
}

export interface TnvedVtoGroupDto {
  code: string
  hint: string
}

export interface TnvedVtoSectionDto {
  name: string
  totalCodes: number
  groups: TnvedVtoGroupDto[]
}

export interface TnvedTopCodeDto {
  code: string
  treeName: string | null
  rateStr: string | null
  declarationCount: number
}

export interface TnvedRateChangeDto {
  code: string
  treeName: string | null
  oldRateStr: string | null
  newRateStr: string | null
  changedAtUtc: string
}

export interface TnvedSyncLogDto {
  id: number
  startedAtUtc: string
  finishedAtUtc: string | null
  status: string
  triggeredBy: string
  nodesAdded: number
  nodesUpdated: number
  nodesRemoved: number
  ratesUpdated: number
  errorMessage: string | null
}

export interface TnvedReferenceDto {
  code: string
  success: boolean
  description: string | null
  rawJson: string | null
  hasRestrictions: boolean
  hasPreferences: boolean
  errorMessage: string | null
  updatedAtUtc: string
  nonTariffMeasures: TnvedNonTariffMeasureDto[]
}

export interface TnvedExportReferenceDto {
  code: string
  success: boolean
  rateValue: string | null
  hasRestrictions: boolean
  hasPreferences: boolean
  errorMessage: string | null
  updatedAtUtc: string
  nonTariffMeasures: TnvedNonTariffMeasureDto[]
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStatusCountDto {
  status: string
  count: number
}

export interface DashboardTopClientDto {
  clientId: string
  username: string
  displayName: string | null
  count: number
}

export interface DashboardTopCodeDto {
  code: string
  treeName: string | null
  count: number
}

export interface DashboardDto {
  totalEntries: number
  byStatus: DashboardStatusCountDto[]
  totalWeightKg: number
  totalGrandTotal: number
  entriesThisMonth: number
  topClients: DashboardTopClientDto[]
  topCodes: DashboardTopCodeDto[]
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationDto {
  id: string
  message: string
  relatedCode: string | null
  isRead: boolean
  createdAtUtc: string
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface ProfileDto {
  userId: string
  username: string
  displayName: string | null
  phone: string | null
  companyName: string | null
  innBin: string | null
  role: string
}

export interface UpdateProfileRequest {
  displayName: string | null
  phone: string | null
  companyName: string | null
  innBin: string | null
}

// ── Reestr Comments ───────────────────────────────────────────────────────────

export interface ReestrCommentDto {
  id: string
  reestrEntryId: string
  authorId: string
  authorRole: string
  authorUsername: string
  text: string
  createdAtUtc: string
  editedAtUtc: string | null
}

// ── Reestr Goods + Doc44 ──────────────────────────────────────────────────────

export interface ReestrGoodsItemDto {
  id: string
  sortOrder: number
  description: string | null
  tnvedCode: string | null
  tnvedDescription: string | null
  countryOfOrigin: string | null
  quantity: number | null
  unit: string | null
  unitCode: string | null
  grossWeightKg: number | null
  netWeightKg: number | null
  packagesCount: number | null
  quantityTypeCode: string | null
  customsValue: number | null
  currency: string | null
}

export interface ReestrDoc44ItemDto {
  id: string
  sortOrder: number
  docTypeCode: string | null
  docTypeName: string | null
  docNumber: string | null
  docDate: string | null
}

export interface ReestrGoodsItemInput {
  description: string | null
  tnvedCode: string | null
  tnvedDescription: string | null
  countryOfOrigin: string | null
  quantity: number | null
  unit: string | null
  unitCode: string | null
  grossWeightKg: number | null
  netWeightKg: number | null
  packagesCount: number | null
  quantityTypeCode: string | null
  customsValue: number | null
  currency: string | null
}

export interface ReestrDoc44ItemInput {
  docTypeCode: string | null
  docTypeName: string | null
  docNumber: string | null
  docDate: string | null
}

export const EAES_DOC_CODES: { code: string; name: string }[] = [
  { code: '01401', name: 'Сертификат соответствия техническому регламенту ЕАЭС' },
  { code: '01402', name: 'Декларация о соответствии техническому регламенту ЕАЭС' },
  { code: '02011', name: 'Коносамент (морская накладная)' },
  { code: '02013', name: 'ЖД накладная' },
  { code: '02015', name: 'Автотранспортная накладная (CMR)' },
  { code: '02016', name: 'Товарно-транспортная накладная' },
  { code: '02017', name: 'Авиационная накладная (AWB)' },
  { code: '03011', name: 'Договор (контракт)' },
  { code: '03012', name: 'Спецификация / доп. соглашение к договору' },
  { code: '04021', name: 'Инвойс (счёт-фактура)' },
  { code: '04023', name: 'Банковские и платёжные документы' },
  { code: '04025', name: 'Счёт-проформа' },
  { code: '04113', name: 'Страховой полис' },
  { code: '04131', name: 'Упаковочный лист (пакинг-лист)' },
  { code: '06011', name: 'Сертификат о происхождении товара (форма СТ-1)' },
  { code: '06013', name: 'Сертификат о происхождении товара (форма А)' },
  { code: '11004', name: 'Доверенность' },
]

export const OKEI_QUANTITY_TYPE_CODES: { code: string; name: string }[] = [
  { code: 'РК', name: 'Упаковка' },
  { code: 'РР', name: 'Штука' },
]

// ── System ─────────────────────────────────────────────────────────────────────

export interface EndpointRow {
  route: string
  methods: string[]
  allowsAnonymous: boolean
  policies: string[]
  roles: string[]
}

export interface RolePermissionsRow {
  name: string
  permissions: string[]
}

export interface PermissionMatrixResponse {
  roles: RolePermissionsRow[]
  permissions: string[]
}

export interface TnvedTransitionSeedResult {
  inserted: number
  total: number
  sourceVersion: string
}

export type TnvedNode = TnvedNodeDto
export type TnvedCurrency = TnvedCurrencyDto

export interface ReestrComment { id: string; reestrEntryId: string; authorId: string; authorRole: string; authorUsername: string; text: string; createdAtUtc: string; editedAtUtc: string | null }

export interface ProfileDto { userId: string; username: string; displayName: string | null; phone: string | null; companyName: string | null; innBin: string | null; role: string }

export interface NotificationDto { id: string; message: string; relatedCode: string | null; isRead: boolean; createdAtUtc: string }

export interface TnvedTopCode { code: string; treeName: string | null; rateStr: string | null; declarationCount: number }
