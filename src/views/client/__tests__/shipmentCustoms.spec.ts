import { describe, expect, it } from 'vitest'
import type { ClientShipment } from '@/api/clientShipments'
import type { CustomsRequestDto } from '@/api/customsRequests'
import { clientAsks } from '@/views/home/clientHome'
import { askFor, segments, shipmentTag, tabOf, toShipmentSummary } from '../shipment'
import { caseDto } from './caseFixture'

// Запрос таможни у клиента (волна 17.10, задача 5): «Нужно от вас» в списке, теге, полосе и на «Главной».
const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 's1', number: 'ИМ-2026-0182', cargo: 'Ноутбуки', post: 'Хоргос', status: 3, step: 3, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: 'CN', estimatedValue: null, currencyCode: 'USD',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 1, assignedDeclarantName: null,
  createdAtUtc: '2026-10-01T10:00:00Z', updatedAtUtc: '2026-10-01T10:00:00Z', ...o,
})

describe('запрос таможни в правилах поставки', () => {
  it('ждёт ответа — ход клиента «customs» раньше проблемы; вкладка «Ждут вас», тег «Ответ таможне», полоса gold', () => {
    const s = ship({ customsRequestSinceUtc: '2026-10-17T08:00:00Z', isProblem: true })
    expect(askFor(s)).toBe('customs')
    expect(tabOf(s)).toBe('waiting')
    expect(shipmentTag(s)).toEqual({ key: 'customs', tone: 'wait' })
    expect(segments(ship({ customsRequestSinceUtc: '2026-10-17T08:00:00Z' }))[2]).toBe('currentAsk')
  })

  it('выполненная и отменённая не спрашивают; без запроса — как раньше', () => {
    expect(askFor(ship({ status: 8, customsRequestSinceUtc: '2026-10-17T08:00:00Z' }))).toBeNull()
    expect(askFor(ship({ customsRequestSinceUtc: null }))).toBeNull()
  })

  it('«Главная»: запрос таможни первым среди дел клиента', () => {
    const list = [
      ship({ id: 'pay', status: 6, step: 5, updatedAtUtc: '2026-10-17T09:00:00Z' }),
      ship({ id: 'cust', customsRequestSinceUtc: '2026-10-17T08:00:00Z', updatedAtUtc: '2026-10-01T00:00:00Z' }),
    ]
    expect(clientAsks(list).map((s) => s.id)).toEqual(['cust', 'pay'])
  })

  it('сводка карточки: самый ранний запрос без ответа', () => {
    const reqs = [
      { status: 'answered', createdAtUtc: '2026-10-15T00:00:00Z' },
      { status: 'open', createdAtUtc: '2026-10-17T08:00:00Z' },
      { status: 'open', createdAtUtc: '2026-10-16T08:00:00Z' },
    ] as Pick<CustomsRequestDto, 'status' | 'createdAtUtc'>[]
    expect(toShipmentSummary(caseDto({ status: 3 }), [], reqs).customsRequestSinceUtc).toBe('2026-10-16T08:00:00Z')
    expect(toShipmentSummary(caseDto({ status: 3 }), []).customsRequestSinceUtc).toBeNull()
  })
})
