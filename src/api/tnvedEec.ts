import apiClient from './client'

// «Справочники → ТН ВЭД → Обновления ЕЭК»: редакции ЕТТ из PDF ЕЭК, ручной синк, сверка с КЕДЕН, коды дерева,
// которых нет в ЕЭК, даты вступления решений. Все эндпоинты — по праву tnved.manage (администратор — всегда).
// Перечисления приходят camelCase-строками; даты (DateOnly) — 'YYYY-MM-DD', метки времени — UTC.

export type EecEditionKind = 'group' | 'ettNotes'
export type EecEditionStatus = 'staged' | 'applied' | 'held' | 'rejected' | 'superseded'
export type EecSyncRunStatus = 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted'
export type EecSyncItemAction = 'skipped' | 'applied' | 'held' | 'failed' | 'warning'
export type EecDiscrepancyKind = 'rate' | 'eecOnly' | 'kedenOnly' | 'eecNotInForce' | 'eecUncertain'
export type EecTreeAbsentKind = 'absent' | 'notInForce'
export type EecFootnoteChangeKind = 'added' | 'removed' | 'changed'
export type EecDecisionSource = 'none' | 'auto' | 'manual'

export interface EecEditionSummary {
  id: number
  kind: EecEditionKind
  group: string | null
  fileName: string
  editionDate: string | null
  status: EecEditionStatus
  stagedAtUtc: string
  appliedAtUtc: string | null
  statusChangedAtUtc: string | null
  statusChangedBy: string | null
  statusReason: string | null
  isClean: boolean
  leafCount: number
  unparsedCount: number
  addedCount: number
  removedCount: number
  changedCount: number
}

export interface EecRateState {
  rateText: string | null
  kedenRate: string | null
  footnoteRefs: string[]
  addUnit: string | null
  nameRu: string
}

export interface EecCodeChange {
  code: string
  /** Флаги через запятую: «rate, footnotes» (added, removed, rate, footnotes, unit, returned). */
  kind: string
  before: EecRateState | null
  after: EecRateState | null
  kedenRate: string | null
}

export interface EecFootnoteChange {
  number: string
  kind: EecFootnoteChangeKind
  before: string | null
  after: string | null
  codes: number
}

export interface EecEditionDiff {
  editionId: number
  kind: EecEditionKind
  group: string | null
  baselineEditionId: number | null
  isBaseline: boolean
  codesBefore: number
  codesAfter: number
  codes: EecCodeChange[]
  newTreeCodes: string[]
  endedInTree: string[]
  missingFootnoteRefs: string[]
  unrecognizedRates: number
  unparsed: number
  footnotes: EecFootnoteChange[]
  newDecisions: string[]
  added: number
  removed: number
  changed: number
  rateChanged: number
  removedShare: number
}

export interface EecUnparsedLine { page: number; reason: string; text: string }

export interface EecEditionReport {
  unparsed: EecUnparsedLine[]
  pageCount: number
  detectedGroup: string | null
  footnoteFlags: Record<string, string[]> | null
}

export interface EecEditionDetail {
  edition: EecEditionSummary
  diff: EecEditionDiff
  report: EecEditionReport
  suspicionReasons: string[]
}

export interface EecApplyResult {
  editionId: number
  ratesAdded: number
  ratesChanged: number
  ratesRemoved: number
  ratesReturned: number
  treeNodesAdded: number
  treeLeavesEnded: number
  footnotesAdded: number
  footnotesChanged: number
  footnotesRemoved: number
  decisionsRegistered: number
  warnings: string[]
  treeLeavesReopened: number
  addedLeafCodes: string[]
}

export interface EecSyncRunItem {
  file: string
  group: string | null
  action: EecSyncItemAction | string
  editionId: number | null
  detail: string | null
}

export interface EecSyncRunView {
  id: number
  triggeredBy: string
  startedAtUtc: string
  finishedAtUtc: string | null
  status: EecSyncRunStatus
  filesListed: number
  filesDownloaded: number
  editionsStaged: number
  editionsApplied: number
  editionsHeld: number
  filesFailed: number
  decisionsResolved: number
  kedenPrefetched: number
  errorMessage: string | null
  items: EecSyncRunItem[]
}

export interface EecSyncStart { started: boolean; runId: number | null; isRunning: boolean; run: EecSyncRunView | null }
export interface EecSyncStatus { isRunning: boolean; run: EecSyncRunView | null }

export interface EecDecisionRef { body: string; date: string; number: string; text: string }

export interface EecPendingFootnote {
  number: string
  reason: string
  rateText: string | null
  kedenRate: string | null
  validFrom: string | null
  validTo: string | null
  decision: EecDecisionRef | null
}

