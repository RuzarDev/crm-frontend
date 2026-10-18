import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import type { CaseStages, CaseStageStep, StageEvent } from '@/api/stages'
import type { Import40CaseInvoiceDto } from '@/api/import40'
import type { CustomsRequestDto } from '@/api/customsRequests'
import { formatMoney } from '@/ui/number'
import { caseDto, declaration } from '@/views/client/__tests__/caseFixture'
import {
  buildStageCards, corridorOf, declaringSubstages, defaultSelectedStep, durationText, eventLabel, type StageInput,
} from '../import40StageModel'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } })
const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string
const te = i18n.global.te as unknown as (k: string) => boolean

const ev = (kind: StageEvent['kind'], atUtc: string, step: number, o: Partial<StageEvent> = {}): StageEvent =>
  ({ id: `${kind}-${atUtc}`, kind, atUtc, step, declarationId: null, userName: null, note: '', ...o })
const step = (n: number, o: Partial<CaseStageStep> = {}): CaseStageStep => ({
  step: n, state: 'future', responsibleRole: 'kpp', responsibleId: null, responsibleName: null, startedAtUtc: null, endedAtUtc: null,
  elapsedMinutes: null, spentMinutes: null, normMinutes: null, overdue: false, inRework: false, history: [], ...o,
})
const stages = (steps: CaseStageStep[], status = 3): CaseStages => ({
  status, currentStep: 3, nowUtc: '2026-10-16T12:00:00Z', steps: [1, 2, 3, 4, 5, 6].map((n) => steps.find((s) => s.step === n) ?? step(n)),
})

const custReq = (o: Partial<CustomsRequestDto> = {}): CustomsRequestDto => ({
  id: 'r1', declarationId: null, declarationNumber: null, corridor: null, text: 'Нужен сертификат', docKinds: ['conformity'],
  dueAtUtc: null, createdAtUtc: '2026-10-16T11:00:00Z', createdByName: null, status: 'open', answeredAtUtc: null, answerText: '',
  answerFiles: [], closedAtUtc: null, closedByName: null, closeNote: '', lastReminderAtUtc: null, reminderCount: 0, ...o,
})

// Локальное время событий: подписи «14.10 в 11:05» считаются по часовому поясу браузера.
const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

describe('durationText', () => {
  it('минуты, часы с минутами, дни с часами', () => {
    expect(durationText(45, t)).toBe('45 мин')
    expect(durationText(135, t)).toBe('2 ч 15 мин')
    expect(durationText(240, t)).toBe('4 ч')
    expect(durationText(26 * 60, t)).toBe('1 д 2 ч')
    expect(durationText(72 * 60, t)).toBe('3 д')
  })
})

