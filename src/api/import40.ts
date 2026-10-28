import type { TnvedEttRateDto } from '@/types/api'
import apiClient from './client'
import type { ConditionalReleaseDto } from './conditionalRelease'
import type { KedenLinkDto } from './kedenLink'
import type { ReworkItemDto } from './import40Rework'
import { i18n } from '@/i18n'
import { heicQueued, uploadTimeoutFor } from '@/utils/heic'
import type {
  Import40TransportMeans,
  Import40GoodsPayment,
  Import40FactPayment,
  Import40GoodsItemInput,
  Import40GoodsExtras,
  Import40GoodsCharacteristic,
  Import40Doc44ItemInput,
  Import40DeclarationExpense,
  DeclarationReadiness,
} from '@/types/api'

export type Import40Action =
  | 'submit-for-processing'
  | 'border-passed'
  // Работа КПП на границе (18.10): прибытие (время, пост, комментарий), отмена отметки, отметки контроля.
  | 'border-arrived'
  | 'border-arrived-cancel'
  | 'border-control'
  | 'border-control-remove'
  | 'submit-declaration'
  | 'release-declaration'
  | 'close-svh'
  | 'issue-invoice'
  // Подтверждение оплаты счёта СВХ (КПП) — Invoiced → Paid, заявку НЕ завершает (задача 2.3).
  | 'confirm-svh-payment'
  // Старое имя действия — алиас confirm-svh-payment, для обратной совместимости.
  | 'confirm-payment-and-complete'
  // Админ: завершить старую заявку без счёта AQNIET, с обязательной причиной.
  | 'complete-without-invoice'
  | 'return-to-client'
  | 'claim'
  | 'set-problem'
  | 'clear-problem'
  | 'cancel'
  // Возврат на один шаг назад (руководитель/админ, с причиной).
  | 'step-back'
  // Ответ клиента на «Что нужно от вас» по проблемной заявке (аудит 5.8).
  | 'client-reply'

// Статусы заявки (совпадают с Import40Status на бэке)
export const IMPORT40_STATUSES = [
  { id: 0, key: 'Draft', short: 'Новая', phase: 'Заявка' },
  { id: 1, key: 'AtBorder', short: 'На границе', phase: 'КПП' },
  { id: 2, key: 'Declaring', short: 'Декларирование', phase: 'Декларант' },
  { id: 3, key: 'Submitted', short: 'ДТ подана', phase: 'Декларант' },
  { id: 4, key: 'Released', short: 'ДТ выпущена', phase: 'Декларант' },
  { id: 5, key: 'SvhClosing', short: 'Закрытие СВХ', phase: 'КПП' },
  { id: 6, key: 'Invoiced', short: 'Счёт выставлен', phase: 'Финансы' },
  { id: 7, key: 'Paid', short: 'Ждёт оплаты услуг AQNIET', phase: 'Финансы' },
  { id: 8, key: 'Done', short: 'Выполнено', phase: 'Архив' },
  { id: 9, key: 'Cancelled', short: 'Отменена', phase: 'Архив' },
] as const

export interface Import40LogDto {
  id: string
  createdAtUtc: string
  text: string
  changedByBusinessRole: string
  // ФИО автора записи (сотрудник) или имя компании клиента — задача 2.4, M2: раньше в истории
  // был только код роли без имени.
  changedByName?: string | null
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
  invoiceValue?: number | null
  currency?: string | null
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
  // Льготная ставка НДС товара (напр. 0.05 для медизделий) — см. одноимённое
  // поле в Import40GoodsItemInput (types/api.ts) для контекста Task 10.
  vatRatePreferential?: number | null
  customsValueKzt?: number | null
  statisticValueUsd?: number | null
  valuationMethodCode?: string | null
  quotaAmount?: number | null
  prohibitionCode?: string | null
  ipoCode?: string | null
  payments?: Import40GoodsPayment[]
  // Товар пришёл из КП без веса/количества (см. KpToDtMapper.MapGoods на бэке) —
  // сумма ТПиН требует проверки декларантом перед подачей.
  needsTpinRecalc?: boolean
  // Номер контейнера (гр.31.3) — Task 1 (бэк).
  containerNumber?: string | null
  // Временный ввоз: месяцев для расчёта 3%×мес (calculate-payments) — Task 1 (бэк).
  tempImportMonths?: number | null
  // Сертификация / экспортный контроль — свободный текст — Task 1 (бэк).
  certificationNote?: string | null
  // ОИС (классификатор ois-indicators: I/N/S) / признаки соблюдения запретов
  // (CSV кодов restriction-marks: С/М/П) — Task 1 (бэк)/Task 9 (фронт).
  oisIndicatorCode?: string | null
  restrictionMarks?: string | null
  oisRegNumber?: string | null
  oisCountryCode?: string | null
  // Маркировка товаров (гр.31.13) — коллекция (Task 2 бэк / Task 9 фронт).
  markings?: Import40GoodsMarking[]
  exciseKind?: string | null
  antiDumpingKind?: string | null
  taxVolumeL?: number | null
  taxAlcoholL?: number | null
  taxPieces?: number | null
  engineVolumeCm3?: number | null
  extras?: Import40GoodsExtras | null
  // Гр.31 строки характеристик (пакет 7). Ответ сервера до пакета 7 — без них: строка 1 из одиночных полей выше.
  characteristics?: Import40GoodsCharacteristic[] | null
  // Гр.33.3 «Маркировка»: NTIN по порядку и GTIN (многострочный текст). Сервер до 15.10 — без них.
  ntins?: string[] | null
  gtin?: string | null
  // Ручные гр.45/46 (решение 16.10.2026): введены декларантом — «Рассчитать» и разделение ДТ их не перезаписывают, пока
  // их не сбросят к расчёту; *Calc — значение последнего расчёта (подсказка «расчёт: X»). Сервер до 16.10 — без них.
  customsValueKztManual?: boolean
  customsValueKztCalc?: number | null
  statisticValueUsdManual?: boolean
  statisticValueUsdCalc?: number | null
  // Часть разделения ЕТТ/ВТО (16.10): SortOrder товара исходной ДТ — по нему «Изменить разделение» переносит правки товара.
  splitSourceSortOrder?: number | null
}

// Зеркалит Import40GoodsMarkingDto / Import40GoodsMarkingRequest на бэке (Task 2).
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

export interface Import40Doc44ItemDto {
  id: string
  sortOrder: number
  docTypeCode?: string | null
  docTypeName?: string | null
  docNumber?: string | null
  docDate?: string | null
  goodsItemIndex?: number | null
  appliesToAll?: boolean | null
  goodsItemIndexes?: string | null
  docStartDate?: string | null
  docValidityDate?: string | null
  issueCountryCode?: string | null
  /** Признак представления документа (R.055 DocPresentKindCode): 0 — не представлен при подаче, 1 — представлен,
   *  2 — не представлен по п. 10 ст. 109 ТК ЕАЭС, 3 — представлен после выпуска. */
  presentKindCode?: string | null
}

