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
  // --- КЕДЕН-транзит: § 1 Общие сведения ---
  purposeCode?: string | null
  departureCustomsOffice?: string | null
  entryMethodCode?: string | null
  movementDirectionCode?: string | null
  usedAsDeclarationCode?: string | null
  goodsQuantity?: number | null
  cargoPlacesCount?: number | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  grossWeightKg?: number | null
  totalValue?: number | null
  docCurrencyCode?: string | null
  transportDocTypeCode?: string | null
  transportDocNumber?: string | null
  transportDocDate?: string | null
  // --- КЕДЕН-транзит: § 5 Товарная партия ---
  isMultimodal?: boolean
  transportModeCode?: string | null
  loadingCountryCode?: string | null
  loadingRailStation?: string | null
  unloadingCountryCode?: string | null
  unloadingRailStation?: string | null
  destinationCustomsOffice?: string | null
  packagingInfoCode?: string | null
  // --- КЕДЕН-транзит: § 8-12 ---
  tempStoragePlace?: string | null
  destinationPlace?: string | null
  submitterType?: string | null
  submitterBin?: string | null
  submitterName?: string | null
  goodsItems?: ReestrGoodsItemDto[] | null
  doc44Items?: ReestrDoc44ItemDto[] | null
  organizations?: ReestrOrganizationDto[] | null
  carriers?: ReestrCarrierDto[] | null
  transportMeans?: ReestrTransportMeansDto[] | null
  identificationMeans?: ReestrIdentificationMeansDto[] | null
  packages?: ReestrPackageDto[] | null
  containers?: ReestrContainerDto[] | null
  precedingDocs?: ReestrPrecedingDocDto[] | null
  cargoOperations?: ReestrCargoOperationDto[] | null
  guarantees?: ReestrGuaranteeDto[] | null
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
  // --- КЕДЕН-транзит ---
  transit: ReestrTransitFields
  organizations: ReestrOrganizationInput[]
  carriers: ReestrCarrierInput[]
  transportMeans: ReestrTransportMeansInput[]
  identificationMeans: ReestrIdentificationMeansInput[]
  packages: ReestrPackageInput[]
  containers: ReestrContainerInput[]
  precedingDocs: ReestrPrecedingDocInput[]
  cargoOperations: ReestrCargoOperationInput[]
  guarantees: ReestrGuaranteeInput[]
}