describe('buildStageCards — сотрудник', () => {
  const submitted = local(2026, 10, 14, 11, 5)
  const border = local(2026, 10, 15, 14, 20)
  const input = (o: Partial<StageInput> = {}): StageInput => ({
    audience: 'staff',
    kase: caseDto({ status: 3, post: 'Хоргос', assignedDeclarantName: 'Айгерим К.', declarations: [declaration({ corridor: 'yellow' })] }),
    stages: stages([
      step(1, { state: 'done', history: [ev('submitted', submitted, 1)], spentMinutes: 70 }),
      step(2, { state: 'done', responsibleName: 'Ерлан Б.', history: [ev('borderPassed', border, 2)] }),
      step(3, { state: 'current', elapsedMinutes: 135, normMinutes: 240, history: [ev('dtSubmitted', local(2026, 10, 16, 10, 25), 3)] }),
      step(4, { normMinutes: 24 * 60 }),
    ]),
    invoices: [],
    docsCount: 6,
    locale: 'ru',
    ...o,
  })

  it('итоги под шагами, коридор, ответственный и «на шаге · норма» с полосой', () => {
    const cards = buildStageCards(input(), t, te)
    expect(cards[0]!.result).toBe('Документы приняты')
    expect(cards[0]!.detail).toBe('14.10 в 11:05 · 6 файлов')
    expect(cards[0]!.meta).toBe('1 ч 10 мин')
    expect(cards[1]!.result).toBe('Граница пройдена')
    expect(cards[1]!.detail).toBe('15.10 в 14:20 · Хоргос')
    expect(cards[1]!.responsible).toBe('Ерлан Б.')
    expect(cards[1]!.initials).toBe('ЕБ')
    expect(cards[2]!.result).toBe('ДТ подана · жёлтый коридор')
    expect(cards[2]!.responsible).toBe('Айгерим К.')
    expect(cards[2]!.timing).toEqual({ elapsed: '2 ч 15 мин', norm: 'норма 4 ч', pct: 56, overdue: false })
    expect(cards[3]!.result).toBe('Ждёт выпуска')
    expect(cards[3]!.meta).toBe('норма 1 д')
    expect(cards[3]!.responsible).toBe('КПП')
  })

  it('открытый запрос таможни — красная метка «Запрос таможни · время без ответа» на шаге 3', () => {
    const now = new Date(Date.UTC(2026, 9, 16, 11, 52))
    const cards = buildStageCards(input({ customs: [custReq()], now }), t, te)
    expect(cards[2]!.flag).toEqual({ tone: 'danger', text: 'Запрос таможни · 52 мин без ответа' })
    expect(cards[2]!.tone).toBe('problem')
    // Клиент ответил (answered) или запрос закрыт — метки нет.
    expect(buildStageCards(input({ customs: [custReq({ status: 'answered' })], now }), t, te)[2]!.flag).toBeNull()
  })

  it('запрос на границе — метка на шаге 2; после выпуска — без метки шага (не просрочка этапа)', () => {
    const now = new Date(Date.UTC(2026, 9, 16, 11, 52))
    const atBorder = buildStageCards(input({ kase: caseDto({ status: 1 }), stages: null, customs: [custReq({ stage: 'border' })], now }), t, te)
    expect(atBorder[1]!.flag).toEqual({ tone: 'danger', text: 'Запрос на границе · 52 мин без ответа' })
    expect(atBorder[1]!.tone).toBe('problem')
    expect(atBorder[2]!.flag).toBeNull()
    // Запрос при проверке ДТ на шаге 2 не помечается и наоборот.
    expect(buildStageCards(input({ customs: [custReq({ stage: 'border' })], now }), t, te)[2]!.flag).toBeNull()
    for (const status of [4, 6, 8]) {
      const cards = buildStageCards(input({ kase: caseDto({ status }), stages: null, customs: [custReq({ stage: 'postRelease' })], now }), t, te)
      expect(cards.every((c) => c.flag === null)).toBe(true)
    }
  })

  it('внутренняя проблема заявки — не запрос таможни: метки на этапах нет (её показывает плашка карточки)', () => {
    const base = input()
    const cards = buildStageCards({ ...base, kase: { ...base.kase, isProblem: true } }, t, te)
    expect(cards.every((c) => c.flag === null)).toBe(true)
    expect(cards[2]!.tone).toBe('current')
  })

  it('возврат по чек-листу без причины — «На доработке у клиента»', () => {
    const cards = buildStageCards(input({ kase: caseDto({ status: 0, returnReason: '', reworkRequested: true }), stages: null }), t, te)
    expect(cards[0]!.result).toBe('На доработке у клиента')
  })

  it('счёт AQNIET ждёт оплаты при текущем шаге 5 — шаг 6 тоже идёт (время с сервера)', () => {
    const issued: Import40CaseInvoiceDto = { id: 'i2', kind: 'invoice', status: 1, number: '155', year: 2026, total: 100000, issuedAtUtc: '2026-10-14T06:00:00Z', paidAtUtc: null }
    const st = stages([step(5, { state: 'current' }), step(6, { state: 'current', elapsedMinutes: 600, normMinutes: 72 * 60 })], 6)
    const cards = buildStageCards(input({ kase: caseDto({ status: 6 }), stages: st, invoices: [issued] }), t, te)
    expect(cards[4]!.state).toBe('current')
    expect(cards[5]!.state).toBe('current')
    expect(cards[5]!.timing).toMatchObject({ elapsed: '10 ч', norm: 'норма 3 д' })
  })

  it('без данных хронометража — только статус, без времени', () => {
    const cards = buildStageCards(input({ stages: null }), t, te)
    expect(cards.map((c) => c.state)).toEqual(['done', 'done', 'current', 'future', 'future', 'future'])
    expect(cards.every((c) => c.timing === null)).toBe(true)
    expect(cards[2]!.result).toBe('ДТ подана · жёлтый коридор')
  })

  it('шаги 5 и 6 параллельно: оплаченный счёт AQNIET — шаг 6 пройден при текущем 5', () => {
    const paid: Import40CaseInvoiceDto = { id: 'i1', kind: 'invoice', status: 2, number: '154', year: 2026, total: 240000, issuedAtUtc: null, paidAtUtc: '2026-10-14T06:00:00Z' }
    const cards = buildStageCards(input({ kase: caseDto({ status: 6 }), stages: null, invoices: [paid] }), t, te)
    expect(cards[4]!.state).toBe('current')
    expect(cards[5]!.state).toBe('done')
    expect(cards[5]!.result).toBe(`№ 154 · ${formatMoney(240000)} · оплачен 14.10`)
  })
})

