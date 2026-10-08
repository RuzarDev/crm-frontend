import type { ZTone } from '@/components/z/ZTag.vue'
import type { ClientOnboardingRow, ClientStatus } from '@/api/clientsOnboarding'
import type { Import40DocumentDto } from '@/api/import40Contract'
import { formatDay, matchesQuery } from '@/views/broker/list'

// Чистая логика списка «Клиенты» (редизайн, волна 3б): сегменты и счётчики, поиск, подписи статусов и документов.

export type ClientSegment = 'all' | ClientStatus | 'nodocs'
/** Порядок сегментов над таблицей. */
export const CLIENT_SEGMENTS: ClientSegment[] = ['all', 'Active', 'Invited', 'nodocs', 'Blocked']
/** Ключи подписей сегментов (общий неймспейс admin.*). */
export const SEGMENT_LABEL: Record<ClientSegment, string> = {
  all: 'admin.vse',
  Active: 'admin.aktivnye',
  Invited: 'admin.priglasheny',
  nodocs: 'admin.bezDokumentov',
  Blocked: 'admin.zablokirovany',
}

const STATUS_TONE: Record<ClientStatus, ZTone> = { Active: 'done', Invited: 'info', Blocked: 'danger' }
export const clientStatusTone = (s: ClientStatus): ZTone => STATUS_TONE[s] ?? 'neutral'
const STATUS_LABEL: Record<ClientStatus, string> = { Active: 'admin.aktiven', Invited: 'admin.priglashen', Blocked: 'admin.zablokirovan' }
export const clientStatusLabelKey = (s: ClientStatus): string => STATUS_LABEL[s] ?? 'admin.status'

/** Как называть клиента: компания, а без неё логин. */
export const clientName = (c: Pick<ClientOnboardingRow, 'companyName' | 'username'>): string => c.companyName || c.username

/** Ссылка-приглашение истекла к моменту now. */
export const isInviteExpired = (iso: string, now: number = Date.now()): boolean => new Date(iso).getTime() < now

/** Поиск: компания, email, логин, БИН (без учёта регистра и пробелов). */
export const matchesClient = (q: string, c: ClientOnboardingRow): boolean => matchesQuery(q, [c.companyName, c.email, c.username, c.bin])

/** «Без документов» — нет действующего договора ИЛИ доверенности (как и раньше). */
export const inSegment = (c: ClientOnboardingRow, segment: ClientSegment): boolean => {
  if (segment === 'all') return true
  if (segment === 'nodocs') return !(c.hasContract && c.hasPoa)
  return c.status === segment
}

export const filterClients = (rows: ClientOnboardingRow[], q: string, segment: ClientSegment): ClientOnboardingRow[] =>
  rows.filter((c) => inSegment(c, segment) && matchesClient(q, c))

/** Счётчики сегментов: по найденному (поиск учтён, сегмент нет) — видно, где совпадения. */
export function segmentCounts(rows: ClientOnboardingRow[], q: string): Record<ClientSegment, number> {
  const out: Record<ClientSegment, number> = { all: 0, Active: 0, Invited: 0, nodocs: 0, Blocked: 0 }
  for (const c of rows) {
    if (!matchesClient(q, c)) continue
    for (const s of CLIENT_SEGMENTS) if (inSegment(c, s)) out[s]++
  }
  return out
}

export const isValidEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
export const binDigits = (v: string): string => v.replace(/\D/g, '')

// ---- Документы клиента ----
const DOC_TONE: Record<number, ZTone> = { 2: 'done', 1: 'wait', 3: 'danger', 4: 'danger' }
export const docStatusTone = (status: number): ZTone => DOC_TONE[status] ?? 'neutral'
const DOC_LABEL: Record<number, string> = { 2: 'admin.deystvuet', 1: 'admin.zhdetPodpisi', 3: 'admin.istek', 4: 'admin.otozvan' }
export const docStatusLabelKey = (status: number): string => DOC_LABEL[status] ?? 'admin.chernovik'

/** Чем подписано: ЭЦП eGov, загруженный файл, отметка в системе. */
export const signMethodLabelKey = (method: string | null): string =>
  method === 'egov' ? 'admin.ecpEgov' : method === 'upload' ? 'admin.zagruzhenFayl' : 'admin.otmetkaVSisteme'

export const docKindLabelKey = (kind: Import40DocumentDto['kind']): string => (kind === 'contract' ? 'admin.dogovor' : 'admin.doverennost')

/** «Договор-12-2026.docx» — имя файла бланка (подпись вида документа берётся из i18n). */
export const blankFileName = (kindLabel: string, doc: Pick<Import40DocumentDto, 'number' | 'year'>): string =>
  `${kindLabel}-${doc.number}-${doc.year}.docx`

/** «до 14.10» для приглашённых: дата или «ссылка истекла». */
export const inviteUntil = (c: ClientOnboardingRow, now: number = Date.now()): { expired: boolean; date: string } | null =>
  c.status === 'Invited' && c.inviteExpiresAtUtc
    ? { expired: isInviteExpired(c.inviteExpiresAtUtc, now), date: formatDay(c.inviteExpiresAtUtc) }
    : null

/** Строки Excel: заголовки и значения из i18n (t). */
export function clientExcelRows(rows: ClientOnboardingRow[], t: (k: string) => string): Record<string, unknown>[] {
  return rows.map((c) => ({
    [t('admin.klient')]: clientName(c),
    [t('admin.email')]: c.email || '',
    [t('admin.bin')]: c.bin || '',
    [t('clientCard.phone')]: c.phone || '',
    [t('admin.status')]: t(clientStatusLabelKey(c.status)),
    [t('admin.dogovor')]: c.hasContract ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('admin.doverennost')]: c.hasPoa ? t('clientDocs.yes') : t('clientDocs.no'),
    [t('admin.sozdan')]: formatDay(c.createdAtUtc),
  }))
}
