import apiClient from './client'
import type {
  ReestrCargoOperationInput,
  ReestrCarrierInput,
  ReestrContainerInput,
  ReestrDoc44ItemInput,
  ReestrGoodsItemInput,
  ReestrGuaranteeInput,
  ReestrIdentificationMeansInput,
  ReestrOrganizationInput,
  ReestrPackageInput,
  ReestrPrecedingDocInput,
  ReestrTransitFields,
  ReestrTransportMeansInput,
} from '@/types/api'
import { heicQueued, uploadTimeoutFor } from '@/utils/heic'

// «Авто-транзит» (очередь 1, 16.11.2026): машины на автомобильной границе, партии получателей, семь этапов, файлы,
// ссылки получателям. Контракт — docs/superpowers/plans/2026-11-16-auto-transit-phase1.md, «Контракт API».
// Каждая правка (машина, этапы, «Проблема», архив, партии, ТД, файлы) отвечает свежей карточкой машины целиком.
// Ошибки: 400 { errors: { поле: [тексты] } }, 409 { code } (коды и тексты — autoTransit.ts, errorKey),
// 409 duplicate_plate несёт existingTruckId; 409 conflict — машину одновременно изменили: перечитать карточку.
// Страны — две буквы (KZ, CN), валюта — три.

export type TruckStatus = 'inWork' | 'problem' | 'released' | 'archived'
export type StageNo = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type FilterId = 'all' | 'waitDocs' | 'control' | 'waitDeclaration' | 'warehouse' | 'releasedToday' | 'problem'
export type FileKind = 'invoice' | 'packingList' | 'cmr' | 'driverPassport' | 'vehiclePassport' | 'td' | 'warehouseReceipt' | 'other'
export type EventAction = 'done' | 'undone' | 'problem' | 'problemCleared'

export interface TruckListItem {
  id: string
  plate: string
  trailerPlate: string
  driverName: string
  /** Получатель единственной партии; null — консолидация или получатель не указан (см. rowTitle). */
  title: string | null
  partiesCount: number
  placesTotal: number
  grossKgTotal: number
  /** 1..7; null — выпущена. */
  currentStage: number | null
  stageSinceUtc: string
  status: TruckStatus
  problemNote: string
  stalled: boolean
  blockerCode: string | null
  submittedCount: number
  tdNumberCount: number
  createdAtUtc: string
}

export interface Party {
  id: string
  number: number
  clientId: string | null
  recipientName: string
  recipientRegNumber: string
  recipientCountry: string
  recipientEmail: string
  recipientPhone: string
  shipperName: string
  shipperCountry: string
  invoiceNumber: string
  /** Дата без времени, YYYY-MM-DD. */
  invoiceDate: string | null
  places: number
  grossKg: number
  value: number
  currency: string
  destinationCountry: string
  destinationOfficeCode: string
  submittedAtUtc: string | null
  submittedBy: string | null
  tdNumber: string
  /** Дата без времени, YYYY-MM-DD. */
  tdDate: string | null
  importInterestAtUtc: string | null
  importInterestContact: string | null
  /** ТД партии сохранена (очередь 2а). Старый сервер поле не шлёт — считаем «нет». */
  hasDeclaration?: boolean
  /** Сколько пунктов ТД не заполнено (подсказка, этапы не блокирует); null — ТД нет (сервер 7c905cb шлёт null). */
  declarationMissingCount?: number | null
  // ПИ под авто (очередь 3, этап 1, план 2026-11-25). Старый сервер полей не шлёт — undefined.
  /** Номер предварительной информации (до 64). */
  piNumber?: string | null
  /** Когда отмечено «ПИ подана»; null — не подана. Ставит только POST …/pi-submitted. */
  piSubmittedAtUtc?: string | null
  /** Краткий номер от СВХ (до 32): без него «ТД подана» — 409 short_number_required. */
  shortNumber?: string | null
  /** Ещё инвойсы того же отправителя и получателя; основной — invoiceNumber/invoiceDate. */
  additionalInvoices?: PartyInvoice[]
}

/** Дополнительный инвойс партии; дата без времени, YYYY-MM-DD. */
export interface PartyInvoice { number: string; date: string | null }