// Гр.40 "Предшествующий документ". Один тип на чтение/запись — сервер отдаёт
// id при чтении, но не требует его на upsert (см. Import40PrevDocItemDto /
// Import40PrevDocItemRequest в Import40Contracts.cs).
export interface Import40PrevDocItem {
  id?: string
  docTypeCode: string | null
  docNumber: string | null
  docDate: string | null
  goodsNumber: string | null
  goodsItemIndex: number | null
  sortOrder: number
}

/** Гр. 29: пост на границе (таможенный орган въезда/выезда). */
export interface Import40CustomsOffice {
  code: string | null
  name: string | null
}

export interface Import40DeclarationDto {
  id: string
  caseId: string
  /** Внешнеторговый контракт ДТ (17.10); null — как у заявки. */
  foreignContractId?: string | null
  declarationNumber: string
  /**
   * Своё название ДТ (23.10.2026); null — автоназвание (views/broker/case/dtTitle.ts). Меняется только
   * setDeclarationTitle: в PUT ДТ не входит и замок редактора не двигает. Старый сервер — нет поля.
   */
  title?: string | null
  corridor: string
  procedureCode: string
  sender?: Import40Party | null
  senderDistrict?: string | null
  senderSettlement?: string | null
  senderHouse?: string | null
  senderApt?: string | null
  senderShortName?: string | null
  receiver?: Import40Party | null
  receiverDistrict?: string | null
  receiverSettlement?: string | null
  receiverHouse?: string | null
  receiverApt?: string | null
  receiverBin?: string | null
  receiverCategoryCode?: string | null
  receiverKatoCode?: string | null
  receiverShortName?: string | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  svhCost?: number | null
  releasedAtUtc?: string | null
  transactionNatureCode?: string | null
  transactionFeatureCode?: string | null
  tradeCountryCode?: string | null
  originCountryCode?: string | null
  incotermsPlace?: string | null
  consigneeEqualsDeclarant?: boolean | null
  financialSubjectEqualsDeclarant?: boolean | null
  goodsLocationCode?: string | null
  goodsLocationRegisterNumber?: string | null
  goodsLocationCountryCode?: string | null
  goodsLocationStation?: string | null
  goodsLocationAddress?: string | null
  goodsLocationCustomsOfficeCode?: string | null
  borderCustomsOfficeCode?: string | null
  borderCustomsOfficeName?: string | null
  /** Гр. 29: все посты на границе по порядку, первый — основной (он же в borderCustomsOfficeCode/Name). Старый сервер — нет поля. */
  borderCustomsOffices?: Import40CustomsOffice[] | null
  submissionCustomsOfficeCode?: string | null
  submissionDate?: string | null
  borderTransportModeCode?: string | null
  borderTransportNationality?: string | null
  borderTransportNumbers?: Import40TransportMeans[]
  arrivalTransportModeCode?: string | null
  arrivalTransportNationality?: string | null
  arrivalTransportNumbers?: Import40TransportMeans[]
  rateType?: string | null
  splitRole?: string | null
  splitSourceDeclarationId?: string | null
  // Исходная ДТ разделения ЕТТ/ВТО (у неё есть части): пока части есть — только просмотр, вне сводки готовности и пакетной
  // выгрузки; XML одной её можно (16.10: подают либо её, либо части).
  isSplitReplaced?: boolean
  /** ДТ уже выгружалась XML для КЕДЕН (есть EDocId ДТ или ДТС) — предупреждение перед выгрузкой другого варианта разделения. */
  uploadedToKeden?: boolean
  /** Условный выпуск (17.10); null — без условия. */
  conditionalRelease?: ConditionalReleaseDto | null
  /** Связь с журналом КЕДЕН (17.10): статус, дата, коридор, ДХТ; старый сервер — нет поля. */
  keden?: KedenLinkDto | null
  /** Коридор отмечен сотрудником (21.10, СУР); null — corridor лишь умолчание «green» или пришёл из КЕДЕН. */
  corridorSetAtUtc?: string | null
  // Оптимистичная блокировка (09.10): строка ISO как пришла с сервера (микросекунды) — НЕ превращать в Date,
  // иначе точность упадёт до миллисекунд и сервер ответит 409. Редактор шлёт её обратно как expectedUpdatedAtUtc.
  updatedAtUtc?: string | null
  factPayments?: Import40FactPayment[]
  declarationTypeCode: string
  declarationFeatureCode: string | null
  sheetNumber: number | null
  totalSheets: number | null
  shippingSpecSheets: number | null
  referenceNumber: string | null
  financialSubjectName: string | null
  financialSubjectBin: string | null
  financialSubjectCountryCode: string | null
  financialSubjectRegion: string | null
  financialSubjectCity: string | null
  financialSubjectStreet: string | null
  financialSubjectDistrict: string | null
  financialSubjectSettlement?: string | null
  financialSubjectHouse: string | null
  financialSubjectApt: string | null
  financialSubjectCategoryCode: string | null
  financialSubjectKatoCode: string | null
  financialSubjectShortName: string | null
  declarantName: string | null
  declarantBin: string | null
  declarantCountryCode: string | null
  declarantRegion: string | null
  declarantCity: string | null
  declarantStreet: string | null
  declarantDistrict: string | null
  declarantSettlement?: string | null
  declarantHouse: string | null
  declarantApt: string | null
  declarantCategoryCode: string | null
  declarantKatoCode: string | null
  declarantShortName: string | null
  containerIndicator: boolean
  inlandTransportModeCode: string | null
  deferralDocType: string | null
  deferralNumber: string | null
  deferralDate: string | null
  deferralDueDate: string | null
  guaranteeInvalidFor: string | null
  signatoryFullName: string | null
  signatoryPosition: string | null
  signatoryDocument: string | null
  signatoryDocTypeCode: string | null
  signatoryDocNumber: string | null
  signatoryDocIssueDate: string | null
  signatoryDocIssuedBy: string | null
  signatoryDocCountryCode: string | null
  powerOfAttorney: string | null
  powerOfAttorneyDate: string | null
  powerOfAttorneyValidUntil: string | null
  brokerContractNumber: string | null
  signatoryPhone: string | null
  signedDate: string | null
  dtsFreeOfCharge: boolean
  dtsPlaceName: string | null
  dtsRelation: boolean
  dtsRelationPriceInfluence: boolean
  dtsRelationApproxValue: boolean
  dtsRestriction: boolean
  dtsValueCondition: boolean
  dtsRoyaltyContract: boolean
  dtsRoyaltyFee: boolean
  dtsSubsequentResale: boolean
  dtsMethodReason: string | null
  totalGoodsCount: number
  totalPackagesCount: number
  totalCustomsValue: number
  goodsItems: Import40GoodsItemDto[]
  doc44Items: Import40Doc44ItemDto[]
  prevDocItems: Import40PrevDocItem[]
  expenses: Import40DeclarationExpense[]
}

