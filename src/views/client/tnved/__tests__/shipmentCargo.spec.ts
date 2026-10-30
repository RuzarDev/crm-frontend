import { describe, expect, it } from 'vitest'
import { SHIPMENT_CARGO_MAX, shipmentCargo } from '../tnved'

// 30.10.2026, аудит C-14: описание груза для мастера из «Подбора кода ТН ВЭД».
describe('shipmentCargo', () => {
  it('текст запроса клиента + код; запрос-код — название позиции', () => {
    expect(shipmentCargo('кофе  в зёрнах', 'Кофе нежареный', '0901110000')).toBe('кофе в зёрнах (ТН ВЭД 0901 11 000 0)')
    expect(shipmentCargo('0901', 'Кофе нежареный', '0901110000')).toBe('Кофе нежареный (ТН ВЭД 0901 11 000 0)')
    expect(shipmentCargo('', '', '0901110000')).toBe('ТН ВЭД 0901 11 000 0')
    expect(shipmentCargo('чай', '', '')).toBe('чай')
  })
  it('длинное название обрезается с «…», код остаётся целиком', () => {
    const out = shipmentCargo('', 'а'.repeat(1000), '0901110000')
    expect(out.length).toBe(SHIPMENT_CARGO_MAX)
    expect(out.endsWith('… (ТН ВЭД 0901 11 000 0)')).toBe(true)
  })
})