export interface TruckFile {
  id: string
  partyId: string | null
  kind: FileKind
  stamped: boolean
  visibleToRecipient: boolean
  fileName: string
  sizeBytes: number
  uploadedBy: string | null
  uploadedAtUtc: string
  // Очередь 3 (сервер f5a0fae). Старый сервер полей не шлёт — undefined.
  /** staff — загрузил сотрудник; link — прислан по ссылке загрузки (linkId — ссылка, uploadedBy тогда null). */
  uploadedVia?: 'staff' | 'link'
  linkId?: string | null
  /** «Вернуть с причиной»: файл не удаляется, загружающий видит причину на странице ссылки. */
  returned?: boolean
  returnReason?: string | null
  returnedAtUtc?: string | null
}

export interface TruckEvent {
  id: string
  stage: number
  partyId: string | null
  action: EventAction
  by: string | null
  atUtc: string
  note: string
}

/**
 * count — только у declaration_incomplete: сколько полей ТД не заполнено (очередь 2а).
 * partyNumber — у pi_not_submitted и pi_urgent; minutesLeft — у pi_urgent: минут до ожидаемого въезда (может быть ≤ 0).
 */
export interface Blocker { code: string; partyId: string | null; count?: number | null; partyNumber?: number | null; minutesLeft?: number | null }
export interface TruckCan { border: boolean; declare: boolean; manage: boolean }

export interface TruckCard extends TruckListItem {
  plateCountry: string
  trailerCountry: string
  driverDoc: string
  carrierName: string
  carrierCountry: string
  carrierRegNumber: string
  customsPostCode: string
  arrivedAtUtc: string | null
  stageNumber: string
  /** Ожидаемое время въезда (вносит КПП или декларант); старый сервер не шлёт. */
  expectedEntryAtUtc?: string | null
  parties: Party[]
  files: TruckFile[]
  events: TruckEvent[]
  blockers: Blocker[]
  can: TruckCan
}

export interface TruckListParams { filter?: FilterId; q?: string; page?: number }
export interface TruckListResponse { items: TruckListItem[]; total: number; counts: Record<FilterId, number> }
/** Строк на странице списка (как на сервере). */
export const LIST_PAGE_SIZE = 50

export interface PrefillDto {
  existingTruckId: string | null
  trailerPlate: string | null
  trailerCountry: string | null
  plateCountry: string | null
  driverName: string | null
  driverDoc: string | null
  carrierName: string | null
  carrierCountry: string | null
  carrierRegNumber: string | null
}

/** Поля машины. В PUT пропущенное поле не меняется, null очищает. */
export interface TruckFields {
  plate?: string | null
  plateCountry?: string | null
  trailerPlate?: string | null
  trailerCountry?: string | null
  driverName?: string | null
  driverDoc?: string | null
  carrierName?: string | null
  carrierCountry?: string | null
  carrierRegNumber?: string | null
  customsPostCode?: string | null
  stageNumber?: string | null
  arrivedAtUtc?: string | null
  expectedEntryAtUtc?: string | null
}
/** Создание: номер обязателен; force — завести рядом с невыпущенной машиной того же номера (иначе 409 duplicate_plate). */
export type TruckCreate = TruckFields & { plate: string; force?: boolean }

/** Поля партии. В PUT пропущенное поле не меняется, null очищает. */
export type PartyFields = Partial<Omit<Party,
  'id' | 'number' | 'submittedAtUtc' | 'submittedBy' | 'tdNumber' | 'tdDate' | 'importInterestAtUtc' | 'importInterestContact'
  | 'hasDeclaration' | 'declarationMissingCount' | 'piSubmittedAtUtc'>>

export interface TdBody { tdNumber: string; tdDate: string | null }
export interface FilePatch { partyId?: string | null; kind?: FileKind; stamped?: boolean; visibleToRecipient?: boolean }
export interface UploadOpts { partyId?: string | null; kind?: FileKind }

/**
 * Назначение ссылки (очередь 3): view — страница получателя (/t/), uploadCargo — клиент присылает CMR, инвойс,
 * упаковочный на партию (/u/), uploadVehicle — водитель или перевозчик присылает паспорт и техпаспорта на машину (/u/).
 */
export type LinkPurpose = 'view' | 'uploadCargo' | 'uploadVehicle'

