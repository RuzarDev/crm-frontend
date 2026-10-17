import type { Import40CaseDto, Import40CaseInvoiceDto } from '@/api/import40'
import type { CaseStages, CaseStageStep, StageEvent, StageEventKind, StageState } from '@/api/stages'
import { formatMoney } from '@/ui/number'
import { TOTAL_STEPS, stepForStatus } from '@/utils/import40Steps'
import { pluralForm } from '@/views/broker/list'

// Модель этапов заявки по утверждённому макету (17.10) — общая для карточки сотрудника и поставки клиента.
// Подписи-итоги под шагами, ответственный, «на шаге · норма» (сотрудник), метки «нужен ваш ответ» / «запрос таможни»,
// подэтапы шага 3 и история шага. Время и нормы — с сервера (GET import40/{id}/stages); без них — только статус.

type T = (k: string, p?: Record<string, unknown>) => string
type Te = (k: string) => boolean

export type StageAudience = 'staff' | 'client'
export type StageTone = 'ok' | 'current' | 'ask' | 'problem' | 'future'

export interface StageTiming {
  elapsed: string
  norm: string
  /** Заполнение полосы 0..100. */
  pct: number
  overdue: boolean
}

export interface StageCard {
  n: number
  state: StageState
  /** Цвет шага: ok — пройден, current — идёт, ask — ход клиента (золото), problem — проблема у сотрудника (danger). */
  tone: StageTone
  /** Итог / что сейчас под названием шага. */
  result: string
  /** Вторая строка: когда, пост, пояснение. */
  detail: string
  /** Кто ведёт шаг: имя или роль. */
  responsible: string
  initials: string
  /** Сотрудник: текущий шаг — время и норма с полосой. */
  timing: StageTiming | null
  /** Сотрудник: пройденный — сколько занял; будущий — норма. */
  meta: string
  /** Метка на текущем шаге: «Нужен ваш ответ» (клиент, золото) / «Запрос таможни · 52 мин» (сотрудник, danger). */
  flag: { tone: 'gold' | 'danger'; text: string } | null
  history: StageEvent[]
}

export interface StageInput {
  audience: StageAudience
  kase: Import40CaseDto
  stages: CaseStages | null
  invoices: Import40CaseInvoiceDto[]
  /** Сколько документов клиента (раздел documents); null — неизвестно. */
  docsCount?: number | null
  /** Клиент: на текущем шаге его ход (askFor). */
  clientAsk?: boolean
  /** Клиент: чек об оплате СВХ загружен. */
  checkUploaded?: boolean
  /** Язык интерфейса — формы числа («2 файла»). */
  locale?: string
  now?: Date
}

const pad = (n: number) => String(n).padStart(2, '0')

/** «2 ч 15 мин», «45 мин», «3 д 4 ч». */
export function durationText(minutes: number, t: T): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return t('stages.dur.min', { n: m })
  if (m < 24 * 60) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${t('stages.dur.h', { n: h })} ${t('stages.dur.min', { n: rest })}` : t('stages.dur.h', { n: h })
  }
  const d = Math.floor(m / (24 * 60))
  const h = Math.floor((m % (24 * 60)) / 60)
  return h ? `${t('stages.dur.d', { n: d })} ${t('stages.dur.h', { n: h })}` : t('stages.dur.d', { n: d })
}

/** «14.10 в 11:05» по местному времени. */
export function whenText(iso: string | null | undefined, t: T): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return t('stages.when', { date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` })
}

const dayMonth = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

/** Коридор ДТ заявки (ручное поле Import40Declaration.Corridor): самый строгий у живых ДТ; зелёный по умолчанию — не показываем. */
export function corridorOf(kase: Import40CaseDto): string | null {
  const rank: Record<string, number> = { red: 3, yellow: 2, blue: 1 }
  let best: string | null = null
  for (const d of kase.declarations ?? []) {
    if (d.isSplitReplaced) continue
    const c = (d.corridor || '').trim().toLowerCase()
    if (!rank[c]) continue
    if (!best || rank[c] > rank[best]) best = c
  }
  return best
}