// Товар ДТ на отправку = поля формы (Import40GoodsItemInput) без customsValue,
// вместо которого бэкенд ждёт invoiceValue (см. formToPayload в views/broker/dt/dtPayload.ts)
export type Import40GoodsUpsert = Omit<Import40GoodsItemInput, 'customsValue'> & {
  invoiceValue?: number | null
}

export interface Import40DeclarationUpsert {
  /** Только PUT: updatedAtUtc ДТ, на которой основана правка; не совпало — 409. Нет — без проверки. */
  expectedUpdatedAtUtc?: string | null
  declarationNumber?: string | null
  corridor?: string | null
  procedureCode?: string | null
  sender?: Import40Party | null
  senderDistrict?: string | null
  senderSettlement?: string | null
  senderHouse?: string | null
  senderApt?: string | null
  senderShortName?: string | null
  receiver?: Import40Party | null
  receiverDistrict?: string | null
  receiverSettlement?: string | null
  receiverHouse?: string | null
  receiverApt?: string | null
  receiverBin?: string | null
  receiverCategoryCode?: string | null
  receiverKatoCode?: string | null
  receiverShortName?: string | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  svhCost?: number | null
  transactionNatureCode?: string | null
  transactionFeatureCode?: string | null
  tradeCountryCode?: string | null
  originCountryCode?: string | null
  incotermsPlace?: string | null
  consigneeEqualsDeclarant?: boolean | null
  financialSubjectEqualsDeclarant?: boolean | null
  goodsLocationCode?: string | null
  goodsLocationRegisterNumber?: string | null
  goodsLocationCountryCode?: string | null
  goodsLocationStation?: string | null
  goodsLocationAddress?: string | null
  goodsLocationCustomsOfficeCode?: string | null
  borderCustomsOfficeCode?: string | null
  borderCustomsOfficeName?: string | null
  /** Гр. 29: все посты на границе по порядку, первый — основной (он же в borderCustomsOfficeCode/Name). Старый сервер — нет поля. */
  borderCustomsOffices?: Import40CustomsOffice[] | null
  submissionCustomsOfficeCode?: string | null
  submissionDate?: string | null
  borderTransportModeCode?: string | null
  borderTransportNationality?: string | null
  borderTransportNumbers?: Import40TransportMeans[]
  arrivalTransportModeCode?: string | null
  arrivalTransportNationality?: string | null
  arrivalTransportNumbers?: Import40TransportMeans[]
  rateType?: string | null
  factPayments?: Import40FactPayment[]
  // Nullable в контракте (Import40DeclarationUpsertRequest.DeclarationTypeCode),
  // в отличие от required-строки в Import40DeclarationDto — сервер сам подставит
  // дефолт, если не передано.
  declarationTypeCode?: string | null
  declarationFeatureCode?: string | null
  sheetNumber?: number | null
  totalSheets?: number | null
  shippingSpecSheets?: number | null
  referenceNumber?: string | null
  financialSubjectName?: string | null
  financialSubjectBin?: string | null
  financialSubjectCountryCode?: string | null
  financialSubjectRegion?: string | null
  financialSubjectCity?: string | null
  financialSubjectStreet?: string | null
  financialSubjectDistrict?: string | null
  financialSubjectSettlement?: string | null
  financialSubjectHouse?: string | null
  financialSubjectApt?: string | null
  financialSubjectCategoryCode?: string | null
  financialSubjectKatoCode?: string | null
  financialSubjectShortName?: string | null
  declarantName?: string | null
  declarantBin?: string | null
  declarantCountryCode?: string | null
  declarantRegion?: string | null
  declarantCity?: string | null
  declarantStreet?: string | null
  declarantDistrict?: string | null
  declarantSettlement?: string | null
  declarantHouse?: string | null
  declarantApt?: string | null
  declarantCategoryCode?: string | null
  declarantKatoCode?: string | null
  declarantShortName?: string | null
  // Как соседние consigneeEqualsDeclarant/financialSubjectEqualsDeclarant:
  // в C# non-nullable bool с дефолтом, но тип формы делаем optional-nullable
  // для единообразия остального интерфейса.
  containerIndicator?: boolean | null
  inlandTransportModeCode?: string | null
  deferralDocType?: string | null
  deferralNumber?: string | null
  deferralDate?: string | null
  deferralDueDate?: string | null
  guaranteeInvalidFor?: string | null
  signatoryFullName?: string | null
  signatoryPosition?: string | null
  signatoryDocument?: string | null
  signatoryDocTypeCode?: string | null
  signatoryDocNumber?: string | null
  signatoryDocIssueDate?: string | null
  signatoryDocIssuedBy?: string | null
  signatoryDocCountryCode?: string | null
  powerOfAttorney?: string | null
  powerOfAttorneyDate?: string | null
  powerOfAttorneyValidUntil?: string | null
  brokerContractNumber?: string | null
  signatoryPhone?: string | null
  signedDate?: string | null
  dtsFreeOfCharge?: boolean
  dtsPlaceName?: string | null
  dtsRelation?: boolean
  dtsRelationPriceInfluence?: boolean
  dtsRelationApproxValue?: boolean
  dtsRestriction?: boolean
  dtsValueCondition?: boolean
  dtsRoyaltyContract?: boolean
  dtsRoyaltyFee?: boolean
  dtsSubsequentResale?: boolean
  dtsMethodReason?: string | null
  goodsItems?: Import40GoodsUpsert[]
  doc44Items?: Import40Doc44ItemInput[]
  prevDocItems?: Import40PrevDocItem[]
  expenses?: Import40DeclarationExpense[]
}

// Состояние редактора ДТ. Секционные компоненты Task 5-7 принимают именно
// его, чтобы не плодить девять разных inline-типов пропсов.
export type Import40DtFormState = Import40DeclarationUpsert & { id: string }