export interface EecDiscrepancy {
  code: string
  group: string
  name: string | null
  kind: EecDiscrepancyKind
  eecRate: string | null
  eecRateText: string | null
  eecBaseRateText: string | null
  footnoteRefs: string[]
  footnoteNumber: string | null
  footnoteFrom: string | null
  footnoteTo: string | null
  editionId: number | null
  editionDate: string | null
  fileName: string | null
  notInForceSince: string | null
  pending: EecPendingFootnote[]
  kedenRate: string | null
  kedenUpdatedAtUtc: string | null
}

export interface EecDiscrepancyReport {
  date: string
  total: number
  counts: Partial<Record<EecDiscrepancyKind, number>>
  page: number
  pageSize: number
  items: EecDiscrepancy[]
  groupsLoaded: string[]
}

export interface EecTreeAbsentCode {
  nodeId: number
  code: string
  group: string
  name: string
  kind: EecTreeAbsentKind
  eecNotInForceSince: string | null
  addedByEec: boolean
  kedenRate: string | null
  eecSimilar: string[]
  suggestedEndDate: string | null
  groupEditionFile: string | null
}

export interface EecTreeAbsentReport { total: number; page: number; pageSize: number; items: EecTreeAbsentCode[]; groupsLoaded: string[] }
export interface EecTreeCloseResult { code: string; nodesClosed: number; endDate: string; note: string }

export interface EecDecisionView {
  id: number
  body: string
  number: string
  decisionDate: string
  title: string
  entryIntoForce: string | null
  source: EecDecisionSource
  publishedDate: string | null
  portalUrl: string | null
  portalComment: string | null
  flags: string[]
  lastCheckedAtUtc: string | null
  lastCheckError: string | null
  confirmedBy: string | null
  confirmedAtUtc: string | null
  note: string | null
  footnotes: string[]
  codes: number
}

export interface EecDiscrepancyQuery {
  date?: string
  kind?: EecDiscrepancyKind | null
  group?: string | null
  q?: string
  page?: number
  pageSize?: number
}
export interface EecTreeAbsentQuery { group?: string | null; q?: string; page?: number; pageSize?: number }

// Пустые значения в запрос не идут: сервер понимает «нет фильтра» только при отсутствии параметра.
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))

// Экран сам показывает ошибки загрузки (блок «Повторить»): чтения — без тоста перехватчика.
// Действия (подтвердить, отклонить, закрыть, запустить) — с тостом: текст ошибки сервера { error } покажет перехватчик.
const silent = { silent: true }

export const tnvedEecApi = {
  editions: (filter: { status?: EecEditionStatus | null; kind?: EecEditionKind | null; group?: string | null } = {}) =>
    apiClient.get<EecEditionSummary[]>('/tnved/eec/editions', { params: clean(filter), ...silent }),
  edition: (id: number) => apiClient.get<EecEditionDetail>(`/tnved/eec/editions/${id}`, silent),
  apply: (id: number, note?: string) => apiClient.post<EecApplyResult>(`/tnved/eec/editions/${id}/apply`, { note: note || null }),
  reject: (id: number, reason?: string) => apiClient.post<void>(`/tnved/eec/editions/${id}/reject`, { reason: reason || null }),

  startSync: () => apiClient.post<EecSyncStart>('/tnved/eec/sync'),
  syncStatus: (runId?: number | null) =>
    apiClient.get<EecSyncStatus>('/tnved/eec/sync/status', { params: clean({ runId }), ...silent }),
  syncRuns: (take = 20) => apiClient.get<EecSyncRunView[]>('/tnved/eec/sync/runs', { params: { take }, ...silent }),

  discrepancies: (query: EecDiscrepancyQuery = {}) =>
    apiClient.get<EecDiscrepancyReport>('/tnved/eec/discrepancies', { params: clean({ ...query }), ...silent }),
  treeAbsent: (query: EecTreeAbsentQuery = {}) =>
    apiClient.get<EecTreeAbsentReport>('/tnved/eec/tree-absent', { params: clean({ ...query }), ...silent }),
  closeTreeCode: (code: string, body: { endDate?: string | null; note?: string | null }) =>
    apiClient.post<EecTreeCloseResult>(`/tnved/eec/tree-absent/${encodeURIComponent(code)}/close`, {
      endDate: body.endDate || null,
      note: body.note || null,
    }),

  decisions: (pendingOnly = true) =>
    apiClient.get<EecDecisionView[]>('/tnved/eec/decisions', { params: { pendingOnly }, ...silent }),
  confirmDecision: (id: number, entryIntoForce: string, note?: string) =>
    apiClient.post<EecDecisionView>(`/tnved/eec/decisions/${id}/confirm`, { entryIntoForce, note: note || null }),
}
