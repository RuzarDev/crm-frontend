import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import type { ClientShipment } from '@/api/clientShipments'
import { askFor, segments, shipmentHref, shipmentTag, stepNo, tabCounts, tabOf } from '../shipment'

const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 's1', number: 'ИМ-2026-0182', cargo: 'Ноутбуки', post: 'Хоргос', status: 2, step: 3, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: 'CN', estimatedValue: null, currencyCode: 'USD',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null,
  createdAtUtc: '2026-10-01T10:00:00Z', updatedAtUtc: '2026-10-01T10:00:00Z', ...o,
})

describe('askFor / tabOf', () => {
  it.each([
    ['черновик', { status: 0, step: 1 }, 'draft', 'drafts'],
    ['возврат на доработку', { status: 0, step: 1, returnReason: 'Нет инвойса' }, 'returned', 'waiting'],
    ['черновик с проблемой', { status: 0, step: 1, isProblem: true }, 'problem', 'waiting'],
    ['граница', { status: 1, step: 2 }, null, 'active'],
    ['ДТ подана', { status: 3, step: 3 }, null, 'active'],
    ['ДТ подана, проблема', { status: 3, step: 3, isProblem: true }, 'problem', 'waiting'],
    ['счёт СВХ без чека', { status: 6, step: 5 }, 'paySvh', 'waiting'],
    ['счёт СВХ, чек загружен', { status: 6, step: 5, paymentCheckUploaded: true }, null, 'active'],
    ['оплата услуг', { status: 7, step: 6 }, null, 'active'],
    ['выполнена', { status: 8, step: 6, isProblem: true }, null, 'done'],
    ['отменена', { status: 9, step: 1, returnReason: 'x' }, null, 'done'],
  ] as const)('%s', (_, o, ask, tab) => {
    expect(askFor(ship(o))).toBe(ask)
    expect(tabOf(ship(o))).toBe(tab)
  })
})

describe('shipmentTag', () => {
  it.each([
    [{ status: 9 }, 'cancelled', 'neutral'],
    [{ status: 8 }, 'done', 'done'],
    [{ status: 3, isProblem: true }, 'needDoc', 'danger'],
    [{ status: 0, returnReason: 'Нет инвойса' }, 'returned', 'wait'],
    [{ status: 0 }, 'draft', 'neutral'],
    [{ status: 6 }, 'paySvh', 'wait'],
    [{ status: 6, paymentCheckUploaded: true }, 'checkReview', 'pay'],
    [{ status: 7 }, 'payService', 'pay'],
    [{ status: 4 }, 'released', 'done'],
    [{ status: 5 }, 'released', 'done'],
    [{ status: 1 }, 'inTransit', 'info'],
    [{ status: 2 }, 'processing', 'info'],
    [{ status: 3 }, 'processing', 'info'],
  ] as const)('%o → %s', (o, key, tone) => {
    expect(shipmentTag(ship(o))).toEqual({ key, tone })
  })

  it('каждый ключ тега и вопроса есть в ru/kk/en', () => {
    const keys = ['cancelled', 'done', 'needDoc', 'returned', 'draft', 'paySvh', 'checkReview', 'payService', 'released', 'inTransit', 'processing']
    for (const loc of [ru, kk, en]) {
      expect(Object.keys(loc.client.tag).sort()).toEqual([...keys].sort())
      for (const k of ['problem', 'returned', 'draft', 'paySvh'] as const) expect(loc.client.ask[k].title).toBeTruthy()
      expect(loc.client.ask.paySvh.text).toContain('{sum}')
    }
  })
})

describe('segments', () => {
  it('шаг 3 — два пройдены, третий текущий', () => {
    expect(segments(ship({ status: 2, step: 3 }))).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo'])
  })
  it('статус 6 без чека — пятый за клиентом', () => {
    expect(segments(ship({ status: 6, step: 5 }))[4]).toBe('currentAsk')
  })
  it('проблема на шаге 2 — второй красный', () => {
    expect(segments(ship({ status: 1, step: 2, isProblem: true }))).toEqual(['done', 'currentProblem', 'todo', 'todo', 'todo', 'todo'])
  })
  it('черновик без шага — первый за клиентом', () => {
    expect(segments(ship({ status: 0, step: 0 }))).toEqual(['currentAsk', 'todo', 'todo', 'todo', 'todo', 'todo'])
  })
  it('выполнена — все пройдены', () => {
    expect(segments(ship({ status: 8, step: 6 }))).toEqual(Array(6).fill('done'))
  })
})

describe('tabCounts', () => {
  it('раскладывает по вкладкам', () => {
    expect(tabCounts([
      ship({ status: 0 }),
      ship({ status: 0, returnReason: 'r' }),
      ship({ status: 6 }),
      ship({ status: 2 }),
      ship({ status: 7 }),
      ship({ status: 8 }),
      ship({ status: 9 }),
    ])).toEqual({ active: 2, waiting: 2, drafts: 1, done: 2 })
    expect(tabCounts([])).toEqual({ active: 0, waiting: 0, drafts: 0, done: 0 })
  })
})

describe('stepNo / shipmentHref', () => {
  it('этап зажат в 1..6', () => {
    expect(stepNo(ship({ step: 0 }))).toBe(1)
    expect(stepNo(ship({ step: 4 }))).toBe(4)
    expect(stepNo(ship({ step: 7 }))).toBe(6)
  })
  it('черновик — в мастер, остальное — карточка', () => {
    expect(shipmentHref(ship({ id: 'd', status: 0 }))).toBe('/import-40/new/d')
    expect(shipmentHref(ship({ id: 'r', status: 0, returnReason: 'r' }))).toBe('/import-40/r')
    expect(shipmentHref(ship({ id: 'a', status: 3 }))).toBe('/import-40/a')
  })
})