// Shape actually returned by POST .../declarations/extract-batch (server-side
// Import40Endpoints.ToUpsertPreview). Deliberately a separate type from
// Import40DeclarationUpsert: the backend's goods-item request contract uses
// `invoiceValue`, not the `customsValue` field the goods table UI edits — see
// applyExtractionPreview in Import40View.vue for the translation.
export interface Import40ExtractionPreviewGoodsItem {
  description?: string | null
  tnvedCode?: string | null
  countryOfOrigin?: string | null
  quantity?: number | null
  packagesCount?: number | null
  grossWeightKg?: number | null
  netWeightKg?: number | null
  invoiceValue?: number | null
  currency?: string | null
  tradeMarkName?: string | null
  productMarkName?: string | null
  manufacturerName?: string | null
  /** Артикул — из нашего разбора Excel (case/steps/excelFallback) и из Zircon AI (generic, 20.10). */
  productArticle?: string | null
  /** Модель («Model / 型号») — отдельно от артикула (пакет импорта 21.10). */
  productModelName?: string | null
}

/** Товар разбора сверх полей ДТ (индексы — как у declaration.goodsItems). */
export interface Import40ExtractionGoodsExtra {
  /** Единица количества как в документе («pcs», «шт»). */
  measureUnitText?: string | null
  /** Вид упаковки как в документе («картонные коробки», «CT»). */
  packageKindText?: string | null
  /** Страна текстом, когда код не определён. */
  originText?: string | null
}

/**
 * Что распознано сверх тела создания ДТ (пакет импорта 21.10): номер и дата инвойса (гр. 44 04021 — в номер ДТ они не
 * идут), контракт, транспортный документ, адрес отправителя, БИН и адрес получателя, коды из PDF без таблицы (в товары не
 * перенесены), по товарам — единица, вид упаковки, страна текстом. Старый сервер — поля нет.
 */
export interface Import40ExtractionExtras {
  invoiceNumber?: string | null
  invoiceDate?: string | null
  contractNumber?: string | null
  contractDate?: string | null
  transportDocument?: string | null
  senderAddress?: string | null
  receiverBin?: string | null
  receiverAddress?: string | null
  hintCodes?: string[]
  goods?: Import40ExtractionGoodsExtra[]
  /**
   * Перечень документов пакета для гр. 44 от Zircon AI (record.documents, 29.10.2026): по нему «Из документов» добавляет
   * строки гр. 44 (views/broker/dt/goods/aiDoc44.ts). Нет или пусто (старый Zircon AI / старый сервер) — гр. 44 по-старому.
   */
  documents?: Import40ExtractionDocument[] | null
}

/**
 * Документ пакета для гр. 44 (Zircon AI documents.py): code — код вида (классификатор 2009), null — вид не уточнён;
 * forBox44 = false — в гр. 44 не идёт (снимок ИДК); flags — уровня документа: referenced_only (упомянут в другом
 * документе, файла нет), number_from_invoice (упаковочный без своего номера), doc_code_to_verify…; sourceFiles — файлы.
 */
export interface Import40ExtractionDocument {
  kind?: string | null
  code?: string | null
  codeName?: string | null
  name?: string | null
  codeToVerify?: boolean
  forBox44?: boolean
  number?: string | null
  /** 'YYYY-MM-DD' */
  date?: string | null
  flags?: string[]
  sourceFiles?: string[]
}

export interface Import40ExtractionPreview {
  declarationNumber?: string | null
  corridor?: string | null
  procedureCode?: string | null
  sender?: Import40Party | null
  receiver?: Import40Party | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  incotermsPlace?: string | null
  originCountryCode?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  borderTransportNumbers?: Import40TransportMeans[] | null
  arrivalTransportNumbers?: Import40TransportMeans[] | null
  goodsItems?: Import40ExtractionPreviewGoodsItem[] | null
}

// A declaration field where the uploaded documents disagreed (e.g. two files giving
// different receiver BINs) — server picked `value`, but `alternatives` weren't discarded.
export interface Import40ExtractionConflictAlternative {
  value?: string | null
  sourceDocument?: string | null
}

export interface Import40ExtractionConflict {
  field: string
  fieldLabel: string
  value?: string | null
  sourceDocument?: string | null
  alternatives: Import40ExtractionConflictAlternative[]
}

