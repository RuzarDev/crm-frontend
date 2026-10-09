// ДТ (Импорт 40): форма ↔ DTO. Перенос один в один из Import40DtView.vue (applyDeclaration, тело PUT
// в saveDt, prefillFromClientCase) — волна 6а, Task 2. Каждое новое поле ДТ — здесь в трёх местах:
// emptyDtForm, dtoToForm, formToPayload (тест «туда-обратно» на полном образце ловит пропуск).
//
// Тело PUT — ВСЕ графы шапки: сервер (с 09.10) очищает графу по явному null, а отсутствующее поле не трогает,
// поэтому пустое уходит именно null (`|| null` для строк — '' → null; `?? null` для чисел — 0 остаётся),
// ключи не опускаются (undefined JSON.stringify выбросил бы). Частичный PUT не поддерживается.
// Товары: на сервере фактурная стоимость — invoiceValue, в форме — customsValue; места — одно видимое поле
// packagesCount, КЕДЕН-поле cargoPlacesQuantity — его копия. Гр.44/40/расходы/гр.B/транспорт — массивами целиком.
// Отличие от прежнего тела: `?? []` у списков и `?? null` у сторон (раньше undefined → ключ выпадал → сервер не трогал).
// Форма из emptyDtForm/dtoToForm их всегда заполняет (тест), так что на деле это ничего не меняет — ключи просто всегда есть.
import dayjs from 'dayjs'
import type {
  Import40CaseDto,
  Import40DeclarationDto,
  Import40DeclarationUpsert,
  Import40DtFormState,
  Import40Party,
  Import40PrevDocItem,
} from '@/api/import40'
import type { Import40Doc44ItemInput, Import40FactPayment, Import40GoodsItemInput } from '@/types/api'
import { cloneGoodsExtras } from '@/types/api'
import { placesOfGoods } from '@/utils/goodsPlaces'

/**
 * Состояние редактора ДТ: общий тип секций, где товары и гр.B — непустые массивы, а товар
 * держит фактурную стоимость в customsValue (на сервере invoiceValue).
 */
export type DtFormState = Omit<Import40DtFormState, 'goodsItems' | 'factPayments' | 'doc44Items' | 'prevDocItems'> & {
  goodsItems: Import40GoodsItemInput[]
  factPayments: Import40FactPayment[]
  doc44Items: Import40Doc44ItemInput[]
  prevDocItems: Import40PrevDocItem[]
}

export const emptyParty = (): Import40Party => ({
  name: null,
  countryCode: null,
  region: null,
  city: null,
  street: null,
})

