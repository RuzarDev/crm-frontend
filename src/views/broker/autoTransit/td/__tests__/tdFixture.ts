import type { DeclarationData, DeclarationResponse } from '@/api/autoTransit'
import { fullEntry, good } from '@/views/broker/transit/record/__tests__/recordFixture'

// Ответ GET/PUT …/declaration для спек ТД (контракт — план 2026-11-17, «Контракт API»).
export const fullData = (o: Partial<DeclarationData> = {}): DeclarationData => {
  const e = fullEntry()
  return {
    sealNumber: 'SL-123',
    packagingType: null,
    transit: { ...e.transit!, entryMethodCode: 'AU', transportModeCode: '31', loadingRailStation: null, unloadingRailStation: null },
    goods: e.goods!,
    doc44: e.doc44!,
    organizations: e.organizations!,
    carriers: e.carriers!,
    transportMeans: e.transportMeans!,
    identificationMeans: e.identificationMeans!,
    packages: e.packages!,
    containers: [],
    precedingDocs: e.precedingDocs!,
    cargoOperations: e.cargoOperations!,
    guarantees: e.guarantees!,
    ...o,
  }
}

/** n товаров с дробными брутто и стоимостью (точность decimal 18,4). */
export const manyGoods = (n: number) => Array.from({ length: n }, (_, i) => good({
  tnvedCode: String(8471300000 + i), description: `Товар ${i + 1}`, packagesCount: i + 1, quantity: i + 1,
  grossWeightKg: 10.1234 + i, customsValue: 1234.5678 + i, currency: 'USD',
}))

export const response = (o: Partial<DeclarationResponse> = {}): DeclarationResponse => ({
  isDraft: false,
  readOnly: false,
  version: 7,
  data: fullData(),
  missing: [],
  updatedAtUtc: '2026-11-17T08:00:00Z',
  updatedBy: 'Несибели',
  truck: { id: 't1', plate: '123ASD12', trailerPlate: '12DS12' },
  party: { id: 'p1', number: 1, recipientName: 'ТОО «Получатель 1»', submitted: false },
  ...o,
})

export const httpError = (status: number, data?: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