export interface Import40ExtractionResult {
  declaration: Import40ExtractionPreview
  warnings: string[]
  conflicts: Import40ExtractionConflict[]
  /** Сохранённая сверка документов этого разбора (17.10); после создания ДТ связываем её с ДТ. */
  documentCheckId?: string | null
  /** Сведения сверх полей ДТ (пакет импорта 21.10); старый сервер — нет. */
  extras?: Import40ExtractionExtras | null
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

export interface Import40BorderControlDto {
  id: string
  /** phyto | veterinary | sanitary | transport | customs | other (views/broker/case/borderKinds.ts). */
  kind: string
  /** Текст «другого» контроля. */
  text: string | null
  atUtc: string
  /** Кто отметил — только сотрудникам. */
  userName: string | null
}

/** Поля тела действия, кроме value: счёт СВХ (сумма/номер/дата), сообщение клиенту, пост прибытия. */
export interface Import40ActionExtra {
  amount?: number | null
  number?: string | null
  date?: string | null
  clientMessage?: string | null
  post?: string | null
}

export interface Import40CaseDto {
  id: string
  /** ИМ-2026-0001 — сквозной номер заявки */
  number: string
  svhInvoiceAmount: number | null
  svhInvoiceNumber: string
  svhInvoiceDate: string | null
  cancelReason: string
  cancelledAtUtc: string | null
  createdAtUtc: string
  updatedAtUtc: string
  clientId: string
  clientName: string
  /** Внешнеторговый контракт заявки (17.10). */
  foreignContractId?: string | null
  cargo: string
  post: string
  /** «Машина прибыла» (КПП, 18.10): время и пост; комментарий — только сотрудникам. null — не отмечено. */
  borderArrivedAtUtc?: string | null
  borderArrivalPost?: string | null
  borderArrivalNote?: string | null
  /** Отметки контроля на границе (по времени). */
  borderControls?: Import40BorderControlDto[]
  /** Факт СВХ против ДТ и простой (21.10.2026); null — не вносили. */
  svhFact?: Import40SvhFact | null
  status: number
  isProblem: boolean
  // Внутренняя заметка — сервер отдаёт клиенту пустую строку (аудит 2.9).
  problemNote: string
  // Сообщение клиенту — видят все.
  problemClientMessage: string
  returnReason: string
  assignedKppId: string | null
  assignedDeclarantId: string | null
  // ФИО исполнителей — видят все сотрудники, не только те, кто может назначать (аудит M3).
  assignedKppName: string | null
  assignedDeclarantName: string | null
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
  // Пакет 6 №1: предзаполнение от клиента при подаче (мастер).
  clientSenderName: string
  clientSenderCountryCode: string
  clientReceiverName: string
  clientReceiverBin: string
  clientReceiverCountryCode: string
  clientCurrencyCode: string
  clientEstimatedValue: number | null
  containers: Import40ContainerDto[]
  declarations: Import40DeclarationDto[]
  logs: Import40LogDto[]
  /** Возврат на доработку с пунктами (17.10) — «вернули на доработку» и без комментария. */
  reworkRequested?: boolean
  /** Незакрытые пункты доработки (карточка заявки, ответ отправки на оформление). */
  openReworkItems?: ReworkItemDto[] | null
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
  | 'border-scans'
  | 'loading-photos'

export interface Import40FileDto {
  id: string
  section: Import40FileSection
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedByBusinessRole: string
  createdAtUtc: string
  // ФИО сотрудника, если он загрузил файл за клиента (например, чек оплаты — задача 2.3).
  // null, если загрузил сам клиент.
  uploadedByStaffName?: string | null
  // Вид документа из чек-листа (раздел documents): invoice | transport | packing | contract |
  // origin | conformity | permit | other. null — вид не указан.
  docKind?: string | null
}

// Счёт AQNIET (BrokerInvoice) в карточке заявки — шаг 6 (задача 2.3).
export interface Import40CaseInvoiceDto {
  id: string
  kind: 'invoice' | 'act'
  status: number
  number: string
  year: number
  total: number
  issuedAtUtc: string | null
  paidAtUtc: string | null
}

export interface KedenReadinessDto {
  missing: string[]
  filled: number
  total: number
  // Полнота ДТ как бланка (46 граф) — отдельный счётчик от готовности к
  // выгрузке KEDEN-XML выше, см. DtBlankCompleteness.cs на сервере.
  blankFilled: number
  blankTotal: number
  blankEmptyGraphs: string[]
  // Те же пункты, что в missing, с привязкой к графе бланка (волна 6а): graph — «А», «8», «30», «44», «ДТС»…;
  // goodsIndex — номер товара с 0 для пунктов по товару. Старый сервер поля не отдаёт — тогда разбор строки.
  items?: KedenReadinessItem[]
  // Предупреждения (выгрузку не блокируют, в missing не входят): напр. строка гр.31 без количества с единицей.
  warnings?: KedenReadinessItem[]
}

export interface KedenReadinessItem {
  text: string
  graph: string | null
  goodsIndex: number | null
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
  // Пакет 6 №1: предзаполнение от клиента (мастер подачи).
  clientSenderName?: string
  clientSenderCountryCode?: string
  clientReceiverName?: string
  clientReceiverBin?: string
  clientReceiverCountryCode?: string
  clientCurrencyCode?: string
  clientEstimatedValue?: number | null
}

export interface Import40ContainerUpsertRequest {
  containerNumber: string
  containerType?: string | null
  notes?: string | null
}

export interface ImportQuotePayload {
  quoteId: string
  targetDeclarationId?: string | null
  force?: boolean
}

// POST /import40/calculate-customs-value (Spec 4a Task 2) — распределяет
// расходы (`expenses`) по товарам и возвращает таможенную стоимость (гр.45)
// для каждого. `index` в запросе/ответе — 0-based позиция товара в массиве
// goodsItems декларации (см. ApplyGoods на бэке: sortOrder присваивается по
// позиции в массиве при сохранении, без отдельного поля sortOrder в форме).
export interface Import40CvGoodsInput {
  index: number
  grossWeightKg?: number | null
  invoiceValue?: number | null
  currency?: string | null
  /** Гр.45, введённая вручную: гр.46 ответа считается от неё (customsValueKzt ответа — всё равно расчётная). */
  manualCustomsValueKzt?: number | null
}

export interface Import40CvExpenseInput {
  expenseTypeCode: string
  amount: number
  currencyCode: string
}

export interface Import40CalculateCustomsValueRequest {
  goods: Import40CvGoodsInput[]
  expenses: Import40CvExpenseInput[]
  onDate?: string | null
}

export interface Import40CvGoodsResult {
  index: number
  customsValueKzt: number
  distributedExpensesKzt: number
  // гр.46 = гр.45 / курс USD на дату гр.А (тот же курс, что и для гр.45); null — нет курса USD.
  statisticValueUsd?: number | null
}

// Курсы НБ РК на дату гр.А (GET /import40/rates-on-date). official = false — НБ РК недоступен,
// показан ближайший известный курс (своя история/текущий).
export interface Import40RatesOnDate {
  date: string | null
  official: boolean
  rates: Record<string, number>
}

export interface Import40CalculateCustomsValueResult {
  goods: Import40CvGoodsResult[]
}

// Task 9 (бэк) / Task 10 (фронт): расчёт платежей гр.47 (по товару) и гр.В
// (итог по ДТ) — POST .../declarations/{id}/calculate-payments. Товары
// берутся сервером из уже СОХРАНЁННОЙ декларации (см. CalculatePayments в
// Import40Endpoints.cs), запрос без тела не нужен — поэтому вызывающая
// сторона обязана сперва saveDt(). Зеркалит C#-контракты 1:1
// (Import40Contracts.cs: PaymentRowDto/PaymentGoodsRowDto/CalculatePaymentsResponse) —
// camelCase JSON, имена полей совпадают с C# после сериализации.
export interface Import40PaymentRowDto {
  taxModeCode: string
  base?: number | null
  rate?: number | null
  amount: number
  // Task 3 (бэк) / Task 10 (фронт): готовые подписи "Основа начисления"/"Ставка"
  // (например "6 МРП", "12.5%") и код способа платежа (гр.47 "СП") — показываем
  // их вместо числовых base/rate, когда есть (у сбора/акциза база не всегда
  // числовая — см. FeeBasisLabel на бэке).
  basisLabel?: string | null
  rateLabel?: string | null
  featureCode?: string | null
  // Детальная строка гр.В: "{код}-{сумма}-398-{дата ддммгггг}-БН".
  bLine?: string | null
  // Вид ставки («%» / «*» за единицу), единица ОКЕИ и валюта (N3) специфической ставки — как в КЕДЕН.
  rateKind?: string | null
  rateUnitCode?: string | null
  rateCurrencyCode?: string | null
}

export interface Import40PaymentGoodsRowDto {
  index: number
  rows: Import40PaymentRowDto[]
  excisePossible: boolean
  // Почему по товару нет строк гр.47 (например, кода нет в справочнике ТН ВЭД).
  error?: string | null
  // Пояснения расчёта: акциз/пошлина не посчитаны без количества, вид акциза взят по умолчанию и т.п.
  notes?: string | null
  /** Ставка ЕТТ товара: ЕЭК или КЕДЕН (флаг Tariff:EttSource) и почему запасная. */
  ettRate?: TnvedEttRateDto | null
  /** Чем посчитана пошлина 2010: ЕТТ, ставка ВТО или ставка страны происхождения. */
  dutyRateSource?: 'ett' | 'vto' | 'country' | null
}

export interface Import40CalculatePaymentsResponse {
  goodsRows: Import40PaymentGoodsRowDto[]
  totalsByTaxMode: Record<string, number>
  grandTotalB: number
}

// Spec 4b Task 3: разделение ДТ на ЕТТ/ВТО. `vtoStatus` — длинная человекочитаемая
// подсказка с сервера (см. split-suggestion), не код — показываем как есть, с усечением/tooltip.
export interface Import40SplitSuggestionRow {
  sortOrder: number
  tnvedCode?: string | null
  vtoStatus?: string | null
  isVtoCandidate: boolean
  // Task 12 (item N): человекочитаемые ставки пошлины (например «10%», «0%») для сравнения ЕТТ vs ВТО.
  ettRate?: string | null
  vtoRate?: string | null
  // Наименование товара (гр.31) — окно «Изменить разделение» перечисляет, какие товары перейдут ЕТТ↔ВТО.
  description?: string | null
}

/** Часть разделения и её отметка версии из split-state (строка как пришла — без перевода в Date: микросекунды). */
export interface Import40SplitPartVersion {
  id: string
  updatedAtUtc: string
}

export interface Import40SplitRequest {
  vtoGoodSortOrders: number[]
  // «Изменить разделение» (16.10): у исходной ДТ уже есть части — заменить их новыми.
  replaceExisting?: boolean
  // Отметки частей, по которым окно показало, что изменится: часть с тех пор изменили — 409 Import40.SplitPartsChanged.
  expectedParts?: Import40SplitPartVersion[]
}

// GET split-state исходной ДТ (16.10): части и что потеряется/вернётся при «Изменить разделение».
export interface Import40SplitPart {
  id: string
  role: string | null
  declarationNumber: string
  goodsCount: number
  hasPayments: boolean
  factPaymentsCount: number
  // Часть разделена ещё раз (старая цепочка до 16.10).
  hasChildren: boolean
  // Отметка версии части — вернуть в expectedParts при «Заменить части».
  updatedAtUtc: string
  // Часть уже выгружалась в КЕДЕН (XML ДТ или ДТС): старый черновик там останется — удалить вручную.
  uploadedToKeden: boolean
}
export interface Import40SplitAddedGoods {
  declarationId: string
  role: string | null
  sortOrder: number
  description: string | null
  tnvedCode: string | null
}
export interface Import40SplitState {
  sourceDeclarationId: string
  parts: Import40SplitPart[]
  // SortOrder товаров исходной ДТ, которые сейчас в ВТО — предвыбор.
  vtoSortOrders: number[]
  // Правки товаров частей переносятся; false — ДТ разделена до 16.10: товары, документы, расходы — из исходной.
  goodsCarryOver: boolean
  // Добавлены в части вручную — пропадут.
  addedGoods: Import40SplitAddedGoods[]
  // Удалены из частей — вернутся из исходной ДТ.
  returnedSortOrders: number[]
  expensesFromSource: boolean
  // Товары с ручными строками гр.47 в частях (SortOrder исходной ДТ).
  manualPaymentSortOrders: number[]
  // Почему изменить нельзя; null — можно.
  blockedReason: string | null
}

export interface Import40SplitResult {
  originalDeclarationId: string
  // null — в ВТО ушли все товары (в т.ч. единственный), ЕТТ-часть не создавалась.
  ettDeclarationId: string | null
  vtoDeclarationId: string
  // Платежи новых ДТ пересчитаны сервером по их ставкам; false — нужно «Рассчитать платежи».
  paymentsRecalculated: boolean
  // Части заменены («Изменить разделение»).
  replaced?: boolean
}

export interface Import40CanCreateDto {
  canCreate: boolean
  reason: string | null
  needNew: 'contract' | 'poa' | null
  profileComplete: boolean
  contractOk: boolean
  poaOk: boolean
}

export const import40Api = {
  list: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40')
    return response.data.items
  },

