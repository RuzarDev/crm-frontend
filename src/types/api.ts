export interface LoginRequest {
  username: string
  password: string
}

// Путь клиента (2026-09-21): саморегистрация по email + БИН, экспедитор необязателен.
export interface RegisterClientRequest {
  email: string
  password: string
  bin: string
  phone?: string | null
  companyName?: string | null
  legalAddress?: string | null
  directorName?: string | null
  expeditorId?: string | null
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
  businessRoles?: string[]
  /** Клиент: модули для меню — 'import40' | 'transit' */
  modules?: string[]
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
  businessRoles?: string[]
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export interface CatalogBrokerRow {
  id: string
  username: string
  role: string
  businessRole: string
  businessRoles?: string[]
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
  businessRoles?: string[]
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export interface CatalogSalespersonRow {
  id: string
  username: string
  role: string
  businessRole: string
  businessRoles?: string[]
  createdAtUtc: string
  clients: CatalogLinkedPerson[]
}

export type CatalogTabKey = 'administrators' | 'staff' | 'brokers' | 'clients' | 'expeditors' | 'importers' | 'salespersons'

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

/** Привязка клиентов к сотруднику, заведённому не в таблице Broker (мпп на вкладке «Сотрудники»). */
export interface EditStaffClientsRequest {
  clientIds: string[]
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
  // Заполняется бэком при создании из консолидации пакета документов (ReestrEntryMapper.ToDto отдаёт его).
  // Генератор создаёт одну запись на консолидацию, поэтому групп из нескольких строк в списке не бывает.
  sourceConsolidationId?: string | null
}

export interface ReestrEntry {
  id: string
  createdAtUtc: string
  status: ReestrEntryStatus
  clientId: string
  /** См. комментарий у ReestrEntryDto.sourceConsolidationId. */
  sourceConsolidationId?: string | null
  data: Record<string, string | null>
  /** «Итого, ₸» с НДС (ТД + доп. листы); в data не входит — это не колонка Excel-реестра. */
  grandTotalWithVat?: number | null
  /**
   * Цены из Excel-импорта: форма их не показывает, но PUT сервера перезаписывает все поля —
   * при правке записи они уходят обратно без изменений (иначе обнулятся).
   */
  pricePerDeclarationWithVat?: number | null
  pricePerSupplementalSheetWithVat?: number | null
  supplementalSheetsTotalWithVat?: number | null
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
  // --- КЕДЕН-транзит: сериализованный ConsolidationTransitData (скаляры §1/§5/§8-12 + 9 коллекций) ---
  transitDataJson?: string | null
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
  /** Только у стран (ref/countries) — двухбуквенный ISO-код для отображения «Китай (CN)» (аудит 5.13). */
  alpha2?: string | null
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
  isDeduction: boolean
}

export interface AppNotification {
  id: string
  title: string
  body: string
  type: string
  // Заявка Импорта 40, к которой относится уведомление (волна 3) — клик открывает её карточку.
  caseId: string | null
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
  // Страна происхождения (цифровой ОКСМ) и выбранные варианты из КЕДЕН (ключ TnvedTariffOptionDto.key).
  originCountry?: string | null
  exciseKind?: string | null
  antiDumpingKind?: string | null
}

/** Вариант акциза / антидемпинга из КЕДЕН; key передаётся обратно как exciseKind / antiDumpingKind. */
export interface TnvedTariffOptionDto {
  key: string
  rate: string
  condition: string | null
  country: string | null
  endDate: string | null
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
  antiDumpingKzt?: number
  exciseKind?: string | null
  exciseOptions?: TnvedTariffOptionDto[] | null
  antiDumpingOptions?: TnvedTariffOptionDto[] | null
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
  // Не передано (undefined) = сервер оставляет без изменений; '' = очистить; строка = записать.
  // null не слать: сервер трактует его как «не менять».
  companyName?: string
  innBin?: string
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
  // КЕДЕН-транзит §7 (гр.44): хранятся на сервере (ReestrDoc44Item), отдаются в DTO.
  authorizedBody?: string | null
  authorizedBodyId?: string | null
  formBlankNumber?: string | null
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
  // КЕДЕН-транзит §7 (гр.44): сервер хранит и полностью перезаписывает при сохранении —
  // при правке записи их надо отправлять обратно, иначе они затрутся.
  authorizedBody?: string | null
  authorizedBodyId?: string | null
  formBlankNumber?: string | null
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
  nationality?: string | null
  mark?: string | null
  isTrailer?: boolean | null
  headNumber?: string | null
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
  // Task 10 (фронт): подписи из последнего calculate-payments (Основа начисления/
  // Ставка/гр.B-строка) — только для отображения, backend их не требует и не
  // валидирует; taxBase/rateValue остаются источником для сохранения/пересчёта.
  basisLabel?: string | null
  rateLabel?: string | null
  bLine?: string | null
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
  // Льготная ставка НДС товара (напр. 0.05 для медизделий) — Task 9 (бэк), used
  // by calculate-payments (Task 10): при выставлении сервер считает НДС по ней
  // вместо стандартной ставки. null/не задано → стандартная ставка.
  vatRatePreferential?: number | null
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
  // Номер контейнера (гр.31.3), актуален при заполненном признаке контейнерных
  // перевозок гр.19 (containerIndicator на декларации) — Task 1 (бэк).
  containerNumber?: string | null
  // Временный ввоз: количество месяцев для расчёта платежей по ставке
  // 3%×мес (calculate-payments на бэке) — Task 1 (бэк)/Task 6 (фронт).
  // 0/null → обычный импорт.
  tempImportMonths?: number | null
  // Выбор декларанта по данным КЕДЕН: вид акциза и вариант антидемпинговой пошлины (null — не начислять).
  exciseKind?: string | null
  antiDumpingKind?: string | null
  // Количества для специфических ставок пошлины/акциза, которых нет в ДЕИ (гр.41):
  // объём товара (л), объём в литрах 100% спирта, количество штук, суммарный объём двигателей (см³).
  taxVolumeL?: number | null
  taxAlcoholL?: number | null
  taxPieces?: number | null
  engineVolumeCm3?: number | null
  // Сертификация / экспортный контроль — свободный текст, заполняется декларантом
  // вручную (нет авто-маппинга от ТНВЭД) — Task 1 (бэк)/Task 7 (фронт).
  certificationNote?: string | null
  // ОИС (объекты интеллектуальной собственности) / признаки соблюдения запретов
  // (гр.33 «О») — Task 1 (бэк)/Task 9 (фронт).
  oisIndicatorCode?: string | null
  // CSV кодов классификатора restriction-marks (С/М/П) — на форме показывается
  // multi-select, хранится строкой через запятую (см. restrictionMarksArray в
  // Import40GoodsKedenPanel.vue).
  restrictionMarks?: string | null
  oisRegNumber?: string | null
  oisCountryCode?: string | null
  // Маркировка товаров (гр.31.13) — коллекция (Task 2 бэк заменил одиночные
  // marking*-скаляры дочерней коллекцией; Task 9 фронт). Один товар может иметь
  // несколько строк маркировки.
  markings?: Import40GoodsMarking[]
  // Доп. сведения гр.31: характеристики, акцизные марки, автомобили, период, инвестпроект, прослеживаемость.
  extras?: Import40GoodsExtras | null
}

/** Зеркалит Import40GoodsExtrasDto на бэке; даты — 'YYYY-MM-DD'. */
export interface Import40GoodsExtras {
  productionPlaceName?: string | null
  productSortName?: string | null
  standardName?: string | null
  manufactureDate?: string | null
  periodStartDate?: string | null
  periodEndDate?: string | null
  investCountryCode?: string | null
  investProjectSeqId?: string | null
  investProjectYear?: number | null
  investGoodsListKindCode?: string | null
  investProjectGoodsSeqId?: number | null
  traceable?: boolean
  traceQuantity?: number | null
  traceUnitCode?: string | null
  /** Мест, частично занятых товаром (2 товара в 1 коробке): своих мест 0, частично ≥ 1 (гр.31.2). */
  cargoPartQuantity?: number | null
  exciseStamps: Import40GoodsExciseStamp[]
  vehicles: Import40GoodsVehicle[]
  /** 31.2 доп. упаковка: kind 1 — индивидуальная, 2 — груз, 3 — поддоны (основная упаковка — поля товара). */
  packages?: Import40GoodsPackage[]
}

export interface Import40GoodsPackage {
  kind: string
  packageKindCode?: string | null
  quantity?: number | null
  description?: string | null
}

export interface Import40GoodsExciseStamp {
  quantity: number | null
  seriesId?: string | null
}

export interface Import40GoodsVehicle {
  vin?: string | null
  chassisId?: string | null
  bodyId?: string | null
  makeCode?: string | null
  makeName?: string | null
  modelName?: string | null
  manufactureDate?: string | null
  engineId?: string | null
  engineVolumeCm3?: number | null
  powerKw?: number | null
  powerHp?: number | null
  carryingCapacityKg?: number | null
  mileageKm?: number | null
  cost?: number | null
  costCurrency?: string | null
  emergencyDeviceId?: string | null
}

/** Глубокая копия доп. сведений (списки марок/автомобилей — свои объекты у каждой копии товара). */
export const cloneGoodsExtras = (x: Import40GoodsExtras | null | undefined): Import40GoodsExtras | null =>
  x ? { ...x, exciseStamps: (x.exciseStamps ?? []).map((s) => ({ ...s })), vehicles: (x.vehicles ?? []).map((v) => ({ ...v })), packages: (x.packages ?? []).map((p) => ({ ...p })) } : null

// Одна строка маркировки товара (гр.31.13). Зеркалит Import40GoodsMarkingDto /
// Import40GoodsMarkingRequest на бэке (Task 2).
export interface Import40GoodsMarking {
  id?: string | null
  sortOrder?: number | null
  markingAfterRelease?: boolean | null
  kizCount?: number | null
  levelCode?: string | null
  idTypeCode?: string | null
  idApplicationCode?: string | null
  number?: string | null
  aggregated?: boolean | null
}

export interface Import40Doc44ItemInput extends ReestrDoc44ItemInput {
  goodsItemIndex?: number | null
  // гр.44 «на все товары» + мультивыбор товаров: appliesToAll (флаг) или
  // goodsItemIndexes (CSV индексов товаров). goodsItemIndex сохранён для back-compat.
  appliesToAll?: boolean | null
  goodsItemIndexes?: string | null
  docStartDate?: string | null
  docValidityDate?: string | null
  issueCountryCode?: string | null
  // КЕДЕН-транзит §7 (гр.44): у записи реестра (ReestrDoc44Item) эти три поля хранятся
  // (см. ReestrDoc44ItemInput); колонки для файла-вложения нет.
  authorizedBody?: string | null
  authorizedBodyId?: string | null
  formBlankNumber?: string | null
}

// Цифровые коды валют (классификатор валют ЕЭК 2022 = ISO 4217 numeric, полный список на 29.09.2026) —
// чтобы искать валюту и по буквенному коду (USD), и по цифровому (840). Ключ — codeLat.
export const CURRENCY_NUMERIC: Record<string, string> = {
  AED: '784', AFN: '971', ALL: '008', AMD: '051', AOA: '973', ARS: '032', AUD: '036', AWG: '533',
  AZN: '944', BAM: '977', BBD: '052', BDT: '050', BGN: '975', BHD: '048', BIF: '108', BMD: '060',
  BND: '096', BOB: '068', BRL: '986', BSD: '044', BTN: '064', BWP: '072', BYN: '933', BYR: '974',
  BZD: '084', CAD: '124', CDF: '976', CHF: '756', CLP: '152', CNY: '156', COP: '170', COU: '970',
  CRC: '188', CUC: '931', CUP: '192', CVE: '132', CZK: '203', DJF: '262', DKK: '208', DOP: '214',
  DZD: '012', EGP: '818', ERN: '232', ETB: '230', EUR: '978', FJD: '242', FKP: '238', GBP: '826',
  GEL: '981', GHS: '936', GIP: '292', GMD: '270', GNF: '324', GTQ: '320', GYD: '328', HKD: '344',
  HNL: '340', HRK: '191', HTG: '332', HUF: '348', IDR: '360', ILS: '376', INR: '356', IQD: '368',
  IRR: '364', ISK: '352', JMD: '388', JOD: '400', JPY: '392', KES: '404', KGS: '417', KHR: '116',
  KMF: '174', KPW: '408', KRW: '410', KWD: '414', KYD: '136', KZT: '398', LAK: '418', LBP: '422',
  LKR: '144', LRD: '430', LSL: '426', LTL: '440', LVL: '428', LYD: '434', MAD: '504', MDL: '498',
  MGA: '969', MKD: '807', MMK: '104', MNT: '496', MOP: '446', MRO: '478', MRU: '929', MUR: '480',
  MVR: '462', MWK: '454', MXN: '484', MYR: '458', MZN: '943', NAD: '516', NGN: '566', NIO: '558',
  NOK: '578', NPR: '524', NZD: '554', OMR: '512', PAB: '590', PEN: '604', PGK: '598', PHP: '608',
  PKR: '586', PLN: '985', PYG: '600', QAR: '634', RON: '946', RSD: '941', RUB: '643', RWF: '646',
  SAR: '682', SBD: '090', SCR: '690', SDG: '938', SEK: '752', SGD: '702', SHP: '654', SLL: '694',
  SOS: '706', SRD: '968', SSP: '728', STD: '678', STN: '930', SVC: '222', SYP: '760', SZL: '748',
  THB: '764', TJS: '972', TMT: '934', TND: '788', TOP: '776', TRY: '949', TTD: '780', TWD: '901',
  TZS: '834', UAH: '980', UGX: '800', USD: '840', UYI: '940', UYU: '858', UZS: '860', VED: '926',
  VEF: '937', VES: '928', VND: '704', VUV: '548', WST: '882', XAD: '396', XAF: '950', XCD: '951',
  XCG: '532', XDR: '960', XOF: '952', XPF: '953', YER: '886', ZAR: '710', ZMW: '967', ZWG: '924',
  ZWL: '932',
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