describe('buildStageCards — шаги до 17.10 и предоплата AQNIET', () => {
  const base = (o: Partial<StageInput> = {}): StageInput => ({
    audience: 'staff', kase: caseDto({ status: 3 }), stages: null, invoices: [], docsCount: 0, locale: 'ru', ...o,
  })

  it('шаг без истории (до 17.10) — без полосы и «просрочено», подпись «до 17.10 — история не велась»', () => {
    const st = stages([
      step(1, { state: 'done', historyMissing: true }),
      step(2, { state: 'done', historyMissing: true }),
      step(3, { state: 'current', historyMissing: true, elapsedMinutes: 9000, normMinutes: 480, overdue: false }),
    ])
    const cards = buildStageCards(base({ stages: st }), t, te)
    expect(cards[2]!.timing).toBeNull()
    expect(cards[2]!.meta).toBe('до 17.10 — история не велась')
    expect(cards[0]!.meta).toBe('до 17.10 — история не велась')
    expect(cards[3]!.meta).toBe('') // будущий шаг — не помечается
  })

  it('выставленная предоплата до шага 4 — шаг 6 впереди (сервер: future), итог — под шагом', () => {
    const issued: Import40CaseInvoiceDto = { id: 'i3', kind: 'invoice', status: 1, number: '156', year: 2026, total: 50000, issuedAtUtc: '2026-10-10T06:00:00Z', paidAtUtc: null }
    const st = stages([step(3, { state: 'current' }), step(6, { state: 'future', normMinutes: 4320 })], 3)
    const cards = buildStageCards(base({ stages: st, invoices: [issued] }), t, te)
    expect(cards[5]!.state).toBe('future')
    expect(cards[5]!.timing).toBeNull()
    expect(cards[5]!.result).toBe(`№ 156 · ${formatMoney(50000)} · ждёт оплаты`)
  })

  it('оплаченная предоплата до шага 4 — итог под шагом 6, но шаг не пройден (сотрудник и клиент)', () => {
    const paid: Import40CaseInvoiceDto = { id: 'i4', kind: 'invoice', status: 2, number: '154', year: 2026, total: 240000, issuedAtUtc: null, paidAtUtc: '2026-10-14T06:00:00Z' }
    const staff = buildStageCards(base({ kase: caseDto({ status: 4 }), invoices: [paid] }), t, te)
    expect(staff[5]!.state).toBe('future')
    // Сервер прошёл шаг 4 (после возврата 5→4 счёт выставлен на шаге 5) — шаг 6 пройден и при статусе 4.
    const after = buildStageCards(base({ kase: caseDto({ status: 4 }), invoices: [paid], stages: stages([step(6, { state: 'done' })], 4) }), t, te)
    expect(after[5]!.state).toBe('done')
    expect(staff[5]!.result).toBe(`№ 154 · ${formatMoney(240000)} · оплачен 14.10`)
    const client = buildStageCards(base({ audience: 'client', kase: caseDto({ status: 4 }), invoices: [paid] }), t, te)
    expect(client[5]!.state).toBe('future')
    expect(client[5]!.result).toBe('Счёт № 154 оплачен 14.10')
  })
})

