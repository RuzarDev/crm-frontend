import { describe, expect, it } from 'vitest'
import type { ReestrEntryDto, ReestrUpsertBody } from '@/types/api'
import { reestrDtoToEntry, reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'

// Полная запись, как её отдаёт GET /reestr/{id} (ReestrEntryMapper.ToDto) + sealNumber/packagingType.
const FULL_DTO: ReestrEntryDto = {
  id: 'r1',
  createdAtUtc: '2026-10-01T08:00:00Z',
  rowNumber: '2026-0031',
  documentDate: '2026-10-08T00:00:00Z',
  container: 'MRSU4885849',
  consignee: 'ТОО «Альфа»',
  destinationStation: 'Достык',
  customsPost: 'Т/П «Достык»',
  shipper: 'Shenzhen Ltd',
  shipmentInfo: 'отправка 12',
  cargoDescription: 'Ноутбуки',
  subcode: 'A1',
  commodityCode: '8471300000',
  packagesCount: 9,
  weightKg: 8529.5,
  customsDeclarationNumber: '56000/221',
  customsDeclarationCount: 1,
  pricePerDeclarationWithVat: 56000,
  supplementalSheetsCount: 3,
  pricePerSupplementalSheetWithVat: 10133.33,
  supplementalSheetsTotalWithVat: 30400,
  grandTotalWithVat: 86400,
  status: 'submitted',
  clientId: 'c1',
  sealNumber: 'ПЛ-778899',
  packagingType: 'паллеты',
  purposeCode: '06',
  departureCustomsOffice: 'Достык',
  entryMethodCode: 'RW',
  movementDirectionCode: 'ПИ',
  usedAsDeclarationCode: 'СД',
  goodsQuantity: 7,
  cargoPlacesCount: 11,
  departureCountryCode: '156',
  destinationCountryCode: '398',
  grossWeightKg: 9000,
  totalValue: 123456.78,
  docCurrencyCode: 'USD',
  transportDocTypeCode: '02013',
  transportDocNumber: 'СМГС-1',
  transportDocDate: '2026-10-02T00:00:00Z',
  isMultimodal: true,
  transportModeCode: '20',
  loadingCountryCode: '156',
  loadingRailStation: 'Алашанькоу',
  unloadingCountryCode: '398',
  unloadingRailStation: 'Алматы-1',
  destinationCustomsOffice: '55204',
  packagingInfoCode: '1',
  tempStoragePlace: 'СВХ-1',
  destinationPlace: 'Алматы',
  submitterType: 'ЮЛ',
  submitterBin: '123456789012',
  submitterName: 'ТОО «Брокер»',
  goodsItems: [{
    id: 'g1', sortOrder: 0, description: 'Ноутбук', tnvedCode: '8471300000', tnvedDescription: 'Машины', countryOfOrigin: '156',
    quantity: 100, unit: 'шт', unitCode: '796', grossWeightKg: 500, netWeightKg: 450, packagesCount: 9,
    quantityTypeCode: 'РК', customsValue: 70000, currency: 'USD',
  }],
  doc44Items: [{
    id: 'd1', sortOrder: 0, docTypeCode: '01191', docTypeName: 'Сертификат', docNumber: 'EAЭС-1', docDate: '2026-09-30T00:00:00Z',
    authorizedBody: 'Орган по сертификации', authorizedBodyId: 'KZ.1234', formBlankNumber: '0012345',
  }],
  organizations: [{ id: 'o1', sortOrder: 0, role: 'Декларант', subjectType: 'ЮЛ', bin: '123456789012', name: 'ТОО «Альфа»', shortName: 'Альфа', address: 'Алматы', phone: '+7', email: 'a@a.kz' }],
  carriers: [{ id: 'k1', sortOrder: 0, role: 'Перевозчик', subjectType: 'ЮЛ', bin: '987654321098', name: 'КТЖ', countryCode: '398', phone: '+7', email: 'k@k.kz' }],
  transportMeans: [{ id: 't1', sortOrder: 0, transportModeCode: '20', purposeCode: '1', vehicleTypeCode: '30', wagonOrContainerNumber: '12345678', isEmpty: false, isWagonReturn: true, inContainer: true, matchesTransitVehicle: false }],
  identificationMeans: [{ id: 'i1', sortOrder: 0, noSeal: false, meansTypeCode: '10', quantity: 2, number: 'ПЛ-1' }],
  packages: [{ id: 'p1', sortOrder: 0, packagingInfoKindCode: '0', packageTypeCode: 'PX', packageCount: 9, description: 'паллеты' }],
  containers: [{ id: 'cn1', sortOrder: 0, containerNumber: 'MRSU4885849', note: '40HC' }],
  precedingDocs: [{ id: 'pd1', sortOrder: 0, docTypeCode: '09013', number: 'ПД-1', date: '2026-09-01T00:00:00Z' }],
  cargoOperations: [{ id: 'co1', sortOrder: 0, operationTypeCode: 'Перегрузка' }],
  guarantees: [{ id: 'gu1', sortOrder: 0, guaranteeTypeCode: 'Банковская гарантия', amount: 5000, currencyCode: 'KZT', number: 'Г-1' }],
}

// Все скалярные поля, которые сервер присваивает безусловно (ReestrEntryMapper.ApplyUpsert), кроме даты документа.
const SCALARS = [
  'rowNumber', 'container', 'consignee', 'destinationStation', 'customsPost', 'shipper', 'shipmentInfo', 'cargoDescription',
  'subcode', 'commodityCode', 'packagesCount', 'weightKg', 'customsDeclarationNumber', 'customsDeclarationCount',
  'pricePerDeclarationWithVat', 'supplementalSheetsCount', 'pricePerSupplementalSheetWithVat', 'supplementalSheetsTotalWithVat',
  'grandTotalWithVat', 'sealNumber', 'packagingType',
  'purposeCode', 'departureCustomsOffice', 'entryMethodCode', 'movementDirectionCode', 'usedAsDeclarationCode', 'goodsQuantity',
  'cargoPlacesCount', 'departureCountryCode', 'destinationCountryCode', 'grossWeightKg', 'totalValue', 'docCurrencyCode',
  'transportDocTypeCode', 'transportDocNumber', 'transportDocDate', 'isMultimodal', 'transportModeCode', 'loadingCountryCode',
  'loadingRailStation', 'unloadingCountryCode', 'unloadingRailStation', 'destinationCustomsOffice', 'packagingInfoCode',
  'tempStoragePlace', 'destinationPlace', 'submitterType', 'submitterBin', 'submitterName',
] as const

// Вложенные списки, которые сервер заменяет целиком (ApplyAllChildren): DTO-ключ → ключ тела.
const CHILDREN: [keyof ReestrEntryDto, keyof ReestrUpsertBody][] = [
  ['goodsItems', 'goodsItems'], ['doc44Items', 'doc44Items'], ['organizations', 'organizations'], ['carriers', 'carriers'],
  ['transportMeans', 'transportMeans'], ['identificationMeans', 'identificationMeans'], ['packages', 'packages'],
  ['containers', 'containers'], ['precedingDocs', 'precedingDocs'], ['cargoOperations', 'cargoOperations'], ['guarantees', 'guarantees'],
]
const stripIds = (list: unknown) => (list as Record<string, unknown>[]).map(({ id: _id, sortOrder: _s, ...rest }) => rest)

describe('reestrDtoMap: полная запись → тело обновления без потерь', () => {
  const body = reestrEntryToUpsertBody(reestrDtoToEntry(FULL_DTO))

  it('каждое скалярное поле, которое присваивает сервер, уходит со значением из записи', () => {
    for (const key of SCALARS) {
      expect(body[key], key).toEqual(FULL_DTO[key])
    }
    expect(body.documentDate).toBe('2026-10-08')
    expect(body.clientId).toBe('c1')
    expect(body.status).toBe(1)
  })

  it('«Пост», «№ Пломбы», «Вид упаковки» и цены импорта не теряются', () => {
    expect(body).toMatchObject({
      customsPost: 'Т/П «Достык»',
      sealNumber: 'ПЛ-778899',
      packagingType: 'паллеты',
      pricePerDeclarationWithVat: 56000,
      pricePerSupplementalSheetWithVat: 10133.33,
      supplementalSheetsTotalWithVat: 30400,
      grandTotalWithVat: 86400,
    })
  })

  it('все вложенные списки на месте, со всеми полями (в т.ч. гр.44: орган, ИД органа, бланк)', () => {
    for (const [dtoKey, bodyKey] of CHILDREN) {
      expect(body[bodyKey], bodyKey).toEqual(stripIds(FULL_DTO[dtoKey]))
    }
    expect(body.doc44Items![0]).toMatchObject({ authorizedBody: 'Орган по сертификации', authorizedBodyId: 'KZ.1234', formBlankNumber: '0012345' })
  })

  it('запись без цен и вложенных списков — null и пустые списки, а не undefined', () => {
    const bare = reestrEntryToUpsertBody(reestrDtoToEntry({
      ...FULL_DTO, pricePerDeclarationWithVat: null, pricePerSupplementalSheetWithVat: null, supplementalSheetsTotalWithVat: null,
      grandTotalWithVat: null, sealNumber: undefined, packagingType: undefined, doc44Items: [{ id: 'd', sortOrder: 0, docTypeCode: '1', docTypeName: null, docNumber: null, docDate: null }],
    }))
    expect(bare.pricePerDeclarationWithVat).toBeNull()
    expect(bare.grandTotalWithVat).toBeNull()
    expect(bare.sealNumber).toBeNull()
    expect(bare.doc44Items![0]).toMatchObject({ authorizedBody: null, authorizedBodyId: null, formBlankNumber: null })
  })
})