export interface RecipientLink {
  id: string
  /** null — ссылка на машину (uploadVehicle). */
  partyId: string | null
  token: string
  expiresAtUtc: string
  revokedAtUtc: string | null
  lastOpenedAtUtc: string | null
  /** Старый сервер не шлёт — view. */
  truckId?: string
  purpose?: LinkPurpose
}

export interface PublicTruckView {
  plate: string
  currentStage: number | null
  released: boolean
  updatedAtUtc: string
  recipientName: string
  invoiceNumber: string
  tdNumber: string
  files: { id: string; fileName: string; kind: FileKind }[]
}

/** Допустимые файлы (как на сервере) — для accept поля выбора файла. */
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.xlsx'
/** Лимит одного файла модуля — 30 МБ (как на сервере: лимит «Авто-транзита», меньше общего лимита документов). */
export const UPLOAD_MAX_BYTES = 30 * 1024 * 1024

/**
 * Таймаут загрузки по размеру: связь на границе слабая, общие 30 с клиента обрывали фото камеры 4–15 МБ.
 * 60 с + 1 с на каждые 20 КБ (≈ 160 Кбит/с), не меньше 2 и не больше 15 минут; у HEIC — не меньше его таймаута.
 */
export const uploadTimeoutMs = (file: Pick<File, 'name' | 'type' | 'size'>): number => {
  const bySize = Math.min(15 * 60_000, Math.max(120_000, Math.round(60_000 + (file.size / 20_000) * 1000)))
  return Math.max(bySize, uploadTimeoutFor(file) ?? 0)
}

const enc = encodeURIComponent
const base = (id: string) => `/auto-transit/${enc(id)}`
const party = (id: string, partyId: string) => `${base(id)}/parties/${enc(partyId)}`
// Формы (машина, партия, номер ТД, «Проблема») сами пишут 400 под полем — без общего тоста; 409 — у всех мутаций.
const FORM_SILENT = [400, 409]
const card = async (p: Promise<{ data: TruckCard }>): Promise<TruckCard> => (await p).data

// ───────── машины ─────────

/** opts.silent — фоновое обновление: ошибку экран показывает плашкой на месте, без общего тоста. */
export const listTrucks = async (params: TruckListParams = {}, opts: { silent?: boolean } = {}): Promise<TruckListResponse> =>
  (await apiClient.get<TruckListResponse>('/auto-transit', {
    params: { filter: params.filter || undefined, q: params.q?.trim() || undefined, page: params.page && params.page > 1 ? params.page : undefined },
    ...(opts.silent ? { silent: true } : {}),
  })).data

/** Подстановка по номеру тягача — экран сам решает, что показать: без тоста. */
export const prefill = async (plate: string): Promise<PrefillDto> =>
  (await apiClient.get<PrefillDto>('/auto-transit/prefill', { params: { plate }, silent: true })).data

/** 409 duplicate_plate (existingTruckId) и 400 под полями экран показывает сам — без общего тоста. */
export const createTruck = (body: TruckCreate): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>('/auto-transit', body, { silentStatuses: FORM_SILENT }))

/** opts.silent — фоновое перечитывание карточки (раз в 60 с): без общего тоста. */
export const getTruck = (id: string, opts: { silent?: boolean } = {}): Promise<TruckCard> =>
  card(apiClient.get<TruckCard>(base(id), opts.silent ? { silent: true } : undefined))

export const updateTruck = (id: string, patch: TruckFields): Promise<TruckCard> =>
  card(apiClient.put<TruckCard>(base(id), patch, { silentStatuses: FORM_SILENT }))

// ───────── этапы и статус ─────────

/** Отметить этап 2, 3, 4 или 7 (этап 1 ставит первая загрузка файла). */
export const markStage = (id: string, stage: number, note?: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/stages/${stage}/done`, note?.trim() ? { note: note.trim() } : undefined, { silentStatuses: [409] }))

export const undoStage = (id: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/stages/undo`, undefined, { silentStatuses: [409] }))

export const setProblem = (id: string, note: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/problem`, { note }, { silentStatuses: FORM_SILENT }))

export const clearProblem = (id: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/problem/clear`, undefined, { silentStatuses: [409] }))

export const archiveTruck = (id: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/archive`, undefined, { silentStatuses: [409] }))

/** «Вернуть из архива» (autotransit.manage): все этапы закрыты — «Выпущена», иначе «В работе». Не в архиве — карточка как есть. */
export const unarchiveTruck = (id: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/unarchive`, undefined, { silentStatuses: [409] }))

