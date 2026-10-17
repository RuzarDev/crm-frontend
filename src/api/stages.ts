import apiClient from './client'

// Хронометраж этапов заявки (17.10): события шагов, время на шаге и нормы, дашборд руководителя.
// Сервер: Features/Import40/Import40StageEndpoints.cs.

export type StageEventKind =
  | 'created' | 'submitted' | 'taken' | 'returnedToClient' | 'resubmitted' | 'atBorder' | 'borderPassed'
  | 'dtSubmitted' | 'customsRequest' | 'customsRequestAnswered' | 'customsRequestClosed'
  | 'problemSet' | 'problemAnswered' | 'problemCleared' | 'released'
  | 'svhClosed' | 'svhInvoiced' | 'svhPaid' | 'brokerInvoiced' | 'brokerPaid' | 'brokerInvoiceCancelled'
  | 'steppedBack' | 'done' | 'cancelled'

export interface StageEvent {
  id: string
  kind: StageEventKind
  atUtc: string
  /** Шаг, к которому относится событие (где выполнено действие). */
  step: number
  declarationId: string | null
  /** ФИО сотрудника — только сотрудникам. */
  userName: string | null
  note: string
}

export type StageState = 'done' | 'current' | 'future'

export interface CaseStageStep {
  step: number
  state: StageState
  responsibleRole: 'client' | 'kpp' | 'declarant' | 'clientKpp' | 'accountant'
  responsibleId: string | null
  responsibleName: string | null
  startedAtUtc: string | null
  endedAtUtc: string | null
  /** Текущий визит шага, минуты (клиенту — null). */
  elapsedMinutes: number | null
  /** Всего на шаге, минуты (клиенту — null). */
  spentMinutes: number | null
  normMinutes: number | null
  overdue: boolean
  /** Шаг 1 после возврата — подэтап «доработка у клиента» (своя норма). */
  inRework: boolean
  history: StageEvent[]
  /** Шаг пройден или начат до хронометража (заявка начата до 17.10): без просрочки; старый сервер — нет поля. */
  historyMissing?: boolean
}

export interface CaseStages {
  status: number
  currentStep: number
  nowUtc: string
  steps: CaseStageStep[]
}

export type StageNormKey = 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'rework'
export interface StageNorm { key: StageNormKey; hours: number; defaultHours: number }

export interface StageStepStat { step: number; count: number; avgHours: number | null; medianHours: number | null; normHours: number }
export interface StageEmployeeStat { userId: string; name: string; count: number; avgHours: number | null; medianHours: number | null; returned: number }
export interface StageOverdue {
  caseId: string; number: string; clientName: string; step: number; inRework: boolean
  elapsedMinutes: number; normMinutes: number; responsibleName: string | null
  /** Шаг начат до хронометража: время — с последнего изменения заявки. */
  historyMissing?: boolean
}
export interface StageStats {
  days: number
  steps: StageStepStat[]
  rework: StageStepStat
  employees: StageEmployeeStat[]
  /** Просрочено сейчас — только шаги с историей. */
  overdue: StageOverdue[]
  /** Отдельный фильтр «до 17.10 — без истории»: старые заявки, где с последнего изменения прошло больше нормы. */
  untracked?: StageOverdue[]
}

const silentCfg = (silent?: boolean) => (silent ? { silent: true } : undefined)

export const stagesApi = {
  caseStages: async (caseId: string, opts?: { silent?: boolean }): Promise<CaseStages> =>
    (await apiClient.get<CaseStages>(`/import40/${encodeURIComponent(caseId)}/stages`, silentCfg(opts?.silent))).data,
  norms: async (opts?: { silent?: boolean }): Promise<StageNorm[]> =>
    (await apiClient.get<StageNorm[]>('/import40/stage-norms', silentCfg(opts?.silent))).data,
  saveNorms: async (norms: { key: StageNormKey; hours: number }[]): Promise<StageNorm[]> =>
    (await apiClient.put<StageNorm[]>('/import40/stage-norms', { norms })).data,
  stats: async (days: number, opts?: { silent?: boolean }): Promise<StageStats> =>
    (await apiClient.get<StageStats>('/import40/manage/stage-stats', { params: { days }, ...(opts?.silent ? { silent: true } : {}) })).data,
}
