import { describe, expect, it } from 'vitest'
import type { DeclarationData, DocumentsCheck, TruckFile } from '@/api/autoTransit'
import { good } from '@/views/broker/transit/record/__tests__/recordFixture'
import { dataToAuto, dataToDraft } from '../tdModel'
import { conflictKey, defaultSelected, documentsMismatch, fromDocsError, mergeFromDocuments, pickableFiles } from '../fromDocs'

// «Заполнить из документов» (очередь 3, спека 5.2): слияние с формой — пустое заполняется, заполненное не трогается.
const org = (role: string, o: Record<string, string | null> = {}) => ({
  role, subjectType: null, bin: null, name: null, shortName: null, address: null, phone: null, email: null, ...o,
})
const doc = (code: string, number: string | null, date: string | null = null) => ({ docTypeCode: code, docTypeName: null, docNumber: number, docDate: date })

describe('fromDocs: слияние', () => {
  const data = (): Partial<DeclarationData> => ({
    transit: { docCurrencyCode: 'USD', totalValue: 1000, cargoPlacesCount: 10, grossWeightKg: 500.5, goodsQuantity: 2 } as never,
    organizations: [org('Отправитель', { name: 'SHIPPER LTD', address: 'Urumqi' }), org('Получатель', { name: 'ТОО «Док»', bin: '123456789012', address: 'Алматы' })],
    goods: [good({ description: 'Из документа 1' }), good({ description: 'Из документа 2' })],
    vehicles: [
      { role: 'tractor', typeCode: '303', regNumber: 'A111AA', countryCode: null, vin: null, headIndex: null },
      { role: 'trailer', typeCode: '312', regNumber: 'B222BB', countryCode: null, vin: null, headIndex: 0 },
    ],
    doc44: [doc('04021', 'INV-1', '2026-11-20T00:00:00'), doc('02015', 'CMR-9')],
  })

  it('пустые поля заполняются, заполненные не трогаются', () => {
    const draft = dataToDraft({
      transit: { docCurrencyCode: 'EUR', totalValue: null } as never,
      organizations: [org('Получатель', { name: 'ТОО «Своё»', bin: null })],
      doc44: [doc('04021', null), doc('02015', 'CMR-OLD')],
    })
    const auto = dataToAuto({ vehicles: [{ role: 'tractor', typeCode: '303', regNumber: null, countryCode: 'KZ', vin: '-', headIndex: null }] })
    const out = mergeFromDocuments(draft, auto, data(), 'add')
    expect(out.draft.transit.docCurrencyCode).toBe('EUR')
    expect(out.draft.transit.totalValue).toBe(1000)
    expect(out.draft.organizations).toEqual([
      org('Получатель', { name: 'ТОО «Своё»', bin: '123456789012', address: 'Алматы' }),
      org('Отправитель', { name: 'SHIPPER LTD', address: 'Urumqi' }),
    ])
    // Строка инвойса шаблона без номера заполнилась; CMR с другим номером — не тронут, документа добавлен рядом.
    expect(out.draft.doc44.map((d) => [d.docTypeCode, d.docNumber, d.docDate])).toEqual([
      ['04021', 'INV-1', '2026-11-20T00:00:00'], ['02015', 'CMR-OLD', null], ['02015', 'CMR-9', null],
    ])
    // Тягач: госномер заполнен, страна осталась; прицепа не было — добавлен со ссылкой на тягач.
    expect(out.auto.vehicles).toEqual([
      { role: 'tractor', typeCode: '303', regNumber: 'A111AA', countryCode: 'KZ', vin: '-', headIndex: null },
      { role: 'trailer', typeCode: '312', regNumber: 'B222BB', countryCode: null, vin: null, headIndex: 0 },
    ])
    expect(out.draft.goods.map((g) => g.description)).toEqual(['Из документа 1', 'Из документа 2'])
    // Исходные не меняются.
    expect(draft.organizations).toHaveLength(1)
    expect(auto.vehicles[0]!.regNumber).toBeNull()
  })

  it('товары: «добавить» — в конец, итоги из документов при своих товарах не подставляются; «заменить» — целиком', () => {
    const draft = dataToDraft({ goods: [good({ description: 'Своё' })], transit: {} as never })
    const auto = dataToAuto(null)
    const added = mergeFromDocuments(draft, auto, data(), 'add')
    expect(added.draft.goods.map((g) => g.description)).toEqual(['Своё', 'Из документа 1', 'Из документа 2'])
    expect(added.draft.transit.grossWeightKg).toBeNull()
    expect(added.draft.transit.docCurrencyCode).toBe('USD')
    const replaced = mergeFromDocuments(draft, auto, data(), 'replace')
    expect(replaced.draft.goods.map((g) => g.description)).toEqual(['Из документа 1', 'Из документа 2'])
    expect(replaced.draft.transit.grossWeightKg).toBe(500.5)
  })

  it('нераспознанные разделы (null) ничего не меняют', () => {
    const draft = dataToDraft({ goods: [good({ description: 'Своё' })] })
    const out = mergeFromDocuments(draft, dataToAuto(null), { transit: null as never, goods: null as never, organizations: null as never, vehicles: null as never, doc44: null as never }, 'replace')
    expect(out.draft.goods.map((g) => g.description)).toEqual(['Своё'])
    expect(out.auto.vehicles).toEqual([])
  })
})