// ───────── партии ─────────

export const addParty = (id: string, body: PartyFields = {}): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${base(id)}/parties`, body, { silentStatuses: FORM_SILENT }))

export const updateParty = (id: string, partyId: string, patch: PartyFields): Promise<TruckCard> =>
  card(apiClient.put<TruckCard>(party(id, partyId), patch, { silentStatuses: FORM_SILENT }))

export const deleteParty = (id: string, partyId: string): Promise<TruckCard> =>
  card(apiClient.delete<TruckCard>(party(id, partyId), { silentStatuses: [409] }))

/** «ТД подана». */
export const submitParty = (id: string, partyId: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${party(id, partyId)}/submit`, undefined, { silentStatuses: [409] }))

export const unsubmitParty = (id: string, partyId: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${party(id, partyId)}/unsubmit`, undefined, { silentStatuses: [409] }))

/** «ПИ подана» с номером (обязателен, до 64). Право autotransit.declare; 400 под полем piNumber пишет окно. */
export const piSubmitted = (id: string, partyId: string, piNumber: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${party(id, partyId)}/pi-submitted`, { piNumber }, { silentStatuses: FORM_SILENT }))

/** Снять «ПИ подана». */
export const piUnsubmit = (id: string, partyId: string): Promise<TruckCard> =>
  card(apiClient.post<TruckCard>(`${party(id, partyId)}/pi-unsubmit`, undefined, { silentStatuses: [409] }))

/** Номер и дата ТД; пустой номер очищает. */
export const setTd = (id: string, partyId: string, body: TdBody): Promise<TruckCard> =>
  card(apiClient.put<TruckCard>(`${party(id, partyId)}/td`, body, { silentStatuses: FORM_SILENT }))

// ───────── транзитная декларация партии (очередь 2а, 17.11.2026) ─────────
// Контракт — docs/superpowers/plans/2026-11-17-auto-transit-td-form.md, «Контракт API». data — форма фронтового
// RecordDraft записи транзита без fields (имена полей — как у Reestr*Input).

export interface DeclarationData {
  sealNumber: string | null
  packagingType: string | null
  transit: ReestrTransitFields
  goods: ReestrGoodsItemInput[]
  doc44: ReestrDoc44ItemInput[]
  organizations: ReestrOrganizationInput[]
  carriers: ReestrCarrierInput[]
  transportMeans: ReestrTransportMeansInput[]
  identificationMeans: ReestrIdentificationMeansInput[]
  packages: ReestrPackageInput[]
  containers: ReestrContainerInput[]
  precedingDocs: ReestrPrecedingDocInput[]
  cargoOperations: ReestrCargoOperationInput[]
  guarantees: ReestrGuaranteeInput[]
  /** ПИ под авто (очередь 3): тягач, прицеп, грузовик. Старая ТД поля не имеет — фронт считает пустым списком. */
  vehicles?: AutoVehicle[]
  /** Водитель; null или нет поля — не заполнен. */
  driver?: AutoDriver | null
}

export type AutoVehicleRole = 'tractor' | 'trailer' | 'truck'
/** Транспортное средство ПИ: тип — классификатор 2024 (тягач 303, прицеп 312), headIndex — индекс тягача у прицепа. */
export interface AutoVehicle {
  role: AutoVehicleRole
  typeCode: string | null
  regNumber: string | null
  countryCode: string | null
  vin: string | null
  headIndex: number | null
}
export interface AutoDriver {
  fullName: string | null
  countryCode: string | null
  docKindCode: string | null
  docNumber: string | null
  personalNumber: string | null
}

/** Итоги по товарам против итогов партии (decimal, без округления). */
export interface TotalsPair { goods: number | null; party: number | null }
export interface TotalsCheck { places: TotalsPair; grossKg: TotalsPair; value: TotalsPair }

/** Пункт «Не заполнено»: key — путь поля (goods[2].tnvedCode), section — ключ раздела (SectionKey). */
export interface DeclarationMissing { key: string; section: string }

