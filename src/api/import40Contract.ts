import apiClient from './client'

export interface ClientCompanyProfileDto {
  clientId: string
  companyName: string
  bin: string
  directorName: string
  directorBasis: string
  legalAddress: string
  bank: string
  iik: string
  bik: string
  phone: string
  email: string
  legalCountryCode: string | null
  legalRegion: string | null
  legalCity: string | null
  legalStreet: string | null
  kbe: string | null
  okpo: string | null
  ownershipType: string | null
  contactPersonName: string | null
  contactPersonPosition: string | null
  contactPhone: string | null
  contactEmail: string | null
  isComplete: boolean
  updatedAtUtc: string | null
  /** 30.10.2026 (аудит C-2): коды обязательных реквизитов, которых не хватает (companyName, bin, directorName, legalAddress, bank, iik, bik, kbe). */
  missingFields?: string[] | null
}

export type ClientCompanyProfileUpsert = Partial<
  Omit<ClientCompanyProfileDto, 'clientId' | 'isComplete' | 'updatedAtUtc'>
>

export interface SigexStartDto {
  qrCode: string
  eGovMobileLaunchLink: string
  eGovBusinessLaunchLink: string
  dataUrl: string
  qrId: string
  expireAt: number
}

export interface SigexPollDto {
  pending: boolean
  sign: string | null
}

export interface Import40DocumentFileDto {
  id: string
  section: string
  originalFileName: string
  createdAtUtc: string
}

export interface Import40DocumentDto {
  id: string
  clientId: string
  kind: 'contract' | 'poa'
  number: string
  year: number
  generatedAtUtc: string
  status: number // 0 Draft, 1 AwaitingSignature, 2 Active
  clientSigned: boolean
  clientSignedAtUtc: string | null
  providerSigned: boolean
  providerSignedAtUtc: string | null
  // 'egov' — ЭЦП через eGov/Sigex, 'ncalayer' — подписано в Zircon через NCALayer, 'upload' — загружен подписанный файл, null — не подписано
  clientSignMethod: string | null
  providerSignMethod: string | null
  isSingleUse: boolean
  validUntilUtc: string | null
  consumedByCaseId: string | null
  files: Import40DocumentFileDto[]
  /** Страница проверки подписей по QR (20.10.2026); null — документ ещё не подписан. */
  verifyUrl?: string | null
  /** 02.11.2026 (пакет I): доверенность действует, но текущая — перевыпущенная позже («0008/2026»); иначе null. */
  replacedBy?: string | null
  /** Дата отзыва (05.11.2026). */
  revokedAtUtc?: string | null
}

export interface Import40DocumentGenerateRequest {
  kind: 'contract' | 'poa'
  isSingleUse: boolean
  validUntilUtc?: string | null
}

// документ считается ДЕЙСТВУЮЩИМ, если он активен, не истёк по сроку
// и (для разовых) ещё не израсходован на заявку
// «Действующий» без учёта расхода разовой: подписан и не истёк. Для статуса онбординга —
// разовая доверенность, уже использованная заявкой, всё равно означает, что онбординг пройден.
export const isDocumentActive = (doc: Import40DocumentDto | null | undefined): boolean => {
  if (!doc) return false
  if (doc.status !== 2) return false
  if (doc.validUntilUtc && new Date(doc.validUntilUtc).getTime() <= Date.now()) return false
  return true
}

const DAY_MS = 24 * 60 * 60 * 1000
/** «Продлить» многоразовый договор (30.10.2026): за 60 дней до конца срока и 30 дней после — как на сервере (Import40DocumentTerms.CanRenew). */
export const RENEW_BEFORE_DAYS = 60
export const RENEW_AFTER_DAYS = 30
export const canRenewContract = (
  d: Pick<Import40DocumentDto, 'kind' | 'isSingleUse' | 'status' | 'validUntilUtc'>,
  now = Date.now(),
): boolean => {
  if (d.kind !== 'contract' || d.isSingleUse || d.status !== 2 || !d.validUntilUtc) return false
  const until = new Date(d.validUntilUtc).getTime()
  if (Number.isNaN(until)) return false
  return now >= until - RENEW_BEFORE_DAYS * DAY_MS && now <= until + RENEW_AFTER_DAYS * DAY_MS
}

/**
 * «Перевыпустить» доверенность (02.11.2026, пакет I) — как проверяет сервер: многоразовая, действует (статус 2, в т.ч. срок
 * уже вышел), не заменена и после неё не выпущена другая многоразовая (черновик, ждёт подписи или действует).
 */