const corridorText = (c: string, t: T, te: Te) => (te(`stages.corridor.${c}`) ? t(`stages.corridor.${c}`) : c)

export const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')

const last = (events: StageEvent[], ...kinds: StageEventKind[]) =>
  [...events].reverse().find((e) => kinds.includes(e.kind)) ?? null

const STEP_ROLE: Record<number, string> = { 1: 'client', 2: 'kpp', 3: 'declarant', 4: 'kpp', 5: 'clientKpp', 6: 'accountant' }

/** Состояние шага по статусу (как полоса шагов раньше): отменённая — все впереди, выполненная — все пройдены. */
export function baseState(status: number, n: number): StageState {
  if (status === 9) return 'future'
  const cur = stepForStatus(status)
  return n < cur ? 'done' : n === cur ? 'current' : 'future'
}

const paidInvoice = (invoices: Import40CaseInvoiceDto[]) =>
  [...invoices].filter((i) => i.kind === 'invoice' && i.status === 2).sort((a, b) => (b.paidAtUtc ?? '').localeCompare(a.paidAtUtc ?? ''))[0] ?? null
const issuedInvoice = (invoices: Import40CaseInvoiceDto[]) =>
  invoices.find((i) => i.kind === 'invoice' && i.status === 1) ?? null

export function buildStageCards(input: StageInput, t: T, te: Te): StageCard[] {
  const { audience, kase, stages, invoices } = input
  const client = audience === 'client'
  const now = input.now ?? new Date()
  const status = kase.status
  const byStep = new Map<number, CaseStageStep>((stages?.steps ?? []).map((s) => [s.step, s]))
  const k = (staffKey: string, clientKey?: string) => t(`stages.result.${client && clientKey ? clientKey : staffKey}`)
  const withWhen = (text: string, iso: string | null | undefined) => [text, whenText(iso, t)].filter(Boolean).join(' · ')
  const corridor = corridorOf(kase)

  const cards: StageCard[] = []
  for (let n = 1; n <= TOTAL_STEPS; n++) {
    const s = byStep.get(n) ?? null
    const history = s?.history ?? []
    let state = baseState(status, n)
    let result = ''
    let detail = ''

    switch (n) {
      case 1: {
        if (state === 'done') {
          result = k('s1Done')
          const sent = last(history, 'submitted', 'resubmitted')
          const files = input.docsCount != null && input.docsCount > 0 ? t(`broker.case.count.files.${pluralForm(input.docsCount, input.locale ?? 'ru')}`, { n: input.docsCount }) : ''
          detail = [whenText(sent?.atUtc, t), files].filter(Boolean).join(' · ')
        } else if (state === 'current') {
          const rework = s?.inRework || !!kase.returnReason
          result = rework ? k('s1Rework', 's1ReworkClient') : k('s1Draft', 's1DraftClient')
        }
        break
      }
      case 2:
        if (state === 'done') {
          result = k('s2Done')
          detail = [whenText(last(history, 'borderPassed')?.atUtc, t), kase.post].filter(Boolean).join(' · ')
        } else if (state === 'current') result = k('s2Current', 's2CurrentClient')
        break
      case 3: {
        const released = last(history, 'released')
        const filed = last(history, 'dtSubmitted')
        if (status >= 4 && status !== 9) {
          result = k('s3Released')
          detail = whenText(released?.atUtc, t)
        } else if (status === 3) {
          const base = k('s3Submitted')
          result = corridor ? t('stages.result.corridor', { text: base, corridor: corridorText(corridor, t, te) }) : base
          detail = whenText(filed?.atUtc, t)
        } else if (state === 'current') result = k('s3Fill', 's3FillClient')
        break
      }
      case 4:
        if (state === 'done') result = withWhen(k('s4Done'), last(history, 'svhClosed')?.atUtc)
        else if (state === 'current') result = status === 5 ? k('s4Closed') : k('s4Current')
        else if (status !== 9) result = k('s4Future', 's4FutureClient')
        break
      case 5:
        if (state === 'done') result = withWhen(k('s5Done'), last(history, 'svhPaid')?.atUtc)
        else if (state === 'current') {
          result = client ? (input.checkUploaded ? k('s5Check') : k('s5CurrentClient')) : k('s5Current')
          detail = kase.svhInvoiceAmount != null ? formatMoney(Math.round(kase.svhInvoiceAmount)) : ''
        } else if (status !== 9) result = k('s5Future', 's5FutureClient')
        break
      case 6: {
        // Шаги 5 и 6 идут параллельно: оплаченный счёт AQNIET — шаг пройден, даже если склад ещё не оплачен.
        const paid = paidInvoice(invoices)
        const issued = issuedInvoice(invoices)
        if (paid && status !== 9) {
          state = 'done'
          result = client
            ? t('stages.result.s6Paid', { n: paid.number, date: dayMonth(paid.paidAtUtc) })
            : t('stages.result.s6PaidSum', { n: paid.number, sum: formatMoney(paid.total), date: dayMonth(paid.paidAtUtc) })
        } else if (state === 'done') {
          result = t('broker.case.aqniet.completedWithoutInvoice')
        } else if (issued && status !== 9) {
          result = client
            ? t('stages.result.s6Issued', { n: issued.number })
            : t('stages.result.s6IssuedSum', { n: issued.number, sum: formatMoney(issued.total) })
        } else if (status !== 9) result = k('s6None', 's6NoneClient')
        break
      }
    }

    // Ответственный: сотруднику — имя (сервер или назначение), клиенту — только его декларант на шаге 3.
    const roleLabel = t(`enum.role.${STEP_ROLE[n]}`)
    let name: string | null
    if (client) name = n === 3 ? kase.assignedDeclarantName ?? null : null
    else {
      name = s?.responsibleName
        ?? (n === 1 ? kase.clientName || null
          : n === 3 ? kase.assignedDeclarantName ?? null
            : n === 2 || n === 4 || n === 5 ? kase.assignedKppName ?? null
              : null)
    }
    const responsible = client ? (name ? t('stages.declarant', { name }) : '') : name ?? capitalize(roleLabel)

    // Время: только сотруднику и только с сервера.
    let timing: StageTiming | null = null
    let meta = ''
    if (!client && s) {
      if (state === 'current' && s.elapsedMinutes != null && s.normMinutes) {
        timing = {
          elapsed: durationText(s.elapsedMinutes, t),
          norm: t('stages.norm', { time: durationText(s.normMinutes, t) }),
          pct: Math.min(100, Math.round((s.elapsedMinutes / s.normMinutes) * 100)),
          overdue: s.overdue,
        }
      } else if (state === 'done' && s.spentMinutes != null) meta = durationText(s.spentMinutes, t)
      else if (state === 'future' && s.normMinutes) meta = t('stages.norm', { time: durationText(s.normMinutes, t) })
    }

    // Метки текущего шага.
    let flag: StageCard['flag'] = null
    let tone: StageTone = state === 'done' ? 'ok' : state === 'current' ? 'current' : 'future'
    if (state === 'current') {
      if (client && (kase.isProblem || input.clientAsk)) {
        flag = { tone: 'gold', text: t('stages.flag.ask') }
        tone = 'ask'
      } else if (!client && kase.isProblem) {
        const req = last(history, 'customsRequest') ?? last(allEvents(stages), 'customsRequest')
        const mins = req ? (now.getTime() - new Date(req.atUtc).getTime()) / 60000 : null
        flag = { tone: 'danger', text: mins != null && mins >= 0 ? t('stages.flag.customsFor', { time: durationText(mins, t) }) : t('stages.flag.customs') }
        tone = 'problem'
      }
    }

    cards.push({
      n, state, tone, result, detail, responsible, initials: name ? initialsOf(name) : '', timing, meta, flag,
      history: [...history].sort((a, b) => b.atUtc.localeCompare(a.atUtc)),
    })
  }
  return cards
}