/** Форма до загрузки ДТ — значения по умолчанию как в прежнем редакторе. */
export const emptyDtForm = (): DtFormState => ({
  id: '',
  declarationNumber: '',
  corridor: 'green',
  procedureCode: '',
  departureCountryCode: null,
  destinationCountryCode: null,
  incoterms: '',
  currency: '',
  exchangeRate: null,
  totalInvoiceValue: null,
  sender: emptyParty(),
  senderDistrict: null,
  senderSettlement: null,
  senderHouse: null,
  senderApt: null,
  senderShortName: null,
  receiver: emptyParty(),
  receiverDistrict: null,
  receiverSettlement: null,
  receiverHouse: null,
  receiverApt: null,
  receiverBin: null,
  receiverCategoryCode: null,
  receiverKatoCode: null,
  receiverShortName: null,
  goodsItems: [],
  doc44Items: [],
  prevDocItems: [],
  expenses: [],
  transactionNatureCode: '',
  transactionFeatureCode: '',
  tradeCountryCode: '',
  originCountryCode: '',
  incotermsPlace: '',
  consigneeEqualsDeclarant: false,
  financialSubjectEqualsDeclarant: false,
  goodsLocationCode: '',
  goodsLocationRegisterNumber: '',
  goodsLocationCountryCode: 'KZ',
  goodsLocationStation: '',
  goodsLocationAddress: '',
  goodsLocationCustomsOfficeCode: '',
  borderCustomsOfficeCode: '',
  borderCustomsOfficeName: '',
  submissionCustomsOfficeCode: '',
  submissionDate: null,
  borderTransportModeCode: '',
  borderTransportNationality: 'KZ',
  borderTransportNumbers: [],
  arrivalTransportModeCode: '',
  arrivalTransportNationality: 'KZ',
  arrivalTransportNumbers: [],
  rateType: 'ETT',
  factPayments: [],
  // Фаза 2 — новые графы бланка (Task 4)
  declarationTypeCode: 'ИМ',
  declarationFeatureCode: null,
  sheetNumber: null,
  totalSheets: null,
  shippingSpecSheets: null,
  referenceNumber: null,
  financialSubjectName: null,
  financialSubjectBin: null,
  financialSubjectCountryCode: null,
  financialSubjectRegion: null,
  financialSubjectCity: null,
  financialSubjectStreet: null,
  financialSubjectDistrict: null,
  financialSubjectSettlement: null,
  financialSubjectHouse: null,
  financialSubjectApt: null,
  financialSubjectCategoryCode: null,
  financialSubjectKatoCode: null,
  financialSubjectShortName: null,
  declarantName: null,
  declarantBin: null,
  declarantCountryCode: null,
  declarantRegion: null,
  declarantCity: null,
  declarantStreet: null,
  declarantDistrict: null,
  declarantSettlement: null,
  declarantHouse: null,
  declarantApt: null,
  declarantCategoryCode: null,
  declarantKatoCode: null,
  declarantShortName: null,
  containerIndicator: false,
  inlandTransportModeCode: null,
  deferralDocType: null,
  deferralNumber: null,
  deferralDate: null,
  deferralDueDate: null,
  guaranteeInvalidFor: null,
  signatoryFullName: null,
  signatoryPosition: null,
  signatoryDocument: null,
  signatoryDocTypeCode: null,
  signatoryDocNumber: null,
  signatoryDocIssueDate: null,
  signatoryDocIssuedBy: null,
  signatoryDocCountryCode: null,
  powerOfAttorney: null,
  powerOfAttorneyDate: null,
  powerOfAttorneyValidUntil: null,
  brokerContractNumber: null,
  signatoryPhone: null,
  signedDate: null,
  dtsFreeOfCharge: false,
  dtsPlaceName: null,
  dtsRelation: false,
  dtsRelationPriceInfluence: false,
  dtsRelationApproxValue: false,
  dtsRestriction: false,
  dtsValueCondition: false,
  dtsRoyaltyContract: false,
  dtsRoyaltyFee: false,
  dtsSubsequentResale: false,
  dtsMethodReason: null,
})

/**
 * Дата гр.А как "YYYY-MM-DD" (date-only). Префикс ISO-строки берём как есть, без dayjs():
 * "2026-09-23T00:00:00Z" в часовом поясе с минусом дал бы 22-е.
 */
export const toIsoDate = (v: string | null | undefined): string | null => {
  if (!v) return null
  const m = /^\d{4}-\d{2}-\d{2}/.exec(v)
  return m ? m[0] : dayjs(v).format('YYYY-MM-DD')
}

/**
 * Форма из ДТ сервера (новые объекты и массивы — правка формы не трогает DTO).
 * Пустая дата гр.А (ДТ ещё не сохранялась) → today (по умолчанию — сегодня); сохранится с первой правкой.
 */