export interface DeclarationResponse {
  /** ТД не сохранялась: data собрана из машины и партии, в базе ничего нет. */
  isDraft: boolean
  /** «ТД подана», машина в архиве или нет права autotransit.declare. */
  readOnly: boolean
  /** Версия ТД (DeclarationRevision: 0 — ТД не сохраняли, растёт при каждом сохранении ТД): уходит в PUT как есть, при расхождении 409 conflict. */
  version: number
  data: DeclarationData
  missing: DeclarationMissing[]
  updatedAtUtc: string | null
  updatedBy: string | null
  truck: { id: string; plate: string; trailerPlate: string }
  party: { id: string; number: number; recipientName: string; submitted: boolean }
  /** Сравнение итогов товаров и партии (очередь 3); старый сервер не шлёт. */
  totalsCheck?: TotalsCheck | null
}

export interface DeclarationSaveBody { version: number; data: DeclarationData }

/** Страница сама показывает 404/403 и сбой загрузки — без общего тоста. */
export const getDeclaration = async (id: string, partyId: string): Promise<DeclarationResponse> =>
  (await apiClient.get<DeclarationResponse>(`${party(id, partyId)}/declaration`, { silent: true })).data

/**
 * PUT заменяет ТД целиком: body.data — вся форма (draftToData), не частичный патч. 400 { error, errors: { data|goods|version: [текст] } }
 * (больше 2 МБ, больше 999 товаров, данные не читаются; 413 — от прокси), 403 { error }, 409 { code: conflict|submitted|archived, error } —
 * страница пишет плашкой сама.
 */
export const saveDeclaration = async (id: string, partyId: string, body: DeclarationSaveBody): Promise<DeclarationResponse> =>
  (await apiClient.put<DeclarationResponse>(`${party(id, partyId)}/declaration`, body, { silentStatuses: [...FORM_SILENT, 403, 413] })).data

/**
 * Прошлая ПИ / ТД того же получателя, отправителя или поста назначения (очередь 3), кроме текущей партии; новые сверху,
 * не больше 20. matchedBy — по каким признакам подошла (старый сервер не шлёт: тогда только получатель).
 */
export type CopyMatch = 'consignee' | 'consignor' | 'destinationOffice'
export interface DeclarationCopySource {
  partyId: string
  truckId: string
  truckPlate: string
  tdNumber: string
  updatedAtUtc: string | null
  goodsCount: number
  matchedBy?: CopyMatch[]
  /** Получатель партии-источника; null — не указан (сервер 562e375). */
  recipientName?: string | null
}

/** Список источников — подсказка на странице: сбой не мешает работать, без тоста. */
export const listCopySources = async (id: string, partyId: string): Promise<DeclarationCopySource[]> =>
  (await apiClient.get<DeclarationCopySource[]>(`${party(id, partyId)}/declaration/copy-sources`, { silent: true })).data

/** Данные прошлой ТД; 404 — источник не из списка (другой получатель, ТД удалена). Окно копии пишет ошибку само. */
export const getCopySource = async (id: string, partyId: string, sourcePartyId: string): Promise<{ data: DeclarationData }> =>
  (await apiClient.get<{ data: DeclarationData }>(`${party(id, partyId)}/declaration/copy-sources/${enc(sourcePartyId)}`, { silent: true })).data

// ───────── «Заполнить из документов» (очередь 3, этап 2) ─────────

/** Значение поля по одному документу; source — имя документа (файла), из которого оно. */
export interface FromDocsConflictValue { value: string | null; source: string | null }
/**
 * Документы разошлись по полю: field — ключ ПИ (organizations.consignor, transit.docCurrencyCode, vehicles, doc44.invoice.number,
 * goods[0].grossWeightKg…) или имя поля Zircon AI как есть; values[0] — выбранное значение, дальше альтернативы.
 */
export interface FromDocsConflict { field: string; values: FromDocsConflictValue[] }
export interface DocValues<T> { cmr: T | null; invoice: T | null; packing: T | null }
/** Сверка документов между собой: места, брутто, госномера («тягач / прицеп») по CMR, инвойсу и упаковочному. */
export interface DocumentsCheck { places: DocValues<number>; grossKg: DocValues<number>; plates: DocValues<string> }
export interface FromDocumentsResult {
  /** Фрагмент ПИ: нераспознанные разделы — null. В базу ничего не записано. */
  data: Partial<DeclarationData>
  /** Что распознано (ключи как у missing). */
  filled: string[]
  conflicts: FromDocsConflict[]
  warnings: string[]
  documentsCheck: DocumentsCheck
}

