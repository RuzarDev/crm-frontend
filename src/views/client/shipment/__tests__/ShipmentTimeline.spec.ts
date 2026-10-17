import { describe, expect, it } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientShipment } from '@/api/clientShipments'
import type { Import40CaseDto, Import40CaseInvoiceDto } from '@/api/import40'
import type { CustomsRequestDto } from '@/api/customsRequests'
import type { CaseStages, CaseStageStep, StageEvent } from '@/api/stages'
import { caseDto, declaration } from '@/views/client/__tests__/caseFixture'
import ShipmentTimeline from '../ShipmentTimeline.vue'

const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 'c1', number: 'ИМ-2026-0166', cargo: 'Серверное оборудование', post: 'Нур-Жолы', status: 2, step: 3, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: '276', estimatedValue: null, currencyCode: 'EUR',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null, createdAtUtc: '2026-09-24T09:00:00Z', updatedAtUtc: '2026-10-07T09:00:00Z', ...o,
})
const ev = (kind: StageEvent['kind'], atUtc: string, step: number, note = ''): StageEvent =>
  ({ id: `${kind}-${atUtc}`, kind, atUtc, step, declarationId: null, userName: null, note })
const stepOf = (n: number, o: Partial<CaseStageStep> = {}): CaseStageStep => ({
  step: n, state: 'future', responsibleRole: 'kpp', responsibleId: null, responsibleName: null, startedAtUtc: null, endedAtUtc: null,
  elapsedMinutes: null, spentMinutes: null, normMinutes: null, overdue: false, inRework: false, history: [], ...o,
})
const local = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString()

type Extra = {
  docsCount?: number | null; filesUnknown?: boolean; kase?: Partial<Import40CaseDto>; stages?: CaseStages | null
  invoices?: Import40CaseInvoiceDto[]; customs?: CustomsRequestDto[]
}
const mountWith = (s: Partial<ClientShipment>, extra: Extra = {}) =>
  mountWithI18n(ShipmentTimeline, {
    props: {
      shipment: ship(s),
      caseDto: caseDto({ status: s.status ?? 2, isProblem: s.isProblem ?? false, returnReason: s.returnReason ?? '', ...extra.kase }),
      docsCount: extra.docsCount === undefined ? 3 : extra.docsCount,
      filesUnknown: extra.filesUnknown,
      stages: extra.stages ?? null,
      invoices: extra.invoices ?? [],
      customs: extra.customs ?? [],
    },
  })

const statesOf = (w: ReturnType<typeof mountWith>) => w.findAll('li[data-step]').map((li) => li.attributes('data-state'))
const card = (w: ReturnType<typeof mountWith>, n: number) => w.get(`li[data-step="${n}"]`)