export function dtoToForm(dto: Import40DeclarationDto, today: string = dayjs().format('YYYY-MM-DD')): DtFormState {
  const f = emptyDtForm()
  f.id = dto.id
  f.declarationNumber = dto.declarationNumber ?? ''
  f.corridor = dto.corridor ?? 'green'
  f.procedureCode = dto.procedureCode ?? ''
  f.departureCountryCode = dto.departureCountryCode ?? null
  f.destinationCountryCode = dto.destinationCountryCode ?? null
  f.incoterms = dto.incoterms ?? ''
  f.currency = dto.currency ?? ''
  f.exchangeRate = dto.exchangeRate ?? null
  f.totalInvoiceValue = dto.totalInvoiceValue ?? null
  f.sender = dto.sender ? { ...emptyParty(), ...dto.sender } : emptyParty()
  f.senderDistrict = dto.senderDistrict ?? null
  f.senderSettlement = dto.senderSettlement ?? null
  f.senderHouse = dto.senderHouse ?? null
  f.senderApt = dto.senderApt ?? null
  f.senderShortName = dto.senderShortName ?? null
  f.receiver = dto.receiver ? { ...emptyParty(), ...dto.receiver } : emptyParty()
  f.receiverDistrict = dto.receiverDistrict ?? null
  f.receiverSettlement = dto.receiverSettlement ?? null
  f.receiverHouse = dto.receiverHouse ?? null
  f.receiverApt = dto.receiverApt ?? null
  f.receiverBin = dto.receiverBin ?? null
  f.receiverCategoryCode = dto.receiverCategoryCode ?? null
  f.receiverKatoCode = dto.receiverKatoCode ?? null
  f.receiverShortName = dto.receiverShortName ?? null
  f.transactionNatureCode = dto.transactionNatureCode ?? ''
  f.transactionFeatureCode = dto.transactionFeatureCode ?? ''
  f.tradeCountryCode = dto.tradeCountryCode ?? ''
  f.originCountryCode = dto.originCountryCode ?? ''
  f.incotermsPlace = dto.incotermsPlace ?? ''
  f.consigneeEqualsDeclarant = dto.consigneeEqualsDeclarant ?? false
  f.financialSubjectEqualsDeclarant = dto.financialSubjectEqualsDeclarant ?? false
  f.goodsLocationCode = dto.goodsLocationCode ?? ''
  f.goodsLocationRegisterNumber = dto.goodsLocationRegisterNumber ?? ''
  f.goodsLocationCountryCode = dto.goodsLocationCountryCode ?? 'KZ'
  f.goodsLocationStation = dto.goodsLocationStation ?? ''
  f.goodsLocationAddress = dto.goodsLocationAddress ?? ''
  f.goodsLocationCustomsOfficeCode = dto.goodsLocationCustomsOfficeCode ?? ''
  f.borderCustomsOfficeCode = dto.borderCustomsOfficeCode ?? ''
  f.borderCustomsOfficeName = dto.borderCustomsOfficeName ?? ''
  f.submissionCustomsOfficeCode = dto.submissionCustomsOfficeCode ?? ''
  // dto.submissionDate === null для свежей ДТ (ещё не сохранялась) — в этом
  // случае подставляем сегодняшнюю дату по умолчанию, т.к. DtDeclarationNumberBar
  // выставляет её в своём onMounted, который отрабатывает РАНЬШЕ applyDeclaration
  // (родительский onMounted → loadDt → applyDeclaration) и потому перезаписывается.
  // Сервер отдаёт SubmissionDate меткой времени ("2026-09-23T00:00:00Z"), а
  // date-picker (value-format) и calculate-customs-value (onDate) ждут "YYYY-MM-DD".
  f.submissionDate = toIsoDate(dto.submissionDate) ?? today
  f.borderTransportModeCode = dto.borderTransportModeCode ?? ''
  f.borderTransportNationality = dto.borderTransportNationality ?? 'KZ'
  f.borderTransportNumbers = (dto.borderTransportNumbers ?? []).map((m) => ({ ...m }))
  f.arrivalTransportModeCode = dto.arrivalTransportModeCode ?? ''
  f.arrivalTransportNationality = dto.arrivalTransportNationality ?? 'KZ'
  f.arrivalTransportNumbers = (dto.arrivalTransportNumbers ?? []).map((m) => ({ ...m }))
  f.rateType = dto.rateType ?? 'ETT'
  f.factPayments = (dto.factPayments ?? []).map((p) => ({ ...p }))
  // Фаза 2 — новые графы бланка
  f.declarationTypeCode = dto.declarationTypeCode ?? 'ИМ'
  f.declarationFeatureCode = dto.declarationFeatureCode ?? null
  f.sheetNumber = dto.sheetNumber ?? null
  f.totalSheets = dto.totalSheets ?? null
  f.shippingSpecSheets = dto.shippingSpecSheets ?? null
  f.referenceNumber = dto.referenceNumber ?? null
  f.financialSubjectName = dto.financialSubjectName ?? null
  f.financialSubjectBin = dto.financialSubjectBin ?? null
  f.financialSubjectCountryCode = dto.financialSubjectCountryCode ?? null
  f.financialSubjectRegion = dto.financialSubjectRegion ?? null
  f.financialSubjectCity = dto.financialSubjectCity ?? null
  f.financialSubjectStreet = dto.financialSubjectStreet ?? null
  f.financialSubjectDistrict = dto.financialSubjectDistrict ?? null
  f.financialSubjectSettlement = dto.financialSubjectSettlement ?? null
  f.financialSubjectHouse = dto.financialSubjectHouse ?? null
  f.financialSubjectApt = dto.financialSubjectApt ?? null
  f.financialSubjectCategoryCode = dto.financialSubjectCategoryCode ?? null
  f.financialSubjectKatoCode = dto.financialSubjectKatoCode ?? null
  f.financialSubjectShortName = dto.financialSubjectShortName ?? null
  f.declarantName = dto.declarantName ?? null
  f.declarantBin = dto.declarantBin ?? null
  f.declarantCountryCode = dto.declarantCountryCode ?? null
  f.declarantRegion = dto.declarantRegion ?? null
  f.declarantCity = dto.declarantCity ?? null
  f.declarantStreet = dto.declarantStreet ?? null
  f.declarantDistrict = dto.declarantDistrict ?? null
  f.declarantSettlement = dto.declarantSettlement ?? null
  f.declarantHouse = dto.declarantHouse ?? null
  f.declarantApt = dto.declarantApt ?? null
  f.declarantCategoryCode = dto.declarantCategoryCode ?? null
  f.declarantKatoCode = dto.declarantKatoCode ?? null
  f.declarantShortName = dto.declarantShortName ?? null
  f.containerIndicator = dto.containerIndicator ?? false
  f.inlandTransportModeCode = dto.inlandTransportModeCode ?? null
  f.deferralDocType = dto.deferralDocType ?? null
  f.deferralNumber = dto.deferralNumber ?? null
  f.deferralDate = dto.deferralDate ?? null
  f.deferralDueDate = dto.deferralDueDate ?? null
  f.guaranteeInvalidFor = dto.guaranteeInvalidFor ?? null
  f.signatoryFullName = dto.signatoryFullName ?? null
  f.signatoryPosition = dto.signatoryPosition ?? null
  f.signatoryDocument = dto.signatoryDocument ?? null
  f.signatoryDocTypeCode = dto.signatoryDocTypeCode ?? null
  f.signatoryDocNumber = dto.signatoryDocNumber ?? null
  f.signatoryDocIssueDate = dto.signatoryDocIssueDate ?? null
  f.signatoryDocIssuedBy = dto.signatoryDocIssuedBy ?? null
  f.signatoryDocCountryCode = dto.signatoryDocCountryCode ?? null
  f.powerOfAttorney = dto.powerOfAttorney ?? null
  f.powerOfAttorneyDate = dto.powerOfAttorneyDate ?? null
  f.powerOfAttorneyValidUntil = dto.powerOfAttorneyValidUntil ?? null
  f.brokerContractNumber = dto.brokerContractNumber ?? null
  f.signatoryPhone = dto.signatoryPhone ?? null
  f.signedDate = dto.signedDate ?? null
  f.dtsFreeOfCharge = dto.dtsFreeOfCharge ?? false
  f.dtsPlaceName = dto.dtsPlaceName ?? null
  f.dtsRelation = dto.dtsRelation ?? false
  f.dtsRelationPriceInfluence = dto.dtsRelationPriceInfluence ?? false
  f.dtsRelationApproxValue = dto.dtsRelationApproxValue ?? false
  f.dtsRestriction = dto.dtsRestriction ?? false
  f.dtsValueCondition = dto.dtsValueCondition ?? false
  f.dtsRoyaltyContract = dto.dtsRoyaltyContract ?? false
  f.dtsRoyaltyFee = dto.dtsRoyaltyFee ?? false
  f.dtsSubsequentResale = dto.dtsSubsequentResale ?? false
  f.dtsMethodReason = dto.dtsMethodReason ?? null
  f.prevDocItems = (dto.prevDocItems ?? []).map((p: Import40PrevDocItem) => ({ ...p }))
  f.expenses = (dto.expenses ?? []).map((e) => ({
    expenseTypeCode: e.expenseTypeCode ?? null,
    amount: e.amount ?? null,
    currencyCode: e.currencyCode ?? null,
  }))
  f.goodsItems = (dto.goodsItems ?? []).map((g) => ({
    description: g.description ?? null,
    tnvedCode: g.tnvedCode ?? null,
    tnvedDescription: g.tnvedDescription ?? null,
    countryOfOrigin: g.countryOfOrigin ?? null,
    quantity: g.quantity ?? null,
    unit: g.unit ?? null,
    unitCode: g.unitCode ?? null,
    grossWeightKg: g.grossWeightKg ?? null,
    netWeightKg: g.netWeightKg ?? null,
    // одно видимое поле мест (packagesCount) ← приоритетное значение бэка (см. utils/goodsPlaces)
    packagesCount: placesOfGoods(g),
    quantityTypeCode: g.quantityTypeCode ?? null,
    // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
    customsValue: g.invoiceValue ?? null,
    currency: g.currency ?? null,
    procedureCode: g.procedureCode ?? null,
    previousProcedureCode: g.previousProcedureCode ?? null,
    goodsMoveFeatureCode: g.goodsMoveFeatureCode ?? null,
    tradeMarkName: g.tradeMarkName ?? null,
    productMarkName: g.productMarkName ?? null,
    productModelName: g.productModelName ?? null,
    productArticle: g.productArticle ?? null,
    manufacturerName: g.manufacturerName ?? null,
    packageAvailabilityCode: g.packageAvailabilityCode ?? null,
    cargoPlacesQuantity: placesOfGoods(g),
    packageKindCode: g.packageKindCode ?? null,
    packageQuantity: g.packageQuantity ?? null,
    prefClearanceCode: g.prefClearanceCode ?? null,
    prefDutyCode: g.prefDutyCode ?? null,
    prefExciseCode: g.prefExciseCode ?? null,
    prefVatCode: g.prefVatCode ?? null,
    customsValueKzt: g.customsValueKzt ?? null,
    statisticValueUsd: g.statisticValueUsd ?? null,
    valuationMethodCode: g.valuationMethodCode ?? null,
    quotaAmount: g.quotaAmount ?? null,
    prohibitionCode: g.prohibitionCode ?? null,
    ipoCode: g.ipoCode ?? null,
    payments: (g.payments ?? []).map((p) => ({ ...p })),
    needsTpinRecalc: g.needsTpinRecalc ?? false,
    containerNumber: g.containerNumber ?? null,
    tempImportMonths: g.tempImportMonths ?? null,
    vatRatePreferential: g.vatRatePreferential ?? null,
    certificationNote: g.certificationNote ?? null,
    oisIndicatorCode: g.oisIndicatorCode ?? null,
    restrictionMarks: g.restrictionMarks ?? null,
    oisRegNumber: g.oisRegNumber ?? null,
    oisCountryCode: g.oisCountryCode ?? null,
    markings: (g.markings ?? []).map((m) => ({ ...m })),
    extras: cloneGoodsExtras(g.extras),
    // Выбор по КЕДЕН (вид акциза, антидемпинг) и количества в единицах ставок. Без них при загрузке
    // ДТ выбор терялся, а автосейв затирал его в базе — расчёт снова брал первый вид акциза.
    exciseKind: g.exciseKind ?? null,
    antiDumpingKind: g.antiDumpingKind ?? null,
    taxVolumeL: g.taxVolumeL ?? null,
    taxAlcoholL: g.taxAlcoholL ?? null,
    taxPieces: g.taxPieces ?? null,
    engineVolumeCm3: g.engineVolumeCm3 ?? null,
  }))
  f.doc44Items = (dto.doc44Items ?? []).map((d) => ({
    docTypeCode: d.docTypeCode ?? null,
    docTypeName: d.docTypeName ?? null,
    docNumber: d.docNumber ?? null,
    docDate: d.docDate ?? null,
    goodsItemIndex: d.goodsItemIndex ?? null,
    appliesToAll: d.appliesToAll ?? false,
    goodsItemIndexes: d.goodsItemIndexes ?? null,
    docStartDate: d.docStartDate ?? null,
    docValidityDate: d.docValidityDate ?? null,
    issueCountryCode: d.issueCountryCode ?? null,
  }))
  return f
}