/** Сколько ждать разбор: сервис Zircon AI отвечает до ~220 с, файлы уже на сервере. */
export const FROM_DOCUMENTS_TIMEOUT_MS = 240_000

/**
 * Распознать файлы партии и общие файлы машины (не возвращённые). Ошибки окно пишет само: 400 { error, errors.fileIds | warnings },
 * 404 — файл не этой машины / партии, 413 / 503 — ProblemDetails { title, detail, limitMb | retryAfterMin }, 502 — сбой сервиса.
 */
export const fromDocuments = async (id: string, partyId: string, fileIds: string[]): Promise<FromDocumentsResult> =>
  (await apiClient.post<FromDocumentsResult>(`${party(id, partyId)}/declaration/from-documents`, { fileIds }, {
    silent: true, timeout: FROM_DOCUMENTS_TIMEOUT_MS,
  })).data

// ───────── настройки авто-транзита (очередь 3) ─────────

/** Строка шаблона гр. 44: код вида документа, название, вид файла партии, из которого брать номер и дату. */
export type Doc44FileKind = 'cmr' | 'invoice' | 'packing' | 'passport'
/**
 * fileKind — вид контракта (Doc44FileKind) или вид файла модуля (packingList, vehiclePassport, td…): сервер принимает
 * оба, фронт незнакомое значение хранит как есть (ревью этапа 1, M7).
 */
export interface Doc44TemplateItem { code: string; name: string; fileKind: Doc44FileKind | (string & {}) | null }
export interface AutoTransitSettings {
  guaranteeTypeCode: string | null
  /** Основание непредоставления обеспечения; по умолчанию 103. */
  guaranteeBasisCode: string | null
  aeoCertificateNumber: string | null
  /** Дата без времени, YYYY-MM-DD. */
  aeoCertificateDate: string | null
  doc44Template: Doc44TemplateItem[]
  /** Этап 3б: загруженный шаблон договора экспедиции (null — нет). Только чтение, PUT его не меняет. */
  contractTemplate?: ContractTemplateInfo | null
  /** Ключи подстановки шаблона договора ({{ключ}}), в порядке показа. Только чтение. */
  contractKeys?: string[]
}

export interface ContractTemplateInfo {
  fileName: string
  sizeBytes: number
  uploadedAtUtc: string
  /** Только в ответе на загрузку: ключи шаблона, которых платформа не знает. */
  unknownKeys?: string[] | null
}

/** Чтение — autotransit.read. Страница сама пишет сбой загрузки — без тоста. */
export const getSettings = async (): Promise<AutoTransitSettings> =>
  (await apiClient.get<AutoTransitSettings>('/auto-transit/settings', { silent: true })).data

/** Запись — autotransit.manage; 400 { errors } страница пишет под полями. */
export const saveSettings = async (body: AutoTransitSettings): Promise<AutoTransitSettings> =>
  (await apiClient.put<AutoTransitSettings>('/auto-transit/settings', body, { silentStatuses: [400] })).data

const templateUrl = '/auto-transit/settings/contract-template'

/** Загрузить шаблон договора экспедиции (.docx до 2 МБ, autotransit.manage). 400 { errors: { file } } страница пишет сама. */
export const uploadContractTemplate = async (file: File): Promise<ContractTemplateInfo> => {
  const form = new FormData()
  form.append('file', file)
  return (await apiClient.post<ContractTemplateInfo>(templateUrl, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    silentStatuses: [400, 409],
  })).data
}

export const deleteContractTemplate = async (): Promise<void> => { await apiClient.delete(templateUrl) }

/** Скачать загруженный шаблон (autotransit.read). */
export const downloadContractTemplate = () => downloadBlob(templateUrl, 'template.docx')

// ───────── файлы ─────────

/**
 * Один файл за запрос (multipart: file, partyId?, kind?). onProgress — доля 0..1. Таймаут — по размеру (uploadTimeoutMs).
 * HEIC переводит сервер: такие файлы идут по два за раз (utils/heic.ts), как в Импорте 40.
 */