describe('buildStageCards — клиент', () => {
  it('без времени и ФИО сотрудников, кроме своего декларанта; запрос таможни — золотая метка', () => {
    const kase = caseDto({ status: 3, assignedKppName: 'Ерлан Б.', assignedDeclarantName: 'Айгерим К.' })
    const st = stages([
      step(2, { state: 'done', responsibleName: 'Ерлан Б.', spentMinutes: 100 }),
      step(3, { state: 'current', responsibleName: 'Айгерим К.', elapsedMinutes: 30, normMinutes: 240 }),
    ])
    const cards = buildStageCards({ audience: 'client', kase, stages: st, invoices: [], customs: [custReq()] }, t, te)
    expect(cards[1]!.responsible).toBe('')
    expect(cards[1]!.meta).toBe('')
    expect(cards[2]!.responsible).toBe('Декларант Айгерим К.')
    expect(cards[2]!.timing).toBeNull()
    expect(cards[2]!.flag).toEqual({ tone: 'gold', text: 'Нужен ваш ответ' })
    expect(cards[3]!.result).toBe('После выпуска склад снимает груз с учёта и выставляет счёт')
    expect(cards[4]!.result).toBe('Счёт придёт после закрытия на СВХ')
  })

  it('вопрос AQNIET по заявке (не запрос таможни) — прежний красный, без золота', () => {
    const kase = caseDto({ status: 3, isProblem: true })
    const cards = buildStageCards({ audience: 'client', kase, stages: null, invoices: [], clientAsk: 'problem' }, t, te)
    expect(cards[2]!.flag).toEqual({ tone: 'danger', text: 'Нужен ваш ответ' })
    expect(cards[2]!.tone).toBe('problem')
    const customs = buildStageCards({ audience: 'client', kase: caseDto({ status: 3 }), stages: null, invoices: [], clientAsk: 'customs' }, t, te)
    expect(customs[2]!.flag).toEqual({ tone: 'gold', text: 'Нужен ваш ответ' })
  })

  it('возврат на доработку и оплата склада: формулировки клиента', () => {
    const returned = buildStageCards({ audience: 'client', kase: caseDto({ status: 0, returnReason: 'нет инвойса' }), stages: null, invoices: [], clientAsk: 'returned' }, t, te)
    expect(returned[0]!.result).toBe('Нужно доработать заявку')
    expect(returned[0]!.tone).toBe('ask')
    const check = buildStageCards({ audience: 'client', kase: caseDto({ status: 6 }), stages: null, invoices: [], checkUploaded: true }, t, te)
    expect(check[4]!.result).toBe('Чек на проверке')
    expect(check[4]!.flag).toBeNull()
  })
})