/**
 * Пакет 6 №1 (хвост): преднастройка гр.2/8/22 из данных, которые клиент дал при подаче заявки
 * (Import40Case.client*). Заполняем ТОЛЬКО пустые поля — уже заполненную ДТ не трогаем.
 * Вызывается при загрузке (под флагом applying), поэтому автосейв не срабатывает — значения
 * сохранятся при первом обычном сохранении ДТ брокером.
 */
export function prefillFromClientCase(form: DtFormState, c: Import40CaseDto | null | undefined): void {
  if (!c) return
  const s = form.sender
  if (s) {
    if (!s.name && c.clientSenderName) s.name = c.clientSenderName
    if (!s.countryCode && c.clientSenderCountryCode) s.countryCode = c.clientSenderCountryCode
  }
  // гр.8 не преднастраиваем, если получатель = декларант (гр.14) — там своё копирование.
  const r = form.receiver
  if (!form.consigneeEqualsDeclarant && r) {
    if (!r.name && c.clientReceiverName) r.name = c.clientReceiverName
    if (!form.receiverBin && c.clientReceiverBin) form.receiverBin = c.clientReceiverBin
    if (!r.countryCode && c.clientReceiverCountryCode) r.countryCode = c.clientReceiverCountryCode
  }
  if (!form.currency && c.clientCurrencyCode) form.currency = c.clientCurrencyCode
  if (form.totalInvoiceValue == null && c.clientEstimatedValue != null) form.totalInvoiceValue = c.clientEstimatedValue
}