describe('ShipmentTimeline', () => {
  it('шаг 3 текущий — 1–2 пройдены, 3 текущий, 4–6 впереди; названия по макету', () => {
    const w = mountWith({ status: 2, step: 3 })
    expect(statesOf(w)).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo'])
    expect(card(w, 3).attributes('aria-current')).toBe('step')
    expect(card(w, 3).get('[data-step-now]').text()).toBe('сейчас — работает AQNIET')
    expect(w.findAll('[data-step-title]').map((n) => n.text())).toEqual([
      'Документы', 'Прохождение границы', 'Оформление декларации и выпуск', 'Закрытие на СВХ', 'Оплата склада (СВХ)', 'Оплата услуг брокера',
    ])
    // Шаги 5 и 6 — «в любом порядке».
    expect(card(w, 5).get('[data-stage-parallel]').text()).toBe('Шаги 5 и 6 — в любом порядке')
  })

  it('ход клиента — золотой текущий и «Нужен ваш ответ»; вопрос AQNIET (проблема) — красная метка', () => {
    const pay = mountWith({ status: 6, step: 5 })
    expect(statesOf(pay)[4]).toBe('currentAsk')
    expect(card(pay, 5).get('[data-step-flag]').text()).toBe('Нужен ваш ответ')
    const problem = mountWith({ status: 1, step: 2, isProblem: true })
    expect(statesOf(problem)).toEqual(['done', 'currentProblem', 'todo', 'todo', 'todo', 'todo'])
    expect(card(problem, 2).get('[data-step-flag]').text()).toBe('Нужен ваш ответ')
    expect(card(problem, 2).get('[data-step-flag]').classes()).toContain('bg-tone-danger-bg')
  })

  it('открытый запрос таможни — золотое «Нужен ваш ответ» и «ждём ваш документ» в подэтапах', () => {
    const req: CustomsRequestDto = {
      id: 'r1', declarationId: null, declarationNumber: null, corridor: null, text: 'Нужен сертификат', docKinds: [],
      dueAtUtc: null, createdAtUtc: '2026-10-16T11:00:00Z', createdByName: null, status: 'open', answeredAtUtc: null,
      answerText: '', answerFiles: [], closedAtUtc: null, closedByName: null, closeNote: '', lastReminderAtUtc: null, reminderCount: 0,
    }
    const w = mountWith({ status: 3, step: 3, customsRequestSinceUtc: req.createdAtUtc }, { customs: [req] })
    const flag = card(w, 3).get('[data-step-flag]')
    expect(flag.text()).toBe('Нужен ваш ответ')
    expect(flag.classes()).toContain('bg-gold-soft')
    expect(w.get('[data-stage-detail] [data-sub="check"]').text()).toContain('ждём ваш документ')
  })

  it('файлы не загрузились — оплата склада без «ваш ход»: текущий этап обычный, работает AQNIET', () => {
    const w = mountWith({ status: 6, step: 5 }, { docsCount: null, filesUnknown: true })
    expect(statesOf(w)[4]).toBe('current')
    expect(card(w, 5).get('[data-step-now]').text()).toBe('сейчас — работает AQNIET')
    expect(card(w, 1).find('[data-step-note]').exists()).toBe(false)
  })

  it('итоги по событиям: документы приняты, граница пройдена, ДТ подана · жёлтый коридор; декларант', () => {
    const stages: CaseStages = {
      status: 3, currentStep: 3, nowUtc: '2026-10-16T12:00:00Z',
      steps: [
        stepOf(1, { state: 'done', history: [ev('submitted', local(14, 11, 5), 1)] }),
        stepOf(2, { state: 'done', history: [ev('borderPassed', local(15, 14, 20), 2)] }),
        stepOf(3, { state: 'current', responsibleName: 'Айгерим К.', history: [ev('dtSubmitted', local(16, 10, 25), 3), ev('customsRequest', local(16, 11, 48), 3, 'Договор поставки с допсоглашением № 2')] }),
        stepOf(4), stepOf(5), stepOf(6),
      ],
    }
    const w = mountWith({ status: 3, step: 3 }, {
      stages, docsCount: 6,
      kase: { post: 'Хоргос', assignedDeclarantName: 'Айгерим К.', declarations: [declaration({ corridor: 'yellow' })] },
    })
    expect(card(w, 1).get('[data-step-sub]').text()).toBe('Документы приняты')
    expect(card(w, 1).get('[data-step-note]').text()).toBe('14.10 в 11:05 · 6 файлов')
    expect(card(w, 2).get('[data-step-sub]').text()).toBe('Граница пройдена')
    expect(card(w, 2).get('[data-step-note]').text()).toBe('15.10 в 14:20 · Хоргос')
    expect(card(w, 3).get('[data-step-sub]').text()).toBe('ДТ подана · жёлтый коридор')
    expect(card(w, 3).get('[data-step-who]').text()).toContain('Декларант Айгерим К.')
    expect(card(w, 3).find('[data-step-timing]').exists()).toBe(false)
    expect(card(w, 4).get('[data-step-sub]').text()).toBe('После выпуска склад снимает груз с учёта и выставляет счёт')
    // История текущего шага открыта по умолчанию: подэтапы и события, клиентские формулировки.
    const detail = w.get('[data-stage-detail]')
    expect(detail.attributes('data-detail-step')).toBe('3')
    expect(detail.findAll('[data-sub]').map((s) => s.attributes('data-sub-state'))).toEqual(['done', 'done', 'current', 'todo'])
    const events = detail.findAll('[data-history-event]')
    expect(events.map((e) => e.attributes('data-kind'))).toEqual(['customsRequest', 'dtSubmitted'])
    expect(events[0]!.text()).toContain('Запрос таможни')
    expect(events[0]!.text()).toContain('Договор поставки')
  })

  it('нажатие на шаг — его история; повторное — скрывает', async () => {
    const w = mountWith({ status: 2, step: 3 })
    await card(w, 1).get('button[data-stage-card]').trigger('click')
    expect(w.get('[data-stage-detail]').attributes('data-detail-step')).toBe('1')
    expect(w.get('[data-history-empty]').text()).toContain('Событий по шагу пока нет')
    expect(card(w, 1).get('button').attributes('aria-expanded')).toBe('true')
    await card(w, 1).get('button[data-stage-card]').trigger('click')
    expect(w.find('[data-stage-detail]').exists()).toBe(false)
  })

  it('оплаченный счёт брокера — шаг 6 пройден, пока склад ещё не оплачен', () => {
    const paid: Import40CaseInvoiceDto = { id: 'i1', kind: 'invoice', status: 2, number: '154', year: 2026, total: 240000, issuedAtUtc: null, paidAtUtc: '2026-10-14T06:00:00Z' }
    const w = mountWith({ status: 6, step: 5, paymentCheckUploaded: true }, { invoices: [paid] })
    expect(card(w, 6).get('[data-step-sub]').text()).toBe('Счёт № 154 оплачен 14.10')
    expect(card(w, 5).get('[data-step-sub]').text()).toBe('Чек на проверке')
  })

  it('выполнена — все пройдены; отменена — все впереди, без «сейчас»', () => {
    expect(statesOf(mountWith({ status: 8, step: 0 }))).toEqual(Array(6).fill('done'))
    const cancelled = mountWith({ status: 9, step: 0 })
    expect(statesOf(cancelled)).toEqual(Array(6).fill('todo'))
    expect(cancelled.find('[data-step-now]').exists()).toBe(false)
    expect(cancelled.find('[data-stage-detail]').exists()).toBe(false)
  })
})