  // Единая проверка регистрации (аудит 5.3/5.4) — источник истины для плашки, «Моей компании»
  // и мастера заявки; повторяет проверку самого POST /import40, чтобы не разъезжаться с ней.
  // silent — экран сам показывает ошибку по месту («Моя компания»), без тоста перехватчика.
  canCreate: async (opts?: { silent?: boolean }): Promise<Import40CanCreateDto> => {
    const response = await apiClient.get<Import40CanCreateDto>(
      '/import40/can-create',
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  myTasks: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40/my-tasks')
    return response.data.items
  },

  // silent — экран сам рисует «не найдена»/«повторить» (карточка поставки клиента), без тоста перехватчика.
  get: async (id: string, opts?: { silent?: boolean }): Promise<Import40CaseDto> => {
    const response = await apiClient.get<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`, opts?.silent ? { silent: true } : undefined)
    return response.data
  },

  create: async (data: Import40CreateRequest): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>('/import40', data)
    return response.data
  },

  // silent — автосохранение мастера клиента: ошибку показывает сам экран (статус в шапке), без тоста на каждый сбой.
  update: async (id: string, data: Import40UpdateRequest, opts?: { silent?: boolean }): Promise<Import40CaseDto> => {
    const response = await apiClient.put<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`, data, opts?.silent ? { silent: true } : undefined)
    return response.data
  },

  action: async (
    id: string,
    action: Import40Action,
    value?: string,
    extra?: Import40ActionExtra,
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/actions/${action}`,
      { value: value ?? null, ...(extra ?? {}) },
    )
    return response.data
  },

  addContainer: async (
    id: string,
    data: Import40ContainerUpsertRequest,
    opts?: { silent?: boolean },
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers`,
      data,
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  /** Факт СВХ (21.10.2026): всё целиком, пустое поле очищает. */
  updateSvhFact: async (id: string, data: Import40SvhFactRequest): Promise<Import40CaseDto> =>
    (await apiClient.put<Import40CaseDto>(`/import40/${encodeURIComponent(id)}/svh-fact`, data, { silent: true })).data,

  updateContainer: async (
    id: string,
    containerId: string,
    data: Import40ContainerUpsertRequest,
    opts?: { silent?: boolean },
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.put<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}`,
      data,
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  deleteContainer: async (id: string, containerId: string, opts?: { silent?: boolean }): Promise<Import40CaseDto> => {
    const response = await apiClient.delete<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}`,
      opts?.silent ? { silent: true } : undefined,
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

  /** «Копировать ДТ» (20.10.2026): ДТ-образцы — этой и прошлых заявок того же клиента, свежие сверху. */
  copySources: async (caseId: string): Promise<Import40CopySource[]> => {
    const response = await apiClient.get<Import40CopySource[]>(
      `/import40/${encodeURIComponent(caseId)}/declarations/copy-sources`,
    )
    return response.data
  },

  /** Новая ДТ в заявке caseId по образцу; includeGoods=false — без товаров (шапка, документы на все товары, расходы). */
  copyDeclaration: async (
    caseId: string,
    data: { sourceDeclarationId: string; includeGoods: boolean },
  ): Promise<Import40DeclarationDto> => {
    const response = await apiClient.post<Import40DeclarationDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations/copy`,
      data,
    )
    return response.data
  },

  updateDeclaration: async (
    caseId: string,
    declarationId: string,
    data: Import40DeclarationUpsert,
  ): Promise<Import40DeclarationDto> => {
    // 409 (ДТ изменена в другом окне) редактор показывает постоянной плашкой — без второго сообщения тостом.
    const response = await apiClient.put<Import40DeclarationDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}`,
      data,
      { silentStatuses: [409] },
    )
    return response.data
  },