const allEvents = (stages: CaseStages | null): StageEvent[] => (stages?.steps ?? []).flatMap((s) => s.history)

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

// ───────────────────────── подэтапы шага 3 ─────────────────────────

export type SubKey = 'fill' | 'submit' | 'check' | 'release'
export interface SubStage { key: SubKey; label: string; state: 'done' | 'current' | 'todo'; tone: StageTone; caption: string }

/** Заполнение → Подача → Проверка таможней / коридор → Выпуск — по статусу, событиям шага 3 и ручному коридору. */
export function declaringSubstages(input: StageInput, t: T, te: Te): SubStage[] {
  const { audience, kase, stages } = input
  const client = audience === 'client'
  const status = kase.status
  const history = (stages?.steps ?? []).find((s) => s.step === 3)?.history ?? []
  const filed = last(history, 'dtSubmitted')
  const released = last(history, 'released')
  const corridor = corridorOf(kase)
  const cancelled = status === 9
  const ready = (iso: string | null | undefined) => (iso ? t('stages.sub.readyAt', { when: whenText(iso, t) }) : t('stages.sub.ready'))
  const todo = (key: SubKey, label: string, caption = ''): SubStage => ({ key, label, state: 'todo', tone: 'future', caption })

  const fillLabel = t('stages.sub.fill')
  const submitLabel = t(client ? 'stages.sub.submitClient' : 'stages.sub.submit')
  const checkLabel = t(client ? 'stages.sub.check' : 'stages.sub.checkStaff')
  const releaseLabel = t('stages.sub.release')
  if (cancelled || status < 2) {
    return [todo('fill', fillLabel), todo('submit', submitLabel), todo('check', checkLabel), todo('release', releaseLabel, t('stages.sub.expected'))]
  }

  const fill: SubStage = status >= 3
    ? { key: 'fill', label: fillLabel, state: 'done', tone: 'ok', caption: ready(filed?.atUtc) }
    : { key: 'fill', label: fillLabel, state: 'current', tone: 'current', caption: t('stages.sub.inProgress') }
  const submit: SubStage = status >= 3
    ? { key: 'submit', label: submitLabel, state: 'done', tone: 'ok', caption: ready(filed?.atUtc) }
    : todo('submit', submitLabel)

  const corridorLine = corridor ? corridorText(corridor, t, te) : ''
  let check: SubStage
  if (status === 3) {
    const problem = kase.isProblem
    const parts = [corridorLine, problem ? t(client ? 'stages.sub.waitYou' : 'stages.sub.docsRequest') : ''].filter(Boolean)
    check = {
      key: 'check', label: checkLabel, state: 'current',
      tone: problem ? (client ? 'ask' : 'problem') : 'current',
      caption: parts.join(' · ') || t('stages.sub.inProgress'),
    }
  } else if (status >= 4) {
    check = { key: 'check', label: checkLabel, state: 'done', tone: 'ok', caption: corridorLine || t('stages.sub.ready') }
  } else check = todo('check', checkLabel)

  const release: SubStage = status >= 4
    ? { key: 'release', label: releaseLabel, state: 'done', tone: 'ok', caption: ready(released?.atUtc) }
    : todo('release', releaseLabel, t('stages.sub.expected'))

  return [fill, submit, check, release]
}

// ───────────────────────── история ─────────────────────────

/** Подпись события: клиенту — его формулировки (stages.eventClient.*), где они отличаются. */
export function eventLabel(e: StageEvent, audience: StageAudience, t: T, te: Te): string {
  if (audience === 'client' && te(`stages.eventClient.${e.kind}`)) return t(`stages.eventClient.${e.kind}`)
  return te(`stages.event.${e.kind}`) ? t(`stages.event.${e.kind}`) : e.kind
}

/** Время в истории: сегодня — «11:48», иначе «15.10 11:48». */
export function eventTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.toDateString() === now.toDateString() ? time : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`
}

/** Шаг по умолчанию для истории: текущий; выполненная — последний; отменённая — нет. */
export function defaultSelectedStep(status: number): number | null {
  if (status === 9) return null
  if (status === 8) return TOTAL_STEPS
  return stepForStatus(status)
}