describe('fromDocs: сверка документов', () => {
  const check = (o: Partial<DocumentsCheck> = {}): DocumentsCheck => ({
    places: { cmr: 10, invoice: 10, packing: 10 }, grossKg: { cmr: 500, invoice: 500, packing: null }, plates: { cmr: 'A111AA / B222BB', invoice: null, packing: null }, ...o,
  })
  it('сходятся — пусто; расхождение точное (0,5 кг) и госномер без пробелов и регистра', () => {
    expect(documentsMismatch(check())).toEqual([])
    expect(documentsMismatch(check({ grossKg: { cmr: 19000, invoice: 19000.5, packing: null } }))).toEqual([
      { key: 'grossKg', cmr: 19000, invoice: 19000.5, packing: null },
    ])
    expect(documentsMismatch(check({ plates: { cmr: 'a111aa / b222bb', invoice: 'A 111 AA/B222BB', packing: 'A999' } }))).toEqual([
      { key: 'plates', cmr: 'a111aa / b222bb', invoice: 'A 111 AA/B222BB', packing: 'A999' },
    ])
    expect(documentsMismatch(null)).toEqual([])
  })
})

describe('fromDocs: выбор файлов и ошибки', () => {
  const f = (id: string, o: Partial<TruckFile> = {}): TruckFile => ({
    id, partyId: 'p1', kind: 'cmr', stamped: false, visibleToRecipient: false, fileName: `${id}.pdf`, sizeBytes: 1, uploadedBy: null, uploadedAtUtc: '', ...o,
  })
  it('файлы партии и общие машины, без возвращённых и чужих; по умолчанию — CMR, инвойс, упаковочный', () => {
    const files = [f('a'), f('b', { partyId: null, kind: 'invoice' }), f('c', { partyId: 'p2' }), f('d', { returned: true }), f('e', { kind: 'driverPassport', partyId: null }), f('g', { kind: 'packingList' })]
    const list = pickableFiles(files, 'p1')
    expect(list.map((x) => x.id)).toEqual(['a', 'g', 'b', 'e'])
    expect(defaultSelected(list)).toEqual(['a', 'g', 'b'])
  })
  it('ошибки: занят — минуты, велик — МБ, прочие — свои ключи', () => {
    expect(fromDocsError(Object.assign(new Error(), { response: { status: 503, data: { title: 'AiExtraction.Busy', retryAfterMin: 3 } } })))
      .toEqual({ key: 'busy', params: { min: 3 } })
    expect(fromDocsError(Object.assign(new Error(), { response: { status: 413, data: { limitMb: 60 } } }))).toEqual({ key: 'tooLarge', params: { mb: 60 } })
    expect(fromDocsError(Object.assign(new Error(), { response: { status: 502, data: {} } }))).toEqual({ key: 'service', params: {} })
    expect(fromDocsError(Object.assign(new Error(), { response: { status: 404, data: '' } }))).toEqual({ key: 'notFound', params: {} })
    expect(fromDocsError(Object.assign(new Error(), { response: { status: 400, data: { error: 'Среди выбранных нет документов', warnings: ['«p.jpg» пропущен.'] } } })))
      .toEqual({ key: 'invalid', params: {}, text: 'Среди выбранных нет документов', warnings: ['«p.jpg» пропущен.'] })
    expect(fromDocsError(new Error('net'))).toEqual({ key: 'network', params: {} })
  })
  it('ключ подписи расхождения', () => {
    expect(conflictKey('goods[2].grossWeightKg')).toEqual({ key: 'goodsItem', n: 3, field: 'grossWeightKg' })
    expect(conflictKey('doc44.invoice.number')).toEqual({ key: 'doc44_invoice_number' })
    expect(conflictKey('seller_inn')).toEqual({ key: 'seller_inn' })
  })
})