  // Название ДТ (23.10.2026): свой маршрут — PUT ДТ название не трогает, замок редактора (updatedAtUtc) не двигается,
  // поэтому переименование из списка заявки не мешает открытому редактору. null (и пустое) — вернуть автоназвание.
  setDeclarationTitle: async (caseId: string, declarationId: string, title: string | null): Promise<{ title: string | null }> => {
    const { data } = await apiClient.put<{ title: string | null }>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/title`,
      { title },
    )
    return data
  },

  deleteDeclaration: async (caseId: string, declarationId: string): Promise<void> => {
    await apiClient.delete(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}`,
    )
  },

  // КП только клиента этой заявки (задача 2.4, 3.5/H7) — право import40.declarant, а не
  // sales.read, поэтому декларант больше не ловит 403 в модалке «Импорт из КП».
  caseQuotes: async (caseId: string): Promise<import('./sales').SalesQuoteListItem[]> => {
    const { data } = await apiClient.get<import('./sales').SalesQuoteListItem[]>(
      `/import40/${encodeURIComponent(caseId)}/quotes`,
    )
    return data
  },

  importQuote: async (
    caseId: string,
    payload: ImportQuotePayload,
  ): Promise<{ declarationId: string; addedGoods: number }> => {
    const response = await apiClient.post<{ declarationId: string; addedGoods: number }>(
      `/import40/${encodeURIComponent(caseId)}/import-quote`,
      payload,
    )
    return response.data
  },