// Скалярные поля КЕДЕН-транзита, вынесенные из ReestrEntry.data (которое
// исторически строковая мапа под старые Excel-колонки реестра).
export interface ReestrTransitFields {
  purposeCode: string | null
  departureCustomsOffice: string | null
  entryMethodCode: string | null
  movementDirectionCode: string | null
  usedAsDeclarationCode: string | null
  goodsQuantity: number | null
  cargoPlacesCount: number | null
  departureCountryCode: string | null
  destinationCountryCode: string | null
  grossWeightKg: number | null
  totalValue: number | null
  docCurrencyCode: string | null
  transportDocTypeCode: string | null
  transportDocNumber: string | null
  transportDocDate: string | null
  isMultimodal: boolean
  transportModeCode: string | null
  loadingCountryCode: string | null
  loadingRailStation: string | null
  unloadingCountryCode: string | null
  unloadingRailStation: string | null
  destinationCustomsOffice: string | null
  packagingInfoCode: string | null
  tempStoragePlace: string | null
  destinationPlace: string | null
  submitterType: string | null
  submitterBin: string | null
  submitterName: string | null
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
  // --- КЕДЕН-транзит: § 1 Общие сведения ---
  purposeCode?: string | null
  departureCustomsOffice?: string | null
  entryMethodCode?: string | null
  movementDirectionCode?: string | null
  usedAsDeclarationCode?: string | null
  goodsQuantity?: number | null
  cargoPlacesCount?: number | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  grossWeightKg?: number | null
  totalValue?: number | null
  docCurrencyCode?: string | null
  transportDocTypeCode?: string | null
  transportDocNumber?: string | null
  transportDocDate?: string | null
  // --- КЕДЕН-транзит: § 5 Товарная партия ---
  isMultimodal?: boolean
  transportModeCode?: string | null
  loadingCountryCode?: string | null
  loadingRailStation?: string | null
  unloadingCountryCode?: string | null
  unloadingRailStation?: string | null
  destinationCustomsOffice?: string | null
  packagingInfoCode?: string | null
  // --- КЕДЕН-транзит: § 8-12 ---
  tempStoragePlace?: string | null
  destinationPlace?: string | null
  submitterType?: string | null
  submitterBin?: string | null
  submitterName?: string | null
  organizations?: ReestrOrganizationInput[] | null
  carriers?: ReestrCarrierInput[] | null
  transportMeans?: ReestrTransportMeansInput[] | null
  identificationMeans?: ReestrIdentificationMeansInput[] | null
  packages?: ReestrPackageInput[] | null
  containers?: ReestrContainerInput[] | null
  precedingDocs?: ReestrPrecedingDocInput[] | null
  cargoOperations?: ReestrCargoOperationInput[] | null
  guarantees?: ReestrGuaranteeInput[] | null
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
  // Улица, номер дома, номер офиса — одной строкой
  street?: string | null
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

// ref/foreign-customs-offices — иностранные таможенные органы назначения
// (§5 DestinationCustomsOffice в КЕДЕН-транзите).
export interface RefForeignCustomsOfficeDto {
  id: string
  code: string
  name: string
  countryCode: string | null
  isActive: boolean
}

// ref/expense-types — статьи расходов ДТ (см. Spec 4a Task 1-2 на бэке),
// используются для таблицы расходов и распределения на таможенную стоимость.
export interface RefExpenseTypeDto {
  code: string
  nameRu: string
  distributionBase: 'GrossWeight' | 'CustomsValue'
  sortOrder: number
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

// ── Reestr КЕДЕН-транзит: дочерние коллекции ──────────────────────────────────
// Зеркалируют CRM.API.Contracts.ReestrContracts (Organizations/Carriers/…).

// § 2. Организации (декларант / отправитель / получатель).
export interface ReestrOrganizationDto {
  id: string
  sortOrder: number
  role: string
  subjectType: string | null
  bin: string | null
  name: string | null
  shortName: string | null
  address: string | null
  phone: string | null
  email: string | null
}

export interface ReestrOrganizationInput {
  role: string
  subjectType: string | null
  bin: string | null
  name: string | null
  shortName: string | null
  address: string | null
  phone: string | null
  email: string | null
}

// § 3. Перевозчики и представители при транзите.
export interface ReestrCarrierDto {
  id: string
  sortOrder: number
  role: string
  subjectType: string | null
  bin: string | null
  name: string | null
  countryCode: string | null
  phone: string | null
  email: string | null
}

export interface ReestrCarrierInput {
  role: string
  subjectType: string | null
  bin: string | null
  name: string | null
  countryCode: string | null
  phone: string | null
  email: string | null
}

// § 4. ТС на границе.
export interface ReestrTransportMeansDto {
  id: string
  sortOrder: number
  transportModeCode: string | null
  purposeCode: string | null
  vehicleTypeCode: string | null
  wagonOrContainerNumber: string | null
  isEmpty: boolean
  isWagonReturn: boolean
  inContainer: boolean
  matchesTransitVehicle: boolean
}

export interface ReestrTransportMeansInput {
  transportModeCode: string | null
  purposeCode: string | null
  vehicleTypeCode: string | null
  wagonOrContainerNumber: string | null
  isEmpty: boolean
  isWagonReturn: boolean
  inContainer: boolean
  matchesTransitVehicle: boolean
}

// § 5. Средства идентификации.
export interface ReestrIdentificationMeansDto {
  id: string
  sortOrder: number
  noSeal: boolean
  meansTypeCode: string | null
  quantity: number | null
  number: string | null
}

export interface ReestrIdentificationMeansInput {
  noSeal: boolean
  meansTypeCode: string | null
  quantity: number | null
  number: string | null
}

// § 5. Упаковка.
export interface ReestrPackageDto {
  id: string
  sortOrder: number
  packagingInfoKindCode: string | null
  packageTypeCode: string | null
  packageCount: number | null
  description: string | null
}

export interface ReestrPackageInput {
  packagingInfoKindCode: string | null
  packageTypeCode: string | null
  packageCount: number | null
  description: string | null
}

// § 5. Контейнеры.
export interface ReestrContainerDto {
  id: string
  sortOrder: number
  containerNumber: string | null
  note: string | null
}

export interface ReestrContainerInput {
  containerNumber: string | null
  note: string | null
}

// § 5. Предшествующие документы.
export interface ReestrPrecedingDocDto {
  id: string
  sortOrder: number
  docTypeCode: string | null
  number: string | null
  date: string | null
}

export interface ReestrPrecedingDocInput {
  docTypeCode: string | null
  number: string | null
  date: string | null
}

// § 8. Грузовые операции.
export interface ReestrCargoOperationDto {
  id: string
  sortOrder: number
  operationTypeCode: string | null
}

export interface ReestrCargoOperationInput {
  operationTypeCode: string | null
}

// § 10. Обеспечение.
export interface ReestrGuaranteeDto {
  id: string
  sortOrder: number
  guaranteeTypeCode: string | null
  amount: number | null
  currencyCode: string | null
  number: string | null
}

export interface ReestrGuaranteeInput {
  guaranteeTypeCode: string | null
  amount: number | null
  currencyCode: string | null
  number: string | null
}

// ── Import40 КЕДЕН-типы ───────────────────────────────────────────────────────

export interface Import40TransportMeans {
  number: string
  typeCode: string | null
}

export interface Import40GoodsPayment {
  sortOrder?: number
  taxModeCode: string | null
  taxBase: number | null
  rateKindCode: string | null // '%' | 'S' | '*'
  rateValue: number | null
  rateUnitCode: string | null
  rateCurrencyCode: string | null
  weightRatio: number | null
  rateDate: string | null // yyyy-MM-dd
  paymentFeatureCode: string | null
  amountKzt: number | null
}

export interface Import40FactPayment {
  sortOrder?: number
  taxModeCode: string | null
  amount: number | null
  exchangeRate: number | null
  paymentDocDate: string | null
  payerTaxpayerId: string | null
  paymentDate: string | null
  paymentMethodCode: string | null
}

// Строка расхода ДТ (Spec 4a) — один тип на чтение/запись, как Import40FactPayment
// выше: сервер отдаёт sortOrder при чтении, но порядок на upsert определяется
// позицией в массиве (см. Import40Endpoints.ApplyExpenses на бэке).
export interface Import40DeclarationExpense {
  sortOrder?: number
  expenseTypeCode: string | null
  amount: number | null
  currencyCode: string | null
}

// Товар ДТ Импорт 40: базовые поля общие с транзитом + КЕДЕН-поля
export interface Import40GoodsItemInput extends ReestrGoodsItemInput {
  // ВАЖНО: на бэкенде фактурная стоимость называется invoiceValue;
  // в общий компонент товаров она едет как customsValue (см. маппинг в Import40DtView)
  procedureCode?: string | null
  previousProcedureCode?: string | null
  goodsMoveFeatureCode?: string | null
  tradeMarkName?: string | null
  productMarkName?: string | null
  productModelName?: string | null
  productArticle?: string | null
  manufacturerName?: string | null
  packageAvailabilityCode?: string | null
  cargoPlacesQuantity?: number | null
  packageKindCode?: string | null
  packageQuantity?: number | null
  prefClearanceCode?: string | null
  prefDutyCode?: string | null
  prefExciseCode?: string | null
  prefVatCode?: string | null
  customsValueKzt?: number | null
  statisticValueUsd?: number | null
  valuationMethodCode?: string | null
  quotaAmount?: number | null
  prohibitionCode?: string | null
  ipoCode?: string | null
  payments?: Import40GoodsPayment[]
  // Товар пришёл из КП без веса/количества (см. KpToDtMapper.MapGoods на бэке) —
  // сумма ТПиН требует пересчёта декларантом. Пробрасываем через форму,
  // чтобы бейдж и снятие флага (Import40GoodsKedenPanel/calcTpin) переживали save.
  needsTpinRecalc?: boolean | null
}

export interface Import40Doc44ItemInput extends ReestrDoc44ItemInput {
  goodsItemIndex?: number | null
  docStartDate?: string | null
  docValidityDate?: string | null
  issueCountryCode?: string | null
}

export const EAES_DOC_CODES: { code: string; name: string }[] = [
  { code: '01011', name: 'Лицензия на экспорт и (или) импорт товаров' },
  { code: '01017', name: 'Разрешение на экспорт и (или) импорт товаров, в отношении которых введено автоматическое лицензирование (наблюдение)' },
  { code: '01021', name: 'Заключение (разрешительный документ) на ввоз и (или) вывоз гражданского и служебного оружия, его основных (составных) частей и патронов к нему' },
  { code: '01022', name: 'Разрешение на ввоз гражданских беспилотных летательных аппаратов и авиамоделей в Республику Беларусь, выданное Департаментом по авиации Министерства транспорта и коммуникаций Республики Беларусь (д…' },
  { code: '01027', name: 'Документ, при наличии которого на товары не распространяются специальные меры (для Республики Беларусь)' },
  { code: '01031', name: 'Разрешение (сертификат, удостоверение), предусмотренное Конвенцией о международной торговле видами дикой фауны и флоры, находящимися под угрозой исчезновения, от 3 марта 1973 года' },
  { code: '01041', name: 'Заключение (разрешительный документ) на ввоз радиоэлектронных средств и высокочастотных устройств гражданского назначения, в том числе встроенных либо входящих в состав других товаров' },
  { code: '01061', name: 'Заключение (разрешительный документ) на ввоз средств защиты растений (пестицидов)' },
  { code: '01065', name: 'Заключение (разрешительный документ) на ввоз средств защиты растений и других стойких органических загрязнителей, подлежащих использованию в исследованиях лабораторного масштаба, а также в качестве…' },
  { code: '01071', name: 'Заключение уполномоченного органа государств - членов Евразийского экономического союза на ввоз (вывоз) ядовитых веществ, не являющихся прекурсорами наркотических средств и психотропных веществ и я…' },
  { code: '01072', name: 'Заключение уполномоченного органа государств - членов Евразийского экономического союза на транзит ядовитых веществ, не являющихся прекурсорами наркотических средств и психотропных веществ, через т…' },
  { code: '01081', name: 'Заключение (разрешительный документ) на ввоз лекарственных средств' },
  { code: '01091', name: 'Заключение (разрешительный документ) на ввоз и (или) вывоз шифровальных (криптографических) средств' },
  { code: '01095', name: 'Заключение (разрешительный документ) на ввоз и (или) вывоз специальных технических средств, предназначенных для негласного получения информации' },
  { code: '01101', name: 'Заключение (разрешительный документ) на вывоз культурных ценностей, документов национальных архивных фондов и оригиналов архивных документов' },
  { code: '01111', name: 'Заключение (разрешительный документ) на вывоз коллекционных материалов по минералогии, палеонтологии, костей ископаемых животных' },
  { code: '01121', name: 'Нов. ред. Решение 95 от 28.06.2022 Коллегии ЕЭК Заключение (разрешительный документ) на вывоз диких живых животных, водных биологических ресурсов, отдельных дикорастущих растений и дикорастущего ле…' },
  { code: '01125', name: 'Заключение (разрешительный документ) на вывоз редких и находящихся под угрозой исчезновения видов диких живых животных и дикорастущих растений, включенных в красные книги государств – членов Еврази…' },
  { code: '01126', name: 'Документы, подтверждающие соблюдение специальных экономических мер, введенных Российской Федерацией' },
  { code: '01128', name: 'Документ, подтверждающий согласование вывоза товаров (для Республики Беларусь)' },
  { code: '01131', name: 'Заключение (разрешительный документ) на ввоз и (или) вывоз органов и тканей человека, крови и ее компонентов, образцов биологических материалов человека' },
  { code: '01133', name: 'Разрешение на реэкспорт товаров' },
  { code: '01143', name: 'Акт государственного контроля на ввоз и (или) вывоз: – драгоценных камней; – драгоценных металлов и сырьевых товаров, содержащих драгоценные металлы' },
  { code: '01151', name: 'Лицензия, перечень (приложение) к лицензии на ввоз (вывоз) товаров, подлежащих экспортному контролю, выданные уполномоченным государственным органом государств - членов Евразийского экономического…' },
  { code: '01152', name: 'Разрешение на транзит товаров, подлежащих экспортному контролю, выданное уполномоченным государственным органом государств - членов Евразийского экономического союза в области экспортного контроля' },
  { code: '01153', name: 'Разрешение (подтверждение) на ввоз (вывоз) товаров, подлежащих экспортному контролю, выданное уполномоченным государственным органом государств - членов Евразийского экономического союза в области…' },
  { code: '01154', name: 'Заключение (идентификационное), выдаваемое в соответствии с законодательством в области экспортного контроля государств - членов Евразийского экономического союза, о непринадлежности товаров к това…' },
  { code: '01161', name: 'Лицензия, перечень (приложение) к лицензии на ввоз (вывоз) продукции военного назначения, выданные уполномоченным государственным органом государств - членов Евразийского экономического союза' },
  { code: '01162', name: 'Разрешение на транзит продукции военного назначения, выданное уполномоченным государственным органом государств - членов Евразийского экономического союза' },
  { code: '01163', name: 'Заключение (идентификационное) уполномоченного государственного органа государств - членов Евразийского экономического союза о непринадлежности товаров к продукции военного назначения' },
  { code: '01164', name: 'Выписки из перечней продукции военного назначения, предназначенной для ввоза в Российскую Федерацию (вывоза из Российской Федерации), оформленные в рамках договоров о развитии военно-технического с…' },
  { code: '01171', name: 'Воинский пропуск' },
  { code: '01181', name: 'Перечень продукции, ввозимой (вывозимой) в рамках Межправительственных Соглашений о производственной и научно- технической кооперации предприятий оборонных отраслей промышленности' },
  { code: '01191', name: 'Документ об оценке соответствия, предусмотренный техническими регламентами Евразийского экономического союза (техническими регламентами Таможенного союза), либо сертификат соответствия или декларац…' },
  { code: '01194', name: 'Справка уполномоченного органа, подтверждающая принадлежность продукции к лекарственным средствам, товарам медицинского и ветеринарного назначения при условии их размещения на аптечных складах полу…' },
  { code: '01201', name: 'Ветеринарный сертификат' },
  { code: '01202', name: 'Разрешение на ввоз подконтрольных товаров, исходя из эпизоотического состояния стран-экспортеров, выданное должностным лицом уполномоченного органа государства – члена Евразийского экономического с…' },
  { code: '01203', name: 'Разрешение на вывоз подконтрольных товаров, выданное должностным лицом уполномоченного органа государства – члена Евразийского экономического союза в области ветеринарии' },
  { code: '01204', name: 'Разрешение на транзит подконтрольных товаров, исходя из эпизоотического состояния стран-экспортеров, выданное должностным лицом уполномоченного органа государства – члена Евразийского экономическог…' },
  { code: '01205', name: 'Санитарно-эпидемиологическое заключение уполномоченного государственного органа государств - членов Таможенного союза (для Республики Казахстан и Российской Федерации) < * >' },
  { code: '01206', name: 'Свидетельство о государственной регистрации, выданное уполномоченным органом государства–члена Евразийского экономического союза в области санитарно-эпидемиологического благополучия населения' },
  { code: '01207', name: 'Фитосанитарный сертификат' },
  { code: '01209', name: 'Разрешение на ввоз карантинных объектов (карантинных вредных организмов) в научно-исследовательских целях, выданное уполномоченным государственным органом государств - членов Евразийского экономиче…' },
  { code: '01210', name: 'Документы, подтверждающие соблюдение запретов и ограничений (временных мер), введенных в Республике Армения в одностороннем порядке' },
  { code: '01211', name: 'Документы, подтверждающие соблюдение запретов и ограничений (временных мер), введенных в Республике Беларусь в одностороннем порядке' },
  { code: '01221', name: 'Документы, подтверждающие соблюдение запретов и ограничений (временных мер), введенных в Республике Казахстан в одностороннем порядке' },
  { code: '01225', name: 'Документы, подтверждающие соблюдение запретов и ограничений (временных мер), введенных в Кыргызской Республике в одностороннем порядке' },
  { code: '01231', name: 'Документы, подтверждающие соблюдение запретов и ограничений (временных мер), введенных в Российской Федерации в одностороннем порядке' },
  { code: '01241', name: 'Сертификат (сведения о сертификате) международной схемы сертификации необработанных природных алмазов (сертификат Кимберлийского процесса)' },
  { code: '01242', name: 'Документы, подтверждающие сведения о производителе товаров, для целей контроля за применением специальных защитных, антидемпинговых и компенсационных мер' },
  { code: '01243', name: 'Экспортный сертификат на сельскохозяйственную продукцию' },
  { code: '01244', name: 'Документ, подтверждающий целевое назначение товара, выданный уполномоченным органом исполнительной власти государства – члена Евразийского экономического союза, на территорию которого осуществляетс…' },
  { code: '01251', name: 'Лицензия на виды деятельности в отношении отдельных категорий товаров (для Российской Федерации)' },
  { code: '01261', name: 'Документ (квитанция) на получение акцизных марок (учетно-контрольных знаков, знаков) (для Российской Федерации)' },
  { code: '01271', name: 'Документ, в соответствии с которым подакцизные товары, подлежащие маркировке акцизными марками (учетно-контрольными знаками, знаками), не маркируются (для Российской Федерации)' },
  { code: '01281', name: 'Подтверждение о фиксации продукции в единой государственной автоматизированной информационной системе учета объема производства и оборота этилового спирта, алкогольной и спиртосодержащей продукции…' },
  { code: '01291', name: 'Разрешение, выданное уполномоченным государственным органом государств - членов Евразийского экономического союза в отношении взрывчатых веществ промышленного назначения, источников ионизирующего и…' },
  { code: '01301', name: 'Разрешение, выданное уполномоченным государственным органом государств - членов Евразийского экономического союза в отношении условно патогенных и патогенных генно-инженерных организмов (для Респуб…' },
  { code: '01311', name: 'Заключение (разрешительный документ) на вывоз минерального сырья' },
  { code: '01321', name: 'Заключение (разрешительный документ) на ввоз и (или) вывоз опасных отходов' },
  { code: '01332', name: 'Разрешение компетентного органа государства-экспортера на вывоз конкретной партии наркотических средств, психотропных веществ и их прекурсоров либо официальное уведомление этого органа о том, что у…' },
  { code: '01341', name: 'Заключение (разрешительный документ) на ввоз и (или) вывоз озоноразрушающих веществ и продукции, содержащей озоноразрушающие вещества' },
  { code: '01351', name: 'Подтверждение (решение) уполномоченного органа (организации) государства – члена Евразийского экономического союза при вывозе средств индивидуальной защиты, защитных и дезинфицирующих средств, прод…' },
  { code: '01361', name: 'Сертификаты-разрешения на ядерные материалы и радиоактивные вещества, на конструкцию и (или) перевозку транспортных упаковочных комплектов для перевозки таких материалов и веществ, выдаваемые уполн…' },
  { code: '01401', name: 'Сертификат соответствия требованиям технического регламента Евразийского экономического союза (Таможенного союза)' },
  { code: '01402', name: 'Декларация о соответствии требованиям технического регламента Евразийского экономического союза (Таможенного союза)' },
  { code: '01403', name: 'Сертификат соответствия, оформленный по единой форме, на продукцию (товары), включенную в Единый перечень продукции, подлежащей обязательному подтверждению соответствия с выдачей сертификатов соотв…' },
  { code: '01404', name: 'Декларация о соответствии, оформленная по единой форме, на продукцию (товары), включенную в Единый перечень продукции, подлежащей обязательному подтверждению соответствия с выдачей сертификатов соо…' },
  { code: '01405', name: 'Одобрение типа транспортного средства' },
  { code: '01406', name: 'Одобрение типа шасси' },
  { code: '01407', name: 'Свидетельство о безопасности конструкции транспортного средства' },
  { code: '01408', name: 'Документ об оценке соответствия, предусмотренный законодательством государства – члена Евразийского экономического союза, на территории которого продукция (товар) помещается под таможенные процедуры' },
  { code: '01409', name: 'Паспорт нефти (паспорт качества нефти)' },
  { code: '01410', name: 'Договор с органом по оценке соответствия (органом по сертификации продукции или испытательной лабораторией (центром)), предусмотренный соответствующим техническим регламентом Евразийского экономиче…' },
  { code: '01411', name: 'Свидетельство о государственной регистрации продукции, подтверждающее соответствие продукции требованиям технических регламентов Евразийского экономического союза (технических регламентов Таможенно…' },
  { code: '01412', name: 'Свидетельство о классификации маломерного судна' },
  { code: '01413', name: 'Свидетельство о регистрации минерального удобрения' },
  { code: '01414', name: 'Свидетельство об уведомительной государственной регистрации химической продукции' },
  { code: '01415', name: 'Разрешение на использование химической продукции' },
  { code: '01416', name: 'Уведомление о подтверждении использования в заявленных нуждах и целях ввозимой (ввезенной) продукции, подлежащей обязательной оценке соответствия на таможенной территории Евразийского экономическог…' },
  { code: '01417', name: 'Договор о проведении межлабораторных сравнительных испытаний (межлабораторных сличений), поверки или калибровки средств измерений, сличения эталонов' },
  { code: '01418', name: 'Мотивированное обращение о потреблении (использовании) ввозимых (ввезенных) товаров исключительно расположенными на таможенной территории Евразийского экономического союза дипломатическими представ…' },
  { code: '01419', name: 'Подтверждение государственного органа государства – члена Евразийского экономического союза, уполномоченного в сфере чрезвычайных ситуаций, о том, что ввозимые товары предназначены для ликвидации п…' },
  { code: '01420', name: 'Решение о подтверждении принадлежности к гуманитарной помощи (содействию) средств и товаров (для Республики Армения, Кыргызской Республики и Российской Федерации)' },
  { code: '01421', name: 'Заявление о безопасности товаров электронной торговли' },
  { code: '01999', name: 'Иные документы, подтверждающие соблюдение запретов и ограничений' },
  { code: '02011', name: 'Коносамент' },
  { code: '02012', name: 'Транспортная накладная при перевозке товаров водным транспортом' },
  { code: '02013', name: 'Железнодорожная накладная' },
  { code: '02014', name: 'Иные документы, предусмотренные правилами перевозки по железной дороге' },
  { code: '02015', name: 'Транспортная накладная, предусмотренная Конвенцией о договоре международной дорожной перевозки грузов 1956 года' },
  { code: '02016', name: 'Иная транспортная накладная, используемая при перевозке товаров автодорожным транспортом' },
  { code: '02017', name: 'Авианакладная' },
  { code: '02018', name: 'Транспортные документы, используемые при перемещении товаров трубопроводным транспортом или по линиям электропередачи' },
  { code: '02019', name: 'Почтовая накладная' },
  { code: '02020', name: 'Общая накладная при экспресс-доставке' },
  { code: '02021', name: 'Индивидуальная накладная при экспресс-доставке' },
  { code: '02022', name: 'Багажная квитанция' },
  { code: '02024', name: 'Книжка МДП' },
  { code: '02025', name: 'Карнет АТА' },
  { code: '02026', name: 'Упаковочный лист' },
  { code: '02030', name: 'Транспортный документ (сопроводительная накладная либо иной документ) на партию ядерных материалов и радиоактивных веществ (для Российской Федерации)' },
  { code: '02099', name: 'Иные транспортные (перевозочные) документы' },
  { code: '03011', name: 'Договор (контракт), заключенный при совершении сделки с товарами' },
  { code: '03012', name: 'Документы, вносящие изменения и (или) дополнения к документу, сведения о котором указаны под кодом 03011' },
  { code: '03013', name: 'Документ, подтверждающий совершение односторонней сделки с товарами' },
  { code: '03014', name: 'Документы, подтверждающие право владения, пользования и (или) распоряжения товарами при отсутствии какой-либо сделки' },
  { code: '03021', name: 'Документы, подтверждающие передачу прав на объекты интеллектуальной собственности (авторский, лицензионный договор, свидетельство о регистрации объекта интеллектуальной собственности, договор на ис…' },
  { code: '03022', name: 'Документы, подтверждающие введение в гражданский оборот на таможенной территории Евразийского экономического союза товаров, обозначенных товарным знаком, с согласия правообладателя (дилерский, дист…' },
  { code: '03031', name: 'Документ, подтверждающий соблюдение требований в области валютного контроля: регистрационный номер сделки/регистрационный номер валютного договора (для Республики Беларусь); учетный номер контракта…' },
  { code: '03998', name: 'Документ (контракт) на недропользование (для Республики Казахстан)' },
  { code: '03999', name: 'Иные документы, подтверждающие право владения, пользования и (или) распоряжения товарами' },
  { code: '04011', name: 'Учредительные документы' },
  { code: '04021', name: 'Счет-фактура (инвойс) к договору' },
  { code: '04022', name: 'Иные расчетные или коммерческие документы (в том числе кассовый или товарный чек на приобретение товаров в розничной сети)' },
  { code: '04023', name: 'Банковские документы (если счет-фактура оплачен в зависимости от условий внешнеторгового контракта), а также другие платежные документы, отражающие стоимость товара' },
  { code: '04025', name: 'Счет-проформа к договору' },
  { code: '04026', name: 'Счет-фактура экспорта (для Республики Армения)' },
  { code: '04027', name: 'Накладная на перемещение товаров, подлежащих прослеживаемости (для Республики Армения)' },
  { code: '04031', name: 'Счет-фактура (инвойс) за перевозку (транспортировку), погрузку, разгрузку или перегрузку товаров' },
  { code: '04032', name: 'Банковские или иные платежные документы по оплате транспортных расходов, отражающие стоимость перевозки (транспортировки), погрузку, разгрузку или перегрузку товаров' },
  { code: '04033', name: 'Договор по перевозке, погрузке, разгрузке или перегрузке товаров' },
  { code: '04041', name: 'Счета-фактуры (инвойсы) за оказание посреднических услуг' },
  { code: '04042', name: 'Банковские или иные платежные документы за оказание посреднических услуг' },
  { code: '04043', name: 'Договор об оказании посреднических услуг' },
  { code: '04051', name: 'Документы о стоимости товаров и услуг, предоставленных покупателем бесплатно или по сниженным ценам для использования в связи с производством и продажей' },
  { code: '04061', name: 'Счет-фактура (инвойс), содержащие сведения о платежах за использование объектов интеллектуальной собственности' },
  { code: '04062', name: 'Банковские платежные документы, бухгалтерские и другие документы, содержащие сведения о платежах за использование объектов интеллектуальной собственности' },
  { code: '04071', name: 'Документы (в том числе бухгалтерские) и сведения, содержащие данные о части дохода (выручки), которая прямо или косвенно причитается продавцу в результате последующей продажи, распоряжения иным спо…' },
  { code: '04081', name: 'Счет-фактура (инвойс), содержащие сведения о стоимости упаковочных материалов и/или работ по упаковке' },
  { code: '04082', name: 'Банковские или иные платежные документы о стоимости упаковочных материалов и/или работ по упаковке' },
  { code: '04083', name: 'Договор о стоимости тары, упаковки, упаковочных материалов и работ по упаковке' },
  { code: '04091', name: 'Бухгалтерская документация производителя оцениваемых товаров, содержащая сведения о расходах по изготовлению или приобретению материалов, о расходах на производство, а также на иные операции, связа…' },
  { code: '04101', name: 'Счет-фактура (инвойс) на стоимость проектирования, разработки, инженерной, конструкторской работы, дизайна, художественного оформления, чертежей и эскизов' },
  { code: '04102', name: 'Банковские или иные платежные документы о стоимости проектирования, разработки, инженерной, конструкторской работы, дизайна, художественного оформления, чертежей и эскизов' },
  { code: '04111', name: 'Счет-фактура (инвойс) по оказанию страховых услуг' },
  { code: '04112', name: 'Банковские или иные платежные документы о стоимости страховых услуг' },
  { code: '04113', name: 'Страховой полис' },
  { code: '04115', name: 'Договор страхования' },
  { code: '04121', name: 'Котировки мировых бирж' },
  { code: '04131', name: 'Отгрузочный (упаковочный) лист' },
  { code: '04200', name: 'Интернет-заказ (дата и номер), в соответствии с которым были приобретены товары, таможенное декларирование которых осуществляется в рамках пилотного проекта (эксперимента), проводимого в соответств…' },
  { code: '04300', name: 'Документ, выданный таможенным органом декларанту по итогам проведения консультаций между таможенным органом и декларантом в целях обоснованного выбора стоимостной основы для определения таможенной…' },
  { code: '04400', name: 'Предварительное решение по вопросам применения методов определения таможенной стоимости товаров, ввозимых на таможенную территорию Евразийского экономического союза' },
  { code: '04999', name: 'Иные документы и сведения, которые декларант может представить в подтверждение заявленной таможенной стоимости' },
  { code: '05012', name: 'Решение о классификации товаров, перемещаемых через таможенную границу Евразийского экономического союза в несобранном или разобранном виде, в том числе в некомплектном или незавершенном виде' },
  { code: '05013', name: 'Предварительное решение о классификации товаров в соответствии с ТН ВЭД ЕАЭС' },
  { code: '05014', name: 'Решение о внесении изменений (дополнений) в предварительное решение о классификации товаров в соответствии с ТН ВЭД ЕАЭС и (или) решение о классификации товаров, перемещаемых через таможенную грани…' },
  { code: '05019', name: 'Подтверждение уполномоченного в области транспорта органа исполнительной власти государства – члена Евразийского экономического союза целевого назначения ввозимого товара в соответствии с примечани…' },
  { code: '05020', name: 'Подтверждение уполномоченного органа исполнительной власти, осуществляющего функции по выработке государственной политики и нормативно-правовому регулированию в сфере здравоохранения, государства –…' },
  { code: '05022', name: 'Подтверждение уполномоченного органа исполнительной власти, осуществляющего функции по выработке государственной политики и нормативно-правовому регулированию в сфере промышленности, государства –…' },
  { code: '05024', name: 'Подтверждение уполномоченного органа исполнительной власти, осуществляющего функции по контролю и надзору в сфере ветеринарии, карантина и защиты растений, государства – члена Евразийского экономич…' },
  { code: '05025', name: 'Подтверждение уполномоченного органа исполнительной власти, осуществляющего функции по выработке и реализации государственной политики и нормативно-правовому регулированию в сфере топливно-энергети…' },
  { code: '05026', name: 'Подтверждение органа исполнительной власти, уполномоченного правительством государства – члена Евразийского экономического союза, того, что ввозимый товар относится к высококачественной говядине в…' },
  { code: '05027', name: 'Подтверждение уполномоченного органа исполнительной власти, осуществляющего функции по выработке и реализации государственной политики и нормативно-правовому регулированию в сфере обороны государст…' },
  { code: '05028', name: 'Подтверждение уполномоченного органа исполнительной власти, осуществляющего функции по обеспечению реализации государственной политики и нормативно-правовому регулированию в сфере космической деяте…' },
  { code: '05031', name: 'Уведомление о планируемых поставках компонентов товара, перемещаемого через таможенную границу Евразийского экономического союза в несобранном или разобранном виде, в том числе в некомплектном или…' },
  { code: '05996', name: 'Соглашение, заключенное Министерством экономического развития Российской Федерации и российским юридическим лицом, о ввозе товаров, предназначенных для промышленной сборки моторных транспортных сре…' },
  { code: '05997', name: 'Дополнительное соглашение к соглашению, заключенному Министерством экономического развития Российской Федерации и российским юридическим лицом, о ввозе товаров, предназначенных для промышленной сбо…' },
  { code: '05998', name: 'Протокол о внесении изменений в соглашение, заключенное Министерством экономического развития Российской Федерации и российским юридическим лицом, о ввозе товаров, предназначенных для промышленной…' },
  { code: '05999', name: 'Иные документы, сведения, необходимые для целей классификации товара' },
  { code: '06011', name: 'Нов. ред. Решение 124 от 22.08.2023 Коллегии ЕЭК Сертификат о происхождении товара формы СТ-1 См. пред. ред. Решение 378 от 20.09.2010 КТС Редакция действует до 22.09.2023 г. (включительно) Сертифи…' },
  { code: '06013', name: 'Сертификат о происхождении товара формы "А"' },
  { code: '06014', name: 'Нов. ред. Решение 124 от 22.08.2023 Коллегии ЕЭК Непреференциальный сертификат о происхождении товара См. пред. ред. Решение 135 от 23.08.2012 Коллегии ЕЭК Редакция действует до 22.09.2023 г. (вклю…' },
  { code: '06015', name: 'Предварительное решение о происхождении товара' },
  { code: '06016', name: 'Декларация о происхождении товара' },
  { code: '06017', name: 'Сертификат о происхождении товара формы СТ-2' },
  { code: '06018', name: 'Сертификат о происхождении товара формы EAV' },
  { code: '06019', name: 'Сертификат о происхождении товара формы СТ-3' },
  { code: '06020', name: 'Сертификат о происхождении товара формы EAS' },
  { code: '06999', name: 'Иные документы, связанные с происхождением товара' },
  { code: '07011', name: 'Документы, которыми установлены льготы по уплате таможенных платежей' },
  { code: '07012', name: 'Документы, подтверждающие соблюдение целей и условий предоставления льгот по уплате таможенных платежей' },
  { code: '07013', name: 'Соглашение о применении централизованного порядка уплаты таможенных пошлин, налогов' },
  { code: '07014', name: 'Документы, которыми установлены основания для изменения сроков уплаты таможенных пошлин, налогов' },
  { code: '07015', name: 'Документы, подтверждающие наличие оснований для изменения сроков уплаты таможенных пошлин, налогов' },
  { code: '07017', name: 'Документы, подтверждающие возможность нахождения и (или) использования товаров на таможенной территории Евразийского экономического союза или за ее пределами без уплаты таможенных пошлин, налогов,…' },
  { code: '07018', name: 'Расчет таможенных пошлин, налогов, специальных, антидемпинговых, компенсационных пошлин' },
  { code: '07019', name: 'Расчет размера обеспечения исполнения обязанности по уплате таможенных пошлин, налогов, специальных, антидемпинговых, компенсационных пошлин' },
  { code: '07021', name: 'Решение таможенного органа о предоставлении отсрочки или рассрочки уплаты ввозных таможенных пошлин' },
  { code: '07022', name: 'Решение об изменении срока уплаты налогов, взимаемых при ввозе товаров' },
  { code: '07031', name: 'Документ, подтверждающий внесение денежных средств (денег) в качестве обеспечения исполнения обязанности по уплате таможенных пошлин, налогов, специальных, антидемпинговых, компенсационных пошлин' },
  { code: '07032', name: 'Банковская гарантия' },
  { code: '07033', name: 'Договор поручительства' },
  { code: '07034', name: 'Договор залога имущества' },
  { code: '07035', name: 'Документ, подтверждающий обеспечение исполнения обязанности по уплате таможенных пошлин, налогов, специальных, антидемпинговых, компенсационных пошлин иным способом, установленным законодательством…' },
  { code: '07036', name: 'Документ, подтверждающий соблюдение условий, при которых обеспечение исполнения обязанности по уплате таможенных пошлин, налогов, специальных, антидемпинговых, компенсационных пошлин не предоставля…' },
  { code: '07037', name: 'Регистрационный номер инвестиционного проекта по реестру инвестиционных проектов, соответствующих приоритетным видам деятельности (секторам экономики) государств - членов Евразийского экономическог…' },
  { code: '07040', name: 'Сертификат обеспечения исполнения обязанности по уплате таможенных пошлин, налогов' },
  { code: '07041', name: 'Свидетельство о предоставленном обеспечении (для Республики Беларусь)' },
  { code: '07042', name: 'Таможенная расписка (для Российской Федерации)' },
  { code: '07051', name: 'Соглашение о защите и поощрении капиталовложений (для Российской Федерации)' },
  { code: '07052', name: 'Свидетельство о регистрации лица, совершающего операции с прямогонным бензином, либо свидетельство о регистрации лица, совершающего операции с бензолом, параксилолом или ортоксилолом, либо свидетел…' },
  { code: '08011', name: 'Документ об условиях переработки товаров на таможенной территории Евразийского экономического союза' },
  { code: '08012', name: 'Документ об условиях переработки товаров вне таможенной территории Евразийского экономического союза' },
  { code: '08013', name: 'Документ об условиях переработки товаров для внутреннего потребления' },
  { code: '08014', name: 'Заявление о вывозе товаров, помещенных под таможенную процедуру свободной таможенной зоны в Магаданской области Российской Федерации, предназначенных для собственных производственных и технологичес…' },
  { code: '08015', name: 'Заключение уполномоченного органа (организации) либо независимой экспертной организации государства - члена Евразийского экономического союза о нормах выхода продуктов переработки, образовавшихся в…' },
  { code: '08016', name: 'Документ, устанавливающий стандартные нормы выхода продуктов переработки, образовавшихся в результате совершения операций по переработке на таможенной территории Евразийского экономического союза' },
  { code: '08021', name: 'Заключение уполномоченного государственного органа государств - членов Евразийского экономического союза о возможности, способе и месте уничтожения товаров' },
  { code: '08031', name: 'Заключение о признании товара, изготовленного (полученного) с использованием иностранных товаров, помещенных под таможенную процедуру свободной таможенной зоны или таможенную процедуру свободного с…' },
  { code: '08032', name: 'Заключение о признании товара, изготовленного (полученного) с использованием иностранных товаров, помещенных под таможенную процедуру свободной таможенной зоны или таможенную процедуру свободного с…' },
  { code: '08033', name: 'Документ, свидетельствующий о включении лица в Реестр владельцев свободных складов' },
  { code: '08034', name: 'Документ, удостоверяющий регистрацию лица в качестве резидента (участника, субъекта) свободной (специальной, особой) экономической зоны' },
  { code: '08035', name: 'Соглашение (договор) об осуществлении (ведении) деятельности на территории свободной (специальной, особой) экономической зоны (договор об условиях деятельности в свободной (специальной, особой) эко…' },
  { code: '08036', name: 'Договор об оказании услуг по складированию (хранению) товаров, погрузке (разгрузке) товаров и иным грузовым операциям, связанным с хранением, а также по обеспечению сохранности товаров и подготовке…' },
  { code: '08037', name: 'Документы, подтверждающие статус товаров Евразийского экономического союза, перевозимых с территории свободной (специальной, особой) экономической зоны на остальную часть таможенной территории Евра…' },
  { code: '08999', name: 'Иные документы, подтверждающие условия помещения товаров под заявленные таможенные процедуры' },
  { code: '09001', name: 'Международный весовой сертификат транспортного средства, выдаваемый в соответствии с Международной конвенцией о согласовании условий проведения контроля грузов на границах, принятой в г. Женеве 21…' },
  { code: '09002', name: 'Разрешение на проезд автомобильного транспортного средства иностранного государства по территории государства–члена Евразийского экономического союза, выданное уполномоченным органом государства– ч…' },
  { code: '09003', name: 'Разрешение на проезд транспортного средства, максимальные весовые и (или) габаритные размеры которого превышают допустимые параметры, установленные для проезда по автомобильным дорогам общего польз…' },
  { code: '09004', name: 'Многостороннее разрешение на проезд автомобильного транспортного средства иностранного государства по территории государства–члена Евразийского экономического союза, выданное в рамках системы разре…' },
  { code: '09005', name: 'Разрешение (специальное разрешение) на проезд автомобильного транспортного средства иностранного государства по территории государства–члена Евразийского экономического союза с территории или на те…' },
  { code: '09006', name: 'Разрешение (специальное разрешение) на проезд автомобильного транспортного средства иностранного государства с опасным грузом по территории государства–члена Евразийского экономического союза, выда…' },
  { code: '09011', name: 'Документ, свидетельствующий о включении лица в Реестр уполномоченных экономических операторов' },
  { code: '09013', name: 'Транзитная декларация' },
  { code: '09015', name: 'Таможенные документы иностранных государств, используемые для таможенных целей в соответствии с международными договорами в рамках Евразийского экономического союза и международными договорами Евра…' },
  { code: '09016', name: 'Документ, подтверждающий приобретение акцизных (специальных) марок для маркировки подакцизных (маркируемых) товаров' },
  { code: '09017', name: 'Источники ценовой информации, используемые для расчета скорректированной таможенной стоимости товаров' },
  { code: '09018', name: 'Декларация таможенной стоимости' },
  { code: '09019', name: 'Регистрационный номер уведомления о размещении товаров в зоне таможенного контроля' },
  { code: '09020', name: 'Графические материалы: фотографии товаров' },
  { code: '09021', name: 'Графические материалы: схемы, чертежи, рисунки товаров' },
  { code: '09022', name: 'Графические материалы: технические и технологические документы, каталоги' },
  { code: '09023', name: 'Иные графические материалы' },
  { code: '09024', name: 'Свидетельство о допущении транспортного средства международной перевозки к перевозке товаров под таможенными пломбами и печатями' },
  { code: '09025', name: 'Сведения о завершении процедуры таможенного транзита' },
  { code: '09026', name: 'Подтверждение о регистрации документов, представленных для помещения товаров на временное хранение' },
  { code: '09027', name: 'Акт возврата транспортного средства и товара, оформленный должностными лицами государственных органов государства–члена Евразийского экономического союза, осуществляющими контроль в автомобильном п…' },
  { code: '09028', name: 'Акт ветеринарно-санитарного досмотра, оформленный должностным лицом государственного органа государства – члена Евразийского экономического союза, осуществляющим ветеринарно-санитарный контроль' },
  { code: '09029', name: 'Акт карантинного фитосанитарного контроля (надзора), оформленный должностным лицом государственного органа государства–члена Евразийского экономического союза, осуществляющим карантинный фитосанита…' },
  { code: '09030', name: 'Акт санитарно-карантинного осмотра (досмотра), оформленный должностным лицом государственного органа государства–члена Евразийского экономического союза, осуществляющим санитарно-карантинный контро…' },
  { code: '09031', name: 'Декларация на товары в отношении ранее ввезенных товаров, идентичных декларируемым товарам, заявленная таможенная стоимость которых принята таможенным органом по результатам дополнительной проверки' },
  { code: '09032', name: 'Декларация о сделках с древесиной (для Российской Федерации)' },
  { code: '09033', name: 'Решение о внесении изменений (дополнений) в декларацию на товары (решение таможенного органа о внесении изменений и (или) дополнений в сведения, указанные в декларации на товары, по форме, утвержде…' },
  { code: '09034', name: 'Документ, свидетельствующий о включении лица в реестр таможенных представителей, или регистрационный номер лица в реестре таможенных представителей' },
  { code: '09036', name: 'Декларация на транспортное средство' },
  { code: '09037', name: 'Заявление о выпуске товаров до подачи декларации на товары' },
  { code: '09038', name: 'Документ, подтверждающий признание таможенным органом в соответствии с законодательством государств - членов Евразийского экономического союза о таможенном регулировании факта уничтожения и (или) б…' },
  { code: '09039', name: 'Документ, подтверждающий конфискацию или обращение товаров в собственность (доход) государства - члена Евразийского экономического союза в соответствии с законодательством этого государства' },
  { code: '09040', name: 'Протокол о задержании товаров и документов на них' },
  { code: '09041', name: 'Список ввозимых без маркировки товаров, предусмотренный порядком согласования таможенным органом ввоза без маркировки товаров, подлежащих маркировке, аккредитованными в Республике Армения дипломати…' },
  { code: '09042', name: 'Статистическая форма предоставления сведений о товарах, перевозимых между государствами – членами Евразийского экономического союза (для Республики Армения)' },
  { code: '09043', name: 'Квалификационное свидетельство специалиста по таможенному оформлению (для Республики Армения)' },
  { code: '09044', name: 'Свидетельство о включении в реестр таможенных перевозчиков' },
  { code: '09045', name: 'Свидетельство о регистрации транспортного средства' },
  { code: '09046', name: 'Декларация на товары электронной торговли' },
  { code: '09050', name: 'Техническая документация на товары, содержащие в своем составе элементы, классифицируемые в товарной позиции 2844 ТН ВЭД ЕАЭС, подтверждающая наличие в этих товарах ядерных материалов и (или) радио…' },
  { code: '09051', name: 'Паспорт (сертификат) радиоактивных веществ (радионуклидных источников) (для Российской Федерации)' },
  { code: '09052', name: 'Требование таможенного органа о внесении изменений (дополнений) в таможенную декларацию' },
  { code: '09053', name: 'Обращение о внесении изменений (дополнений) в таможенные документы' },
  { code: '09054', name: 'Таможенный приходный ордер или иной таможенный документ, в котором исчислены суммы таможенных пошлин, налогов, уплаченных при ввозе в государство - член Евразийского экономического союза, присоедин…' },
  { code: '09055', name: 'Таможенный приходный ордер или иной таможенный документ, заполненный в отношении автомобилей легковых и прочих моторных транспортных средств, классифицируемых в товарных позициях 8702 и 8703 , субп…' },
  { code: '09057', name: 'Нов. ред. Решение 139 от 10.12.2024 Коллегии ЕЭК Документ, подтверждающий включение лица в реестр операторов электронной торговли, или регистрационный номер лица в реестре операторов электронной то…' },
  { code: '09059', name: 'Номер и дата документа, утверждающего создание зоны таможенного контроля в сооружениях, помещениях (частях помещений) и (или) на открытых площадках (частях открытых площадок) уполномоченного эконом…' },
  { code: '09990', name: 'Документы, составленные таможенными органами по результатам проведения таможенного контроля, непоименованные в настоящем классификаторе' },
  { code: '09991', name: 'Электронный сопроводительный документ на транспортировку древесины и продукции ее переработки (для Российской Федерации)' },
  { code: '09999', name: 'Иные документы' },
  { code: '10011', name: 'Дата окончания заявленного срока временного ввоза товаров и признак продолжительности действия заявленной таможенной процедуры временного ввоза (допуска) (цифра "1", если срок временного ввоза сост…' },
  { code: '10012', name: 'Дата окончания заявленного срока временного вывоза товаров и признак продолжительности действия заявленной таможенной процедуры временного вывоза (цифра "1", если срок временного вывоза составляет…' },
  { code: '10013', name: 'Заявленный срок переработки товаров, если декларация на товары используется в качестве документа об условиях переработки товаров' },
  { code: '10014', name: 'Стоимость операций по переработке товаров при помещении под таможенную процедуру выпуска для внутреннего потребления продуктов переработки товаров, помещенных под таможенную процедуру переработки в…' },
  { code: '10015', name: 'Заявленный срок переработки на таможенной территории, вне таможенной территории или для внутреннего потребления, если такая переработка осуществляется на основании документа об условиях переработки' },
  { code: '10017', name: 'Признак фактической продолжительности действия таможенной процедуры временного ввоза (допуска) (цифра "1", если срок временного ввоза составляет менее одного года, или цифра "2", если срок временно…' },
  { code: '10018', name: 'Признак фактической продолжительности действия таможенной процедуры временного вывоза (цифра "1", если срок временного вывоза составляет менее одного года, или цифра "2", если срок временного вывоз…' },
  { code: '10020', name: 'Последний день срока временного нахождения и использования на таможенной территории Евразийского экономического союза товаров в соответствии с таможенной процедурой временного ввоза (допуска) без у…' },
  { code: '10021', name: 'Иные сведения, заявляемые (указываемые) в таможенных документах в соответствии с законодательством Республики Беларусь' },
  { code: '10022', name: 'Иные сведения, заявляемые (указываемые) в таможенных документах в соответствии с законодательством Республики Казахстан о таможенном регулировании' },
  { code: '10023', name: 'Иные сведения, заявляемые (указываемые) в таможенных документах в соответствии с законодательством Российской Федерации о таможенном регулировании' },
  { code: '10024', name: 'Постановление Правительства Российской Федерации от 05.05.2011 N 339 "О предоставлении из федерального бюджета субсидий на возмещение затрат по уплате ввозной таможенной пошлины и налога на добавле…' },
  { code: '10025', name: 'Иные сведения, заявляемые (указываемые) в таможенных документах в соответствии с законодательством Республики Армения о таможенном регулировании' },
  { code: '10026', name: 'Иные сведения, заявляемые (указываемые) в таможенных документах в соответствии с законодательством Кыргызской Республики о таможенном регулировании' },
  { code: '10027', name: 'Уведомление о начале административного процесса по административному таможенному правонарушению, предметом которого являются приобретенные товары, и о неустановлении лица, совершившего администрати…' },
  { code: '10041', name: 'Заявленный срок уничтожения товаров, помещенных под таможенную процедуру уничтожения' },
  { code: '10042', name: 'Заявленный срок хранения товаров на таможенном складе' },
  { code: '10043', name: 'Сведения о государственной регистрации специализированной пищевой продукции или государственной регистрации пищевой продукции нового вида в соответствии с техническим регламентом Таможенного союза…' },
  { code: '10045', name: 'Сведения об уведомлении о прибытии товаров на таможенную территорию Евразийского экономического союза' },
  { code: '10046', name: 'Информационный ресурс в информационно-телекоммуникационной сети "Интернет"' },
  { code: '10047', name: 'Наименование интернет-площадки (интернет-магазина)' },
  { code: '10050', name: 'Сведения о включении радиоэлектронных средств и (или) высокочастотных устройств гражданского назначения, в том числе встроенных либо входящих в состав других товаров, в единый реестр радиоэлектронн…' },
  { code: '10051', name: 'Сведения о включении лекарственных средств в единый реестр зарегистрированных лекарственных средств Евразийского экономического союза, предусмотренный статьей 14 Соглашения о единых принципах и пра…' },
  { code: '10052', name: 'Сведения о включении соответствующей нотификации в единый реестр нотификаций о характеристиках шифровальных (криптографических) средств и товаров, их содержащих' },
  { code: '10053', name: 'Нов. ред. Решение 68 от 02.06.2026 Коллегии ЕЭК Начало действия редакции - 05.07.2026 г. Код таможенного органа в соответствии с классификатором таможенных органов государств - членов Евразийского…' },
  { code: '10054', name: 'Номер документа, подтверждающего включение юридического лица в реестр владельцев таможенных складов (номер свидетельства о включении юридического лица в реестр владельцев таможенных складов), или р…' },
  { code: '10055', name: 'Номер документа, подтверждающего включение юридического лица в реестр владельцев таможенных складов (номер свидетельства о включении юридического лица в реестр владельцев таможенных складов), или р…' },
  { code: '10056', name: 'Номер и дата документа, разрешающего хранение товаров в местах, не являющихся таможенными складами, а в случае, если в соответствии с законодательством государств - членов Евразийского экономическо…' },
  { code: '10057', name: 'Номер документа, подтверждающего включение юридического лица в реестр владельцев магазинов беспошлинной торговли (номер свидетельства о включении юридического лица в реестр владельцев магазинов бес…' },
  { code: '10060', name: 'Предварительная информация' },
  { code: '10061', name: 'Дата окончания срока, установленного таможенным органом в соответствии с пунктом 5 статьи 205 Таможенного кодекса Евразийского экономического союза (для Республики Беларусь)' },
  { code: '10062', name: 'Дата окончания срока, установленного таможенным органом в соответствии с пунктом 6 статьи 213 Таможенного кодекса Евразийского экономического союза (для Республики Беларусь)' },
  { code: '10063', name: 'Соглашение, заключаемое между Федеральной таможенной службой и управляющей компанией инновационного научно-технологического центра, о предоставлении из федерального бюджета субсидии в порядке, уста…' },
  { code: '10064', name: 'Расчет утилизационного сбора (для Республики Беларусь и Российской Федерации)' },
  { code: '10999', name: 'Иные сведения' },
  { code: '11001', name: 'Документ, удостоверяющий личность' },
  { code: '11002', name: 'Договор с таможенным представителем' },
  { code: '11003', name: 'Документ, удостоверяющий полномочия руководителя декларанта (либо руководителя лица, подающего заявление о выпуске товаров до подачи декларации на товары, либо руководителя лица, представившего сер…' },
  { code: '11004', name: 'Доверенность или иной документ, удостоверяющий полномочия работника на совершение действий от имени декларанта (либо лица, подающего заявление о выпуске товаров до подачи декларации на товары, либо…' },
]

// 2-буквенные коды стран (ЕАЭС «Классификатор стран мира», codeListId 2021) —
// для полей национальности ТС (гр.21/18) и страны места товаров (гр.30),
// которые в КЕДЕН уходят буквами (KZ/CN/RU), а не числовым ОКСМ.
export const ALPHA2_COUNTRIES: { code: string; name: string }[] = [
  { code: 'KZ', name: 'Казахстан' }, { code: 'RU', name: 'Россия' }, { code: 'CN', name: 'Китай' },
  { code: 'BY', name: 'Беларусь' }, { code: 'KG', name: 'Кыргызстан' }, { code: 'UZ', name: 'Узбекистан' },
  { code: 'TJ', name: 'Таджикистан' }, { code: 'TM', name: 'Туркменистан' }, { code: 'AM', name: 'Армения' },
  { code: 'AZ', name: 'Азербайджан' }, { code: 'GE', name: 'Грузия' }, { code: 'MD', name: 'Молдова' },
  { code: 'UA', name: 'Украина' }, { code: 'TR', name: 'Турция' }, { code: 'IR', name: 'Иран' },
  { code: 'AE', name: 'ОАЭ' }, { code: 'DE', name: 'Германия' }, { code: 'US', name: 'США' },
  { code: 'JP', name: 'Япония' }, { code: 'KR', name: 'Республика Корея' }, { code: 'GB', name: 'Великобритания' },
  { code: 'FR', name: 'Франция' }, { code: 'IT', name: 'Италия' }, { code: 'NL', name: 'Нидерланды' },
  { code: 'PL', name: 'Польша' }, { code: 'CZ', name: 'Чехия' }, { code: 'ES', name: 'Испания' },
  { code: 'IN', name: 'Индия' }, { code: 'PK', name: 'Пакистан' }, { code: 'AF', name: 'Афганистан' },
  { code: 'MN', name: 'Монголия' }, { code: 'VN', name: 'Вьетнам' }, { code: 'TH', name: 'Таиланд' },
  { code: 'MY', name: 'Малайзия' }, { code: 'SG', name: 'Сингапур' }, { code: 'ID', name: 'Индонезия' },
  { code: 'HK', name: 'Гонконг' }, { code: 'TW', name: 'Тайвань' }, { code: 'LT', name: 'Литва' },
  { code: 'LV', name: 'Латвия' }, { code: 'EE', name: 'Эстония' }, { code: 'FI', name: 'Финляндия' },
  { code: 'SE', name: 'Швеция' }, { code: 'BE', name: 'Бельгия' }, { code: 'AT', name: 'Австрия' },
  { code: 'CH', name: 'Швейцария' }, { code: 'HU', name: 'Венгрия' }, { code: 'RO', name: 'Румыния' },
  { code: 'BG', name: 'Болгария' }, { code: 'GR', name: 'Греция' }, { code: 'SK', name: 'Словакия' },
  { code: 'SI', name: 'Словения' }, { code: 'PT', name: 'Португалия' }, { code: 'CA', name: 'Канада' },
  { code: 'BR', name: 'Бразилия' }, { code: 'MX', name: 'Мексика' }, { code: 'EG', name: 'Египет' },
  { code: 'ZA', name: 'ЮАР' }, { code: 'SA', name: 'Саудовская Аравия' }, { code: 'IL', name: 'Израиль' },
  { code: 'QA', name: 'Катар' }, { code: 'KW', name: 'Кувейт' }, { code: 'BD', name: 'Бангладеш' },
  { code: 'LK', name: 'Шри-Ланка' }, { code: 'PH', name: 'Филиппины' }, { code: 'AU', name: 'Австралия' },
]

// Цифровые коды валют (Классификатор валют, ОКВ / ISO 4217 numeric) — чтобы искать
// валюту и по буквенному коду (USD), и по цифровому (840). Ключ — codeLat.
export const CURRENCY_NUMERIC: Record<string, string> = {
  USD: '840', EUR: '978', RUB: '643', KZT: '398', CNY: '156', GBP: '826',
  JPY: '392', KRW: '410', TRY: '949', AED: '784', CHF: '756', BYN: '933',
  UAH: '980', KGS: '417', UZS: '860', TJS: '972', AZN: '944', AMD: '051',
  GEL: '981', INR: '356', SGD: '702', HKD: '344', CAD: '124', AUD: '036',
  PLN: '985', CZK: '203', SEK: '752', NOK: '578', DKK: '208', HUF: '348',
  BRL: '986', ZAR: '710', SAR: '682', THB: '764', MYR: '458', IDR: '360',
  VND: '704', PKR: '586', EGP: '818', ILS: '376', QAR: '634', KWD: '414',
}

export const OKEI_QUANTITY_TYPE_CODES: { code: string; name: string }[] = [
  { code: 'РК', name: 'Упаковка' },
  { code: 'РР', name: 'Штука' },
  // Виды упаковки (UN/ECE Rec.21)
  { code: '1A', name: 'Барабан стальной' },
  { code: '1B', name: 'Барабан алюминиевый' },
  { code: '1D', name: 'Барабан фанерный' },
  { code: '1F', name: 'Контейнер гибкий' },
  { code: '1G', name: 'Барабан фибровый' },
  { code: '1W', name: 'Барабан деревянный' },
  { code: '2C', name: 'Бочка деревянная' },
  { code: '3A', name: 'Канистра стальная' },
  { code: '3H', name: 'Канистра пластмассовая' },
  { code: '4A', name: 'Коробка стальная' },
  { code: '4B', name: 'Коробка алюминиевая' },
  { code: '4D', name: 'Коробка фанерная' },
  { code: '4H', name: 'Коробка пластмассовая' },
  { code: '5H', name: 'Мешок из полимерной ткани' },
  { code: '5L', name: 'Мешок текстильный' },
  { code: '44', name: 'Мешок полиэтиленовый' },
  { code: '7B', name: 'Ящик деревянный' },
  { code: '8A', name: 'Поддон деревянный' },
  { code: 'BG', name: 'Мешок' },
  { code: 'BH', name: 'Пачка' },
  { code: 'BK', name: 'Корзина' },
  { code: 'BL', name: 'Кипа' },
  { code: 'BX', name: 'Коробка' },
  { code: 'CK', name: 'Бочка' },
  { code: 'CL', name: 'Бухта' },
  { code: 'CS', name: 'Ящик' },
  { code: 'CT', name: 'Коробка картонная' },
  { code: 'DI', name: 'Барабан железный' },
  { code: 'DR', name: 'Барабан' },
  { code: 'GB', name: 'Баллон газовый' },
  { code: 'PJ', name: 'Труба' },
  { code: 'PL', name: 'Ведро' },
  { code: 'PN', name: 'Доска толстая' },
  { code: 'PO', name: 'Пакет (мешочек)' },
  { code: 'PU', name: 'Лоток' },
  { code: 'PX', name: 'Поддон' },
  { code: 'RO', name: 'Рулон' },
  { code: 'SS', name: 'Ящик стальной' },
  { code: 'ST', name: 'Лист' },
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

export interface ClassifierItem {
  id: string
  classifierCode: string
  code: string
  nameRu: string
  sortOrder: number
  isActive: boolean
}

export interface ClassifierGroup {
  classifierCode: string
  count: number
}

export interface DtGuideEntry {
  graph: string
  title: string
  html: string
}

// Готовность одной ДТ к пакетной выгрузке KEDEN-XML (P6 КЕДЕН-цикл).
// Возвращается массивом из GET /import40/{caseId}/keden-readiness-summary.
export interface DeclarationReadiness {
  declarationId: string
  declarationNumber: string
  isReady: boolean
  missing: string[]
  filled: number
  total: number
}

// Статус декларации в КЕДЕН, отфильтрованный по БИН текущего пользователя
// (GET /keden-declarations/mine). Всё, кроме id, может быть null.
export interface KedenDeclarationStatus {
  id: string
  registrationNumber: string | null
  referenceCode: string | null
  statusName: string | null
  statusDateTimeUtc: string | null
  registeredDateTimeUtc: string | null
  customsPost: string | null
  declarantXin: string | null
  declarantName: string | null
}
