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
}

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

/** count — только у declaration_incomplete: сколько полей ТД не заполнено (очередь 2а). */
export interface Blocker { code: string; partyId: string | null; count?: number | null }
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
}
/** Создание: номер обязателен; force — завести рядом с невыпущенной машиной того же номера (иначе 409 duplicate_plate). */
export type TruckCreate = TruckFields & { plate: string; force?: boolean }

/** Поля партии. В PUT пропущенное поле не меняется, null очищает. */
export type PartyFields = Partial<Omit<Party,
  'id' | 'number' | 'submittedAtUtc' | 'submittedBy' | 'tdNumber' | 'tdDate' | 'importInterestAtUtc' | 'importInterestContact'
  | 'hasDeclaration' | 'declarationMissingCount'>>

export interface TdBody { tdNumber: string; tdDate: string | null }
export interface FilePatch { partyId?: string | null; kind?: FileKind; stamped?: boolean; visibleToRecipient?: boolean }
export interface UploadOpts { partyId?: string | null; kind?: FileKind }

export interface RecipientLink {
  id: string
  partyId: string
  token: string
  expiresAtUtc: string
  revokedAtUtc: string | null
  lastOpenedAtUtc: string | null
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
}

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

/** Прошлая ТД того же получателя (тот же непустой БИН/регномер), кроме текущей партии; новые сверху, не больше 20. */
export interface DeclarationCopySource {
  partyId: string
  truckId: string
  truckPlate: string
  tdNumber: string
  updatedAtUtc: string | null
  goodsCount: number
}

/** Список источников — подсказка на странице: сбой не мешает работать, без тоста. */
export const listCopySources = async (id: string, partyId: string): Promise<DeclarationCopySource[]> =>
  (await apiClient.get<DeclarationCopySource[]>(`${party(id, partyId)}/declaration/copy-sources`, { silent: true })).data

/** Данные прошлой ТД; 404 — источник не из списка (другой получатель, ТД удалена). Окно копии пишет ошибку само. */
export const getCopySource = async (id: string, partyId: string, sourcePartyId: string): Promise<{ data: DeclarationData }> =>
  (await apiClient.get<{ data: DeclarationData }>(`${party(id, partyId)}/declaration/copy-sources/${enc(sourcePartyId)}`, { silent: true })).data

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

export const deleteFile = (id: string, fileId: string): Promise<TruckCard> =>
  card(apiClient.delete<TruckCard>(`${base(id)}/files/${enc(fileId)}`, { silentStatuses: [409] }))

// Скачивание файлов сотрудником — только с токеном входа (заголовок Authorization), поэтому fileUrl/zipUrl — пути
// относительно apiClient, а не ссылки для <a href>: качать через downloadBlob (как downloadFile в Импорте 40).
export const fileUrl = (id: string, fileId: string): string => `${base(id)}/files/${enc(fileId)}/download`
export const zipUrl = (id: string): string => `${base(id)}/files/all.zip`

/** Скачать файл по пути fileUrl/zipUrl с входом; имя — из Content-Disposition, иначе fallbackName. */
export const downloadBlob = async (url: string, fallbackName: string): Promise<{ blob: Blob; fileName: string }> => {
  const res = await apiClient.get(url, { responseType: 'blob' })
  const cd = String(res.headers?.['content-disposition'] ?? '')
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="?([^";]+)"?/i.exec(cd)
  return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]!) : fallbackName }
}

// ───────── ссылки получателям ─────────

export const listLinks = async (id: string): Promise<RecipientLink[]> =>
  (await apiClient.get<RecipientLink[]>(`${base(id)}/links`)).data

export const createLink = async (id: string, partyId: string): Promise<RecipientLink> =>
  (await apiClient.post<RecipientLink>(`${party(id, partyId)}/link`)).data

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
