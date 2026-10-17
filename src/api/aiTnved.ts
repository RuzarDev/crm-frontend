import apiClient from './client'
import type { TnvedClassifyMatch, TnvedNonTariffMeasureDto } from '@/types/api'

// Подбор кода ТН ВЭД через ИИ (17.10; бэк: /ai/*). Модель выбирает 3–5 кодов только из кандидатов, найденных по своим
// данным; ставки, НДС, меры и маркировку подставляет сервер из справочников. ИИ недоступен — обычный поиск по словам.

export type AiTnvedSource = 'dt' | 'wizard' | 'calculator' | 'reference'
export type AiUnavailableReason =
  | 'off' | 'clientsDisabled' | 'limitUser' | 'limitClient' | 'limitDay' | 'error' | 'invalid' | 'noCandidates'

export interface AiTnvedCharacteristics {
  material?: string | null
  purpose?: string | null
  composition?: string | null
  /** Для розничной продажи. */
  retail?: boolean | null
  model?: string | null
  other?: string | null
}

export interface AiTnvedAnswer { question: string; answer: string }

export interface AiTnvedPathNode { code: string; name: string }

export interface AiTnvedCodeInfo {
  dutyRate: string | null
  vtoRate: string | null
  /** auto — НДС 5% по ПП №1204; confirm — 5% для части товаров перечня; none — 16%; null — перечень не загружен. */
  vatStatus: 'auto' | 'confirm' | 'none' | null
  vatGoods: string[]
  excise: string[]
  antiDumping: string[]
  measures: TnvedNonTariffMeasureDto[]
  marking: string[]
  bans: string[]
  unit: string | null
}

export interface AiTnvedCode {
  code: string
  name: string
  path: AiTnvedPathNode[]
  /** 0…1 */
  confidence: number
  opi: string
  reasoning: string
  differences: string
  questions: string[]
  fromHistory: boolean
  clientHistory: boolean
  info: AiTnvedCodeInfo
}

export interface AiTnvedSuggestResponse {
  suggestionId: string | null
  aiUsed: boolean
  unavailable: AiUnavailableReason | null
  fromCache: boolean
  model: string | null
  suggestions: AiTnvedCode[]
  questions: string[]
  /** Обычный поиск по словам — когда ИИ недоступен. */
  fallback: TnvedClassifyMatch[]
}

export interface AiTnvedSuggestRequest {
  description: string
  characteristics?: AiTnvedCharacteristics | null
  answers?: AiTnvedAnswer[] | null
  source: AiTnvedSource
  caseId?: string | null
}

export interface AiTnvedStatus {
  /** Ответ модели доступен этому пользователю (клиенту — и «ИИ для клиентов» включён). */
  available: boolean
  configured: boolean
  clientsEnabled: boolean
  provider: string
  model: string | null
}

export interface AiSettings {
  provider: string
  model: string | null
  baseUrlHost: string | null
  configured: boolean
  clientsEnabled: boolean
  userDailyLimit: number
  clientDailyLimit: number
  totalDailyLimit: number
  updatedAtUtc: string | null
}

export interface AiSettingsUpdate {
  clientsEnabled: boolean
  userDailyLimit: number
  clientDailyLimit: number
  totalDailyLimit: number
}

export interface AiTnvedStats {
  days: number
  requests: number
  aiAnswered: number
  cached: number
  fallback: number
  withAnswer: number
  selectedFirst: number
  selectedAny: number
  selectedOther: number
  inputTokens: number
  outputTokens: number
  requestsToday: number
}

export const aiTnvedApi = {
  status: async (): Promise<AiTnvedStatus> => (await apiClient.get<AiTnvedStatus>('/ai/tnved/status', { silent: true })).data,
  // Модель отвечает до ~1,5 мин; ошибки показывает панель (429 — «слишком много запросов»), без тоста.
  suggest: async (req: AiTnvedSuggestRequest): Promise<AiTnvedSuggestResponse> =>
    (await apiClient.post<AiTnvedSuggestResponse>('/ai/tnved/suggest', req, { silent: true, timeout: 120000 })).data,
  /** «Выбрать»: код записывается как подтверждённый для этого описания (пополняет историю). */
  select: async (suggestionId: string, code: string): Promise<void> => {
    await apiClient.post(`/ai/tnved/suggestions/${encodeURIComponent(suggestionId)}/select`, { code }, { silent: true })
  },
  settings: async (): Promise<AiSettings> => (await apiClient.get<AiSettings>('/ai/settings', { silent: true })).data,
  saveSettings: async (body: AiSettingsUpdate): Promise<AiSettings> => (await apiClient.put<AiSettings>('/ai/settings', body)).data,
  stats: async (days = 30): Promise<AiTnvedStats> =>
    (await apiClient.get<AiTnvedStats>('/ai/tnved/stats', { params: { days }, silent: true })).data,
}
