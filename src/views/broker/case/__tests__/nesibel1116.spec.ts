// Правки декларанта 12–13.11.2026 (разбор 16.11): гр.2 — отправитель по CMR, недостающее — из инвойса той же компании
import { describe, expect, it } from 'vitest'
import type { Import40ExtractionPartySource } from '@/api/import40'
import { completeFromSameCompany, onBehalfSender } from '../steps/documentsImport'

const src = (name: string, docType: string, address: string | null = null): Import40ExtractionPartySource =>
  ({ name, address, docType, fileName: `${docType}.pdf` })

describe('гр.2: CMR без полного наименования и адреса', () => {
  it('название и адрес — из инвойса той же компании', () => {
    const cmr = src('SHANGHAI RUIAOJIA MEDICAL TECHNOLOGY', 'transport')
    const inv = src('SHANGHAI RUIAOJIA MEDICAL TECHNOLOGY CO.,LTD.', 'invoice_packing', 'Room2201J, No.888, South moyu Road, Jiading')
    expect(completeFromSameCompany(cmr, [cmr, inv])).toMatchObject({
      name: 'SHANGHAI RUIAOJIA MEDICAL TECHNOLOGY CO.,LTD.', address: 'Room2201J, No.888, South moyu Road, Jiading', docType: 'transport',
    })
  })

  it('чужая компания (продавец вместо экспедитора) не подставляется; свой адрес CMR не заменяется', () => {
    const cmr = src('SICHUAN NORASDA INTERNATIONAL FORWARDING CO., LTD', 'transport', 'Chengdu')
    const seller = src('XINGJIANG SCULPTOR NEW TYPE BUILDING MATERIALS CO., LTD.', 'invoice_packing', 'Urumqi')
    expect(completeFromSameCompany(cmr, [cmr, seller])).toBe(cmr)
    const r = onBehalfSender([cmr, seller], seller.name)
    expect(r?.consignor.name).toBe(cmr.name)
    expect(r?.seller).toBe(seller.name)
  })
})