export const canReissuePoa = <T extends Pick<Import40DocumentDto, 'id' | 'kind' | 'isSingleUse' | 'status' | 'generatedAtUtc'> & { replacedBy?: string | null }>(
  docs: T[],
  d: T,
): boolean => {
  if (d.kind !== 'poa' || d.isSingleUse || d.status !== 2 || d.replacedBy) return false
  const at = new Date(d.generatedAtUtc).getTime()
  return !docs.some((x) => x.id !== d.id && x.kind === 'poa' && !x.isSingleUse
    && (x.status === 0 || x.status === 1 || x.status === 2) && new Date(x.generatedAtUtc).getTime() > at)
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Предел выбранной даты перевыпуска — 3 года (как Import40DocumentTerms.ReissueMaxYears на сервере). */
export const REISSUE_MAX_YEARS = 3
/**
 * Даты окна перевыпуска ('YYYY-MM-DD', по местному времени): по умолчанию — 31.12 этого года, в декабре — следующего
 * (как у новой доверенности на сервере); выбрать — с завтрашнего дня и не позже, чем через 3 года.
 */
export const reissueDates = (now = new Date()): { def: string; min: string; max: string } => {
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const max = new Date(now.getFullYear() + REISSUE_MAX_YEARS, now.getMonth(), now.getDate())
  return { def: `${year}-12-31`, min: ymd(min), max: ymd(max) }
}

export const isDocumentEffective = (doc: Import40DocumentDto | null | undefined): boolean => {
  if (!doc) return false
  if (doc.status !== 2) return false
  if (doc.validUntilUtc && new Date(doc.validUntilUtc).getTime() <= Date.now()) return false
  if (doc.isSingleUse && doc.consumedByCaseId) return false
  return true
}

const base = (clientId: string) => `/import40/company/${encodeURIComponent(clientId)}`

export const import40ContractApi = {
  // opts.silent — «Моя компания» клиента и «Компания клиента» сотрудника сами показывают ошибку на месте, без тоста перехватчика.
  getProfile: async (clientId: string, opts?: { silent?: boolean }): Promise<ClientCompanyProfileDto> => {
    const response = await apiClient.get<ClientCompanyProfileDto>(`${base(clientId)}/profile`, opts?.silent ? { silent: true } : undefined)
    return response.data
  },

  saveProfile: async (
    clientId: string,
    data: ClientCompanyProfileUpsert,
    opts?: { silent?: boolean },
  ): Promise<ClientCompanyProfileDto> => {
    const response = await apiClient.put<ClientCompanyProfileDto>(`${base(clientId)}/profile`, data, opts?.silent ? { silent: true } : undefined)
    return response.data
  },

  // ───────── документы (договор + доверенность) — общая машинерия ─────────

  listDocuments: async (
    clientId: string,
    kind?: 'contract' | 'poa',
    opts?: { silent?: boolean },
  ): Promise<Import40DocumentDto[]> => {
    const response = await apiClient.get<Import40DocumentDto[]>(`${base(clientId)}/documents`, {
      params: kind ? { kind } : undefined,
      ...(opts?.silent ? { silent: true } : {}),
    })
    return response.data
  },

  generateDocument: async (
    clientId: string,
    data: Import40DocumentGenerateRequest,
    opts?: { silent?: boolean },
  ): Promise<Import40DocumentDto> => {
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/generate`,
      data,
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },

  signDocument: async (
    clientId: string,
    docId: string,
    side: 'client' | 'provider',
    file: File,
    opts?: { silent?: boolean; method?: 'ncalayer' },
  ): Promise<Import40DocumentDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sign`,
      formData,
      {
        params: opts?.method ? { side, method: opts.method } : { side },
        headers: { 'Content-Type': 'multipart/form-data' },
        ...(opts?.silent ? { silent: true } : {}),
      },
    )
    return response.data
  },

  // Отзыв документа (админ): перестаёт быть действующим, привязка к открытым заявкам снимается.
  revokeDocument: async (clientId: string, docId: string, opts?: { silent?: boolean }): Promise<Import40DocumentDto> =>
    (await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/revoke`,
      {},
      opts?.silent ? { silent: true } : undefined,
    )).data,
  // «Продлить» многоразовый договор до 31.12 следующего года (администратор или руководитель, 30.10.2026).
  renewDocument: async (clientId: string, docId: string, opts?: { silent?: boolean }): Promise<Import40DocumentDto> =>
    (await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/renew`,
      {},
      opts?.silent ? { silent: true } : undefined,
    )).data,
  // «Перевыпустить» многоразовую доверенность (02.11.2026, пакет I): новая с текущими представителями; validUntilUtc —
  // выбранная дата (конец дня UTC), null — до 31.12 (в декабре — следующего года). Администратор или руководитель.
  reissueDocument: async (clientId: string, docId: string, body: { validUntilUtc: string | null }, opts?: { silent?: boolean }): Promise<Import40DocumentDto> =>
    (await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/reissue`,
      body,
      opts?.silent ? { silent: true } : undefined,
    )).data,
  downloadDocument: async (clientId: string, docId: string, format?: 'pdf'): Promise<Blob> => {
    const response = await apiClient.get(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/download`,
      { responseType: 'blob', ...(format ? { params: { format } } : {}) },
    )
    return response.data
  },

  // Подписанный файл (ЭЦП-контейнер или скан), приложенный к документу.
  downloadDocumentSignedFile: async (clientId: string, docId: string, fileId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/files/${encodeURIComponent(fileId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  sigexStartSigningDocument: async (clientId: string, docId: string): Promise<SigexStartDto> => {
    const response = await apiClient.post<SigexStartDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/start-signing`,
      undefined,
      { silent: true },
    )
    return response.data
  },

  sigexPollDocument: async (clientId: string, docId: string, qrId: string): Promise<SigexPollDto> => {
    const response = await apiClient.get<SigexPollDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/${encodeURIComponent(qrId)}/poll`,
      { silent: true },
    )
    return response.data
  },

  sigexCompleteDocument: async (
    clientId: string,
    docId: string,
    qrId: string,
    side: 'client' | 'provider',
  ): Promise<Import40DocumentDto> => {
    const response = await apiClient.post<Import40DocumentDto>(
      `${base(clientId)}/documents/${encodeURIComponent(docId)}/sigex/${encodeURIComponent(qrId)}/complete`,
      { side },
      { silent: true },
    )
    return response.data
  },
}