  // 200 → файл; 400 → { errors: string[] } с перечнем незаполненного. Тело 400 не JSON или без списка (прокси, сбой) —
  // перечень из одной строки «Не удалось сформировать XML»: validateStatus пропускает 400 мимо перехватчика, и без этого
  // пользователь не увидел бы ничего.
  downloadKedenXml: async (
    caseId: string,
    declarationId: string,
  ): Promise<{ blob: Blob; fileName: string } | { errors: string[] }> => {
    const res = await apiClient.get(`/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/keden-xml`, {
      responseType: 'blob',
      validateStatus: (s) => s === 200 || s === 400,
    })
    if (res.status === 400) {
      const fallback = [i18n.global.t('dt.neUdalosSformirovatXml')]
      try {
        const parsed = JSON.parse(await (res.data as Blob).text()) as { errors?: unknown } | null
        const errors = Array.isArray(parsed?.errors) ? parsed.errors.filter((e): e is string => typeof e === 'string' && !!e) : []
        return { errors: errors.length ? errors : fallback }
      } catch {
        return { errors: fallback }
      }
    }
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'declaration.xml' }
  },

  // Факсимиле бланка ДТ (печать) — работает на любой стадии, без проверки готовности.
  blankPdf: async (caseId: string, declarationId: string): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/blank-pdf`,
      { responseType: 'blob' },
    )
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'declaration.pdf' }
  },

  // silent — страница ДТ спрашивает готовность фоном после каждого сохранения: сбой — просто без тегов, без тоста.
  kedenReadiness: async (caseId: string, declarationId: string, opts?: { silent?: boolean }): Promise<KedenReadinessDto> => {
    const { data } = await apiClient.get<KedenReadinessDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/keden-readiness`,
      opts?.silent ? { silent: true } : undefined,
    )
    return data
  },

  // Готовность всех ДТ заявки к пакетной выгрузке KEDEN-XML (P6).
  // silent — карточка заявки грузит сводку фоном: нет прав или сбой — просто без готовности, без тоста.
  kedenReadinessSummary: async (caseId: string, opts?: { silent?: boolean }): Promise<DeclarationReadiness[]> => {
    const { data } = await apiClient.get<DeclarationReadiness[]>(
      `/import40/${encodeURIComponent(caseId)}/keden-readiness-summary`,
      opts?.silent ? { silent: true } : undefined,
    )
    return data
  },

  // Пакетная выгрузка всех готовых ДТ заявки одним ZIP. 200 → zip-blob;
  // 400 → { message } (нет ни одной готовой ДТ). Зеркалит downloadKedenXml выше.
  downloadKedenBatch: async (
    caseId: string,
  ): Promise<{ blob: Blob; fileName: string } | { error: string }> => {
    const res = await apiClient.get(
      `/import40/${encodeURIComponent(caseId)}/declarations/keden-xml-batch`,
      {
        responseType: 'blob',
        validateStatus: (s) => s === 200 || s === 400,
      },
    )
    if (res.status === 400) {
      const text = await (res.data as Blob).text()
      const parsed = JSON.parse(text) as { message?: string }
      return { error: parsed.message ?? 'Нет готовых ДТ для выгрузки' }
    }
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'keden-batch.zip' }
  },

  // «Скачать все документы» заявки одним ZIP. 200 → zip-blob; 400 → { error }.
  downloadAllDocuments: async (
    caseId: string,
  ): Promise<{ blob: Blob; fileName: string } | { error: string }> => {
    const res = await apiClient.get(
      `/import40/${encodeURIComponent(caseId)}/files/all.zip`,
      { responseType: 'blob', validateStatus: (s) => s === 200 || s === 400 },
    )
    if (res.status === 400) {
      const text = await (res.data as Blob).text()
      const parsed = JSON.parse(text) as { message?: string }
      return { error: parsed.message ?? 'Нет документов' }
    }
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'documents.zip' }
  },

  // Batch-uploads a shipment's document package (invoice/packing-list Excel, CMR,
  // quarantine act, certs — Excel and/or PDF/scans). Aqniet merges what it can
  // extract into one record; the server maps it into an Import40ExtractionPreview,
  // plus any warnings/conflicts spotted between source documents (e.g. two files
  // giving different receiver BINs) — nothing is persisted until the broker
  // reviews/edits and calls createDeclaration explicitly.
  // fileIds — документы, уже загруженные в заявку (19.10.2026): сервер берёт их из хранилища и не сохраняет повторно.
  extractBatch: async (caseId: string, files: File[], fileIds: readonly string[] = []): Promise<Import40ExtractionResult> => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    fileIds.forEach((id) => formData.append('fileIds', id))
    const response = await apiClient.post<Import40ExtractionResult>(
      `/import40/${encodeURIComponent(caseId)}/declarations/extract-batch`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // apiClient's default 30s timeout is fine for ordinary requests but too short
        // here: Zircon AI runs OCR over every scanned PDF and photo in the batch. Цепочка таймаутов (пакет «ocr»):
        // Zircon AI заканчивает OCR пакета к 170 с → сервер CRM ждёт 200 с → nginx 210 с → здесь 220 с, чтобы
        // ответ сервера (или его 504) пришёл раньше, чем браузер оборвёт запрос.
        timeout: 220000,
      },
    )
    return response.data
  },

  // companyName — кратко («ТОО …»), может отсутствовать у клиента без профиля компании.
  listClients: async (opts?: { silent?: boolean }): Promise<{ id: string; username: string; companyName?: string | null }[]> => {
    const response = await apiClient.get<{ id: string; username: string; companyName?: string | null }[]>(
      '/import40/clients',
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  listFiles: async (id: string, opts?: { silent?: boolean }): Promise<Import40FileDto[]> => {
    const response = await apiClient.get<Import40FileDto[]>(
      `/import40/${encodeURIComponent(id)}/files`,
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  // Счета AQNIET по заявке — шаг 6 (задача 2.3).
  listBrokerInvoices: async (id: string, opts?: { silent?: boolean }): Promise<Import40CaseInvoiceDto[]> => {
    const response = await apiClient.get<Import40CaseInvoiceDto[]>(
      `/import40/${encodeURIComponent(id)}/broker-invoices`,
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  uploadFile: async (
    id: string,
    section: Import40FileSection,
    file: File,
    kind?: string,
    // silent — экран сам показывает ошибку загрузки (строка чек-листа мастера), без общего тоста.
    opts?: { silent?: boolean },
  ): Promise<Import40FileDto> => {
    const formData = new FormData()
    formData.append('file', file)
    // Исходник HEIC переводит сервер: по два за раз и с таймаутом 120 с (utils/heic.ts, ревью 22.10).
    const timeout = uploadTimeoutFor(file)
    const response = await heicQueued(file, () => apiClient.post<Import40FileDto>(
      `/import40/${encodeURIComponent(id)}/files`,
      formData,
      {
        params: kind ? { section, kind } : { section },
        headers: { 'Content-Type': 'multipart/form-data' },
        ...(timeout ? { timeout } : {}),
        ...(opts?.silent ? { silent: true } : {}),
      },
    ))
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

  calculateCustomsValue: async (
    payload: Import40CalculateCustomsValueRequest,
  ): Promise<Import40CalculateCustomsValueResult> => {
    const response = await apiClient.post<Import40CalculateCustomsValueResult>(
      '/import40/calculate-customs-value',
      payload,
    )
    return response.data
  },

  splitSuggestion: async (
    caseId: string,
    declarationId: string,
  ): Promise<Import40SplitSuggestionRow[]> => {
    const response = await apiClient.get<Import40SplitSuggestionRow[]>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/split-suggestion`,
    )
    return response.data
  },

  splitState: async (caseId: string, declarationId: string): Promise<Import40SplitState> => {
    const response = await apiClient.get<Import40SplitState>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/split-state`,
    )
    return response.data
  },

  /** silentConflict — 409 без общего тоста: окно «Изменить разделение» само разбирает, что устарело. */
  splitDeclaration: async (
    caseId: string,
    declarationId: string,
    data: Import40SplitRequest,
    opts: { silentConflict?: boolean } = {},
  ): Promise<Import40SplitResult> => {
    const response = await apiClient.post<Import40SplitResult>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/split`,
      data,
      opts.silentConflict ? { silentStatuses: [409] } : undefined,
    )
    return response.data
  },

  // Task 10: расчёт платежей гр.47/гр.В. Никакого тела запроса — сервер сам
  // читает товары из сохранённой декларации (см. комментарий у
  // Import40CalculatePaymentsResponse выше). Вызывающая сторона должна
  // сохранить ДТ непосредственно перед вызовом.
  calculatePayments: async (
    caseId: string,
    declarationId: string,
  ): Promise<Import40CalculatePaymentsResponse> => {
    const response = await apiClient.post<Import40CalculatePaymentsResponse>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/calculate-payments`,
    )
    return response.data
  },

  ratesOnDate: async (date: string | null, codes: string[]): Promise<Import40RatesOnDate> => {
    const { data } = await apiClient.get<Import40RatesOnDate>('/import40/rates-on-date', {
      params: { date: date ?? undefined, codes: codes.join(',') },
    })
    return data
  },
}

/** ДТ-образец для «Копировать ДТ» (CopySourceDeclarationDto сервера). */
export interface Import40CopySource {
  id: string
  caseId: string
  caseNumber: string
  caseCreatedAtUtc: string
  declarationNumber: string
  rateType: string
  splitRole: string | null
  senderName: string | null
  goodsCount: number
  firstGoodsDescription: string | null
  /** Своё название ДТ (23.10.2026), если сервер его отдаёт. */
  title?: string | null
  totalInvoiceValue: number | null
  currency: string | null
  updatedAtUtc: string
}

export type SvhDelayReason = 'client' | 'customs' | 'broker' | 'carrier' | 'svh' | 'other'

/** Факт СВХ (Import40SvhFactDto сервера): въезд/выезд, места и вес против ДТ, сутки и простой. */
export interface Import40SvhFact {
  enteredAtUtc: string | null
  leftAtUtc: string | null
  factPackages: number | null
  factGrossKg: number | null
  tariffPerDay: number | null
  freeDays: number | null
  delayReason: SvhDelayReason | null
  /** Только сотрудникам. */
  note: string | null
  dtPackages: number | null
  dtGrossKg: number | null
  packagesDiffer: boolean
  weightDiffers: boolean
  days: number | null
  paidDays: number | null
  demurrageKzt: number | null
}

export interface Import40SvhFactRequest {
  enteredAtUtc: string | null
  leftAtUtc: string | null
  factPackages: number | null
  factGrossKg: number | null
  tariffPerDay: number | null
  freeDays: number | null
  delayReason: SvhDelayReason | null
  note: string | null
}