describe('подэтапы шага 3', () => {
  it('подана, жёлтый коридор и запрос: клиенту — «ждём ваш документ» (золото), сотруднику — «запрос документов»', () => {
    const kase = caseDto({ status: 3, declarations: [declaration({ corridor: 'yellow' })] })
    const client = declaringSubstages({ audience: 'client', kase, stages: null, invoices: [], customs: [custReq()] }, t, te)
    expect(client.map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo'])
    expect(client.map((s) => s.label)).toEqual(['Заполнение', 'Подача в КЕДЕН', 'Проверка таможней', 'Выпуск'])
    expect(client[2]).toMatchObject({ tone: 'ask', caption: 'жёлтый коридор · ждём ваш документ' })
    const staff = declaringSubstages({ audience: 'staff', kase, stages: null, invoices: [], customs: [custReq()] }, t, te)
    expect(staff[2]).toMatchObject({ label: 'Коридор', tone: 'problem', caption: 'жёлтый коридор · запрос документов' })
    // Запрос на границе или после выпуска — не «запрос документов» проверки ДТ.
    const other = declaringSubstages({ audience: 'staff', kase, stages: null, invoices: [], customs: [custReq({ stage: 'border' }), custReq({ stage: 'postRelease' })] }, t, te)
    expect(other[2]).toMatchObject({ tone: 'current', caption: 'жёлтый коридор' })
    // Внутренняя проблема без запроса таможни — не «запрос документов».
    const problem = declaringSubstages({ audience: 'staff', kase: { ...kase, isProblem: true }, stages: null, invoices: [] }, t, te)
    expect(problem[2]).toMatchObject({ tone: 'current', caption: 'жёлтый коридор' })
  })

  it('заполнение идёт; после выпуска — всё готово', () => {
    expect(declaringSubstages({ audience: 'staff', kase: caseDto({ status: 2 }), stages: null, invoices: [] }, t, te).map((s) => s.state))
      .toEqual(['current', 'todo', 'todo', 'todo'])
    expect(declaringSubstages({ audience: 'staff', kase: caseDto({ status: 5 }), stages: null, invoices: [] }, t, te).every((s) => s.state === 'done'))
      .toBe(true)
  })

  it('зелёный коридор по умолчанию не показываем; самый строгий из живых ДТ', () => {
    expect(corridorOf(caseDto({ declarations: [declaration({ corridor: 'green' })] }))).toBeNull()
    expect(corridorOf(caseDto({ declarations: [declaration({ corridor: 'yellow' }), declaration({ id: 'd2', corridor: 'red' })] }))).toBe('red')
    expect(corridorOf(caseDto({ declarations: [declaration({ corridor: 'red', isSplitReplaced: true })] }))).toBeNull()
  })
})

describe('история и шаг по умолчанию', () => {
  it('клиенту — его формулировки событий', () => {
    const e = ev('customsRequest', '2026-10-16T06:48:00Z', 3)
    expect(eventLabel(e, 'client', t, te)).toBe('Запрос таможни')
    expect(eventLabel(e, 'staff', t, te)).toBe('Запрос таможни')
    expect(eventLabel(ev('problemSet', '2026-10-16T06:48:00Z', 3), 'client', t, te)).toBe('Запрос по заявке')
    expect(eventLabel(ev('problemSet', '2026-10-16T06:48:00Z', 3), 'staff', t, te)).toBe('Отмечена проблема')
    expect(eventLabel(ev('brokerPaid', '2026-10-16T06:48:00Z', 6), 'client', t, te)).toBe('Счёт за услуги брокера оплачен')
  })
  it('текущий шаг; выполненная — 6; отменённая — нет', () => {
    expect(defaultSelectedStep(3)).toBe(3)
    expect(defaultSelectedStep(8)).toBe(6)
    expect(defaultSelectedStep(9)).toBeNull()
  })
})

describe('buildStageCards — шаг 2 «Граница» (КПП, 18.10)', () => {
  const arrived = local(2026, 10, 18, 14, 20)
  const passed = local(2026, 10, 18, 16, 5)
  const base = (audience: 'staff' | 'client', status: number, s2: CaseStageStep, kase: Record<string, unknown> = {}): StageInput => ({
    audience,
    kase: caseDto({ status, post: 'Хоргос', borderArrivedAtUtc: arrived, borderArrivalPost: 'Нур Жолы', ...kase }),
    stages: stages([step(1, { state: 'done' }), s2], status),
    invoices: [],
    locale: 'ru',
  })

  it('текущий шаг: «Машина на границе» и «Прибыла 18.10 в 14:20 · пост …» — и сотруднику, и клиенту', () => {
    for (const audience of ['staff', 'client'] as const) {
      const card = buildStageCards(base(audience, 1, step(2, { state: 'current', history: [ev('atBorder', arrived, 2)] })), t, te)[1]!
      expect(card.result).toBe('Машина на границе')
      expect(card.detail).toBe('Прибыла 18.10 в 14:20 · пост Нур Жолы')
    }
  })

  it('прибытие не отмечено — как раньше', () => {
    const card = buildStageCards(base('client', 1, step(2, { state: 'current' }), { borderArrivedAtUtc: null }), t, te)[1]!
    expect(card.result).toBe('Груз проходит границу')
    expect(card.detail).toBe('')
  })

  it('пройден: прибытие и прохождение; прибытие тем же действием — только время прохождения и пост', () => {
    const card = buildStageCards(base('staff', 3, step(2, { state: 'done', history: [ev('atBorder', arrived, 2), ev('borderPassed', passed, 2)] })), t, te)[1]!
    expect(card.detail).toBe('Прибыла 18.10 в 14:20 · пост Нур Жолы · пройдена 18.10 в 16:05')
    const same = buildStageCards(base('staff', 3, step(2, { state: 'done', history: [ev('atBorder', passed, 2), ev('borderPassed', passed, 2)] }),
      { borderArrivedAtUtc: passed, borderArrivalPost: 'Хоргос' }), t, te)[1]!
    expect(same.detail).toBe('18.10 в 16:05 · Хоргос')
  })

  it('контроль в истории: клиенту — «Пройден контроль» с видом', () => {
    const e = ev('borderControl', arrived, 2, { note: 'фитосанитарный контроль' })
    expect(eventLabel(e, 'client', t, te)).toBe('Пройден контроль')
  })
})
