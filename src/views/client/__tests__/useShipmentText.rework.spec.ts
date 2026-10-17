import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientShipment } from '@/api/clientShipments'
import { useShipmentText } from '../useShipmentText'

// Строка «Нужно от вас» возврата по чек-листу (17.10): комментарий сотрудника, иначе — пункты на языке клиента.
const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 's1', number: 'ИМ-2026-0182', cargo: 'Ноутбуки', post: 'Хоргос', status: 0, step: 1, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: 'CN', estimatedValue: null, currencyCode: 'USD',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null,
  createdAtUtc: '2026-10-01T10:00:00Z', updatedAtUtc: '2026-10-01T10:00:00Z', ...o,
})

const askTextOf = (s: ClientShipment) => {
  let out = ''
  mountWithI18n(defineComponent({ setup() { out = useShipmentText().askText(s); return () => h('div') } }))
  return out
}

describe('useShipmentText: возврат по чек-листу', () => {
  it('без комментария — пункты по видам и документам', () => {
    expect(askTextOf(ship({
      reworkRequested: true,
      reworkOpen: [{ kind: 'invoice', title: '', docKey: null }, { kind: 'certificate', title: '', docKey: 'phyto' }, { kind: 'other', title: 'Письмо', docKey: null }],
    }))).toBe('Догрузите: Инвойс (коммерческий счёт), Фитосанитарный сертификат, Письмо')
  })
  it('всё загружено — «отправьте заявку снова»; комментарий — как есть', () => {
    expect(askTextOf(ship({ reworkRequested: true, reworkOpen: [] }))).toBe('Документы загружены — отправьте заявку снова')
    expect(askTextOf(ship({ reworkRequested: true, returnReason: 'Проверьте вес' }))).toBe('Проверьте вес')
  })
})