/** cfg.silent — без общего тоста вообще (и на обрыв связи): очередь загрузки пишет ошибку в строке файла и одну сводку. */
export const uploadFile = (
  id: string, file: File, opts: UploadOpts = {}, onProgress?: (fraction: number) => void, cfg: { silent?: boolean } = {},
): Promise<TruckCard> => {
  const form = new FormData()
  form.append('file', file)
  if (opts.partyId) form.append('partyId', opts.partyId)
  if (opts.kind) form.append('kind', opts.kind)
  const timeout = uploadTimeoutMs(file)
  return heicQueued(file, () => card(apiClient.post<TruckCard>(`${base(id)}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // 400 и 409 очередь загрузки пишет в строке файла сама.
    silentStatuses: FORM_SILENT,
    ...(cfg.silent ? { silent: true } : {}),
    timeout,
    ...(onProgress ? { onUploadProgress: (e: { loaded: number; total?: number }) => { if (e.total) onProgress(Math.min(1, e.loaded / e.total)) } } : {}),
  })))
}

export const patchFile = (id: string, fileId: string, patch: FilePatch): Promise<TruckCard> =>
  card(apiClient.patch<TruckCard>(`${base(id)}/files/${enc(fileId)}`, patch, { silentStatuses: [409] }))

/**
 * «Вернуть с причиной» (очередь 3): файл помечается возвращённым, не удаляется; ответ — файл, не карточка.
 * 400 { errors: { reason } } и 409 окно пишет само.
 */
export const returnFile = async (id: string, fileId: string, reason: string): Promise<TruckFile> =>
  (await apiClient.post<TruckFile>(`${base(id)}/files/${enc(fileId)}/return`, { reason }, { silentStatuses: FORM_SILENT })).data

export const deleteFile = (id: string, fileId: string): Promise<TruckCard> =>
  card(apiClient.delete<TruckCard>(`${base(id)}/files/${enc(fileId)}`, { silentStatuses: [409] }))

// Скачивание файлов сотрудником — только с токеном входа (заголовок Authorization), поэтому fileUrl/zipUrl — пути
// относительно apiClient, а не ссылки для <a href>: качать через downloadBlob (как downloadFile в Импорте 40).
export const fileUrl = (id: string, fileId: string): string => `${base(id)}/files/${enc(fileId)}/download`
export const zipUrl = (id: string): string => `${base(id)}/files/all.zip`

/** Скачать файл по пути fileUrl/zipUrl с входом; имя — из Content-Disposition, иначе fallbackName. */
export const downloadBlob = async (
  url: string, fallbackName: string, opts: { silentStatuses?: number[] } = {},
): Promise<{ blob: Blob; fileName: string }> => {
  const res = await apiClient.get(url, { responseType: 'blob', ...(opts.silentStatuses ? { silentStatuses: opts.silentStatuses } : {}) })
  const cd = String(res.headers?.['content-disposition'] ?? '')
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="?([^";]+)"?/i.exec(cd)
  return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]!) : fallbackName }
}

// ───────── опись и акт осмотра из ПИ (этап 3) ─────────

/** Документы из сохранённой ПИ партии: опись документов ТД и заготовка акта таможенного осмотра. */
export type PartyDocKind = 'inventory' | 'inspection-act' | 'contract'
export const partyDocUrl = (id: string, partyId: string, kind: PartyDocKind): string => `${party(id, partyId)}/declaration/${kind}.docx`

/**
 * Скачать .docx из ПИ (право autotransit.read). 409 { code: 'declaration_not_saved' } — ПИ ни разу не сохраняли,
 * { code: 'contract_template_missing' } — нет шаблона договора экспедиции (этап 3б): тост пишет
 * страница сама (код читается из ответа-Blob через blobErrorCode); прочие ошибки — общий тост перехватчика.
 */
export const downloadPartyDoc = (id: string, partyId: string, kind: PartyDocKind, fallbackName: string) =>
  downloadBlob(partyDocUrl(id, partyId, kind), fallbackName, { silentStatuses: [409] })

/** Текст Blob: Blob.text() есть не везде (старый Safari, jsdom) — тогда FileReader. */
const blobText = (b: Blob): Promise<string> => (typeof b.text === 'function' ? b.text() : new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result ?? ''))
  r.onerror = () => reject(r.error)
  r.readAsText(b)
}))

/** Машинный code из ответа об ошибке, пришедшего Blob-ом (responseType: 'blob'); не читается — null. */
export const blobErrorCode = async (e: unknown): Promise<string | null> => {
  const data = (e as { response?: { data?: unknown } })?.response?.data
  try {
    const text = data instanceof Blob ? await blobText(data) : typeof data === 'string' ? data : data == null ? '' : JSON.stringify(data)
    const code = (JSON.parse(text) as { code?: unknown })?.code
    return typeof code === 'string' ? code : null
  } catch {
    return null
  }
}

// ───────── ссылки получателям ─────────

export const listLinks = async (id: string): Promise<RecipientLink[]> =>
  (await apiClient.get<RecipientLink[]>(`${base(id)}/links`)).data

/** Ссылка партии: без purpose — просмотр получателя (как раньше), uploadCargo — загрузка документов груза (право declare). */
export const createLink = async (id: string, partyId: string, purpose?: 'view' | 'uploadCargo'): Promise<RecipientLink> =>
  (await apiClient.post<RecipientLink>(`${party(id, partyId)}/link`, purpose ? { purpose } : undefined)).data

/** Ссылка на машину для водителя / перевозчика (uploadVehicle, право border). Прежняя такая же ссылка отзывается. */
export const createTruckLink = async (id: string): Promise<RecipientLink> =>
  (await apiClient.post<RecipientLink>(`${base(id)}/links`, { purpose: 'uploadVehicle' })).data

export const revokeLink = async (id: string, linkId: string): Promise<RecipientLink> =>
  (await apiClient.post<RecipientLink>(`${base(id)}/links/${enc(linkId)}/revoke`)).data

// ───────── страница получателя (без входа) ─────────

// Публичные файлы отдаются без входа — это готовые ссылки для <a href> от корня API (VITE_API_BASE_URL, иначе /api).
const API_ROOT = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const pub = (token: string) => `/public/auto-transit/${enc(token)}`

/** Недействительную ссылку страница показывает сама — без тоста. */
export const publicGet = async (token: string): Promise<PublicTruckView> =>
  (await apiClient.get<PublicTruckView>(pub(token), { silent: true })).data

export const publicFileUrl = (token: string, fileId: string): string => `${API_ROOT}${pub(token)}/files/${enc(fileId)}`
export const publicZipUrl = (token: string): string => `${API_ROOT}${pub(token)}/all.zip`

/** «Оформить импорт»: телефон или почта, 5–100 знаков. */
export const publicImportInterest = async (token: string, contact: string): Promise<void> => {
  await apiClient.post(`${pub(token)}/import-interest`, { contact: contact.trim() }, { silent: true })
}

// ───────── ссылка загрузки (без входа, очередь 3) ─────────
// /u/:token — клиент (uploadCargo) или водитель / перевозчик (uploadVehicle) присылает документы. Всё недействительное
// (чужой, отозванный, просроченный токен, ссылка просмотра) — пустой 404. Частота — 20 запросов в минуту (429).

export interface PublicUploadKind { kind: FileKind; label: string; required: boolean; uploaded: boolean }
export interface PublicUploadFile { id: string; name: string; kind: FileKind; uploadedAtUtc: string; returned: boolean; returnReason: string | null }
export interface PublicUploadView {
  purpose: 'uploadCargo' | 'uploadVehicle'
  truckPlate: string
  partyNumber: number | null
  recipientName: string | null
  expiresAtUtc: string
  kinds: PublicUploadKind[]
  /** Только файлы, присланные по этой ссылке. */
  files: PublicUploadFile[]
}

const pubUpload = (token: string) => `/public/auto-transit/upload/${enc(token)}`

/** Страница сама пишет 404 / 429 / сбой — без тоста. */
export const publicUploadGet = async (token: string): Promise<PublicUploadView> =>
  (await apiClient.get<PublicUploadView>(pubUpload(token), { silent: true })).data

/** Один файл с видом; ошибки пишет очередь загрузки в строке файла (silent). */
export const publicUploadFile = (
  token: string, file: File, kind: FileKind, onProgress?: (fraction: number) => void,
): Promise<PublicUploadFile> => {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  return heicQueued(file, async () => (await apiClient.post<PublicUploadFile>(`${pubUpload(token)}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    silent: true,
    timeout: uploadTimeoutMs(file),
    ...(onProgress ? { onUploadProgress: (e: { loaded: number; total?: number }) => { if (e.total) onProgress(Math.min(1, e.loaded / e.total)) } } : {}),
  })).data)
}