/** Тело PUT /import40/{caseId}/declarations/{id}: все графы шапки, пустое — null. */
export function formToPayload(form: DtFormState, expectedUpdatedAtUtc: string | null): Import40DeclarationUpsert {
  return {
    expectedUpdatedAtUtc,
    declarationNumber: form.declarationNumber || null,
    corridor: form.corridor || null,
    procedureCode: form.procedureCode || null,
    departureCountryCode: form.departureCountryCode || null,
    destinationCountryCode: form.destinationCountryCode || null,
    incoterms: form.incoterms || null,
    currency: form.currency || null,
    exchangeRate: form.exchangeRate ?? null,
    totalInvoiceValue: form.totalInvoiceValue ?? null,
    sender: form.sender ?? null,
    senderDistrict: form.senderDistrict || null,
    senderSettlement: form.senderSettlement || null,
    senderHouse: form.senderHouse || null,
    senderApt: form.senderApt || null,
    senderShortName: form.senderShortName || null,
    receiver: form.receiver ?? null,
    receiverDistrict: form.receiverDistrict || null,
    receiverSettlement: form.receiverSettlement || null,
    receiverHouse: form.receiverHouse || null,
    receiverApt: form.receiverApt || null,
    receiverBin: form.receiverBin || null,
    receiverCategoryCode: form.receiverCategoryCode || null,
    receiverKatoCode: form.receiverKatoCode || null,
    receiverShortName: form.receiverShortName || null,
    transactionNatureCode: form.transactionNatureCode || null,
    transactionFeatureCode: form.transactionFeatureCode || null,
    tradeCountryCode: form.tradeCountryCode || null,
    originCountryCode: form.originCountryCode || null,
    incotermsPlace: form.incotermsPlace || null,
    consigneeEqualsDeclarant: !!form.consigneeEqualsDeclarant,
    financialSubjectEqualsDeclarant: !!form.financialSubjectEqualsDeclarant,
    goodsLocationCode: form.goodsLocationCode || null,
    goodsLocationRegisterNumber: form.goodsLocationRegisterNumber || null,
    goodsLocationCountryCode: form.goodsLocationCountryCode || null,
    goodsLocationStation: form.goodsLocationStation || null,
    goodsLocationAddress: form.goodsLocationAddress || null,
    goodsLocationCustomsOfficeCode: form.goodsLocationCustomsOfficeCode || null,
    borderCustomsOfficeCode: form.borderCustomsOfficeCode || null,
    borderCustomsOfficeName: form.borderCustomsOfficeName || null,
    submissionCustomsOfficeCode: form.submissionCustomsOfficeCode || null,
    submissionDate: form.submissionDate || null,
    borderTransportModeCode: form.borderTransportModeCode || null,
    borderTransportNationality: form.borderTransportNationality || null,
    borderTransportNumbers: form.borderTransportNumbers ?? [],
    arrivalTransportModeCode: form.arrivalTransportModeCode || null,
    arrivalTransportNationality: form.arrivalTransportNationality || null,
    arrivalTransportNumbers: form.arrivalTransportNumbers ?? [],
    rateType: form.rateType || null,
    factPayments: form.factPayments ?? [],
    declarationTypeCode: form.declarationTypeCode || null,
    declarationFeatureCode: form.declarationFeatureCode || null,
    sheetNumber: form.sheetNumber ?? null,
    totalSheets: form.totalSheets ?? null,
    shippingSpecSheets: form.shippingSpecSheets ?? null,
    referenceNumber: form.referenceNumber || null,
    financialSubjectName: form.financialSubjectName || null,
    financialSubjectBin: form.financialSubjectBin || null,
    financialSubjectCountryCode: form.financialSubjectCountryCode || null,
    financialSubjectRegion: form.financialSubjectRegion || null,
    financialSubjectCity: form.financialSubjectCity || null,
    financialSubjectStreet: form.financialSubjectStreet || null,
    financialSubjectDistrict: form.financialSubjectDistrict || null,
    financialSubjectSettlement: form.financialSubjectSettlement || null,
    financialSubjectHouse: form.financialSubjectHouse || null,
    financialSubjectApt: form.financialSubjectApt || null,
    financialSubjectCategoryCode: form.financialSubjectCategoryCode || null,
    financialSubjectKatoCode: form.financialSubjectKatoCode || null,
    financialSubjectShortName: form.financialSubjectShortName || null,
    declarantName: form.declarantName || null,
    declarantBin: form.declarantBin || null,
    declarantCountryCode: form.declarantCountryCode || null,
    declarantRegion: form.declarantRegion || null,
    declarantCity: form.declarantCity || null,
    declarantStreet: form.declarantStreet || null,
    declarantDistrict: form.declarantDistrict || null,
    declarantSettlement: form.declarantSettlement || null,
    declarantHouse: form.declarantHouse || null,
    declarantApt: form.declarantApt || null,
    declarantCategoryCode: form.declarantCategoryCode || null,
    declarantKatoCode: form.declarantKatoCode || null,
    declarantShortName: form.declarantShortName || null,
    containerIndicator: !!form.containerIndicator,
    inlandTransportModeCode: form.inlandTransportModeCode || null,
    deferralDocType: form.deferralDocType || null,
    deferralNumber: form.deferralNumber || null,
    deferralDate: form.deferralDate || null,
    deferralDueDate: form.deferralDueDate || null,
    guaranteeInvalidFor: form.guaranteeInvalidFor || null,
    signatoryFullName: form.signatoryFullName || null,
    signatoryPosition: form.signatoryPosition || null,
    signatoryDocument: form.signatoryDocument || null,
    signatoryDocTypeCode: form.signatoryDocTypeCode || null,
    signatoryDocNumber: form.signatoryDocNumber || null,
    signatoryDocIssueDate: form.signatoryDocIssueDate || null,
    signatoryDocIssuedBy: form.signatoryDocIssuedBy || null,
    signatoryDocCountryCode: form.signatoryDocCountryCode || null,
    powerOfAttorney: form.powerOfAttorney || null,
    powerOfAttorneyDate: form.powerOfAttorneyDate || null,
    powerOfAttorneyValidUntil: form.powerOfAttorneyValidUntil || null,
    brokerContractNumber: form.brokerContractNumber || null,
    signatoryPhone: form.signatoryPhone || null,
    signedDate: form.signedDate || null,
    dtsFreeOfCharge: !!form.dtsFreeOfCharge,
    dtsPlaceName: form.dtsPlaceName || null,
    dtsRelation: !!form.dtsRelation,
    dtsRelationPriceInfluence: !!form.dtsRelationPriceInfluence,
    dtsRelationApproxValue: !!form.dtsRelationApproxValue,
    dtsRestriction: !!form.dtsRestriction,
    dtsValueCondition: !!form.dtsValueCondition,
    dtsRoyaltyContract: !!form.dtsRoyaltyContract,
    dtsRoyaltyFee: !!form.dtsRoyaltyFee,
    dtsSubsequentResale: !!form.dtsSubsequentResale,
    dtsMethodReason: form.dtsMethodReason || null,
    goodsItems: form.goodsItems.map((g) => {
      // на бэкенде фактурная стоимость товара называется invoiceValue; в форме — customsValue
      const { customsValue, ...rest } = g
      // места: видимое поле packagesCount, КЕДЕН-поле — его копия (одна цифра на бланке и в XML)
      const places = g.packagesCount ?? g.cargoPlacesQuantity ?? null
      return { ...rest, packagesCount: places, cargoPlacesQuantity: places, invoiceValue: customsValue, payments: g.payments ?? [], markings: g.markings ?? [] }
    }),
    doc44Items: form.doc44Items ?? [],
    prevDocItems: form.prevDocItems ?? [],
    expenses: form.expenses ?? [],
  }
}
