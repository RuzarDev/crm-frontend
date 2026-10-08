import type {
  DocumentPackageClientConsolidationDto,
  DocumentPackageContainerDto,
  DocumentPackageDto,
  DocumentPackageFileDto,
} from '@/types/api'

/** transitDataJson полной партии: все 28 скаляров и 9 коллекций по строке. */
export const fullTransit = {
  purposeCode: '06', departureCustomsOffice: '57507', entryMethodCode: 'RW', movementDirectionCode: 'ПИ', usedAsDeclarationCode: 'СД',
  goodsQuantity: 2, cargoPlacesCount: 36, departureCountryCode: '156', destinationCountryCode: '398', grossWeightKg: 570.5,
  totalValue: 27700, docCurrencyCode: 'USD', transportDocTypeCode: '02015', transportDocNumber: 'A 0045871', transportDocDate: '2026-09-28',
  isMultimodal: true, transportModeCode: '20', loadingCountryCode: '156', loadingRailStation: 'Хоргос', unloadingCountryCode: '398',
  unloadingRailStation: 'Сарыагаш', destinationCustomsOffice: 'UZ001', packagingInfoCode: '1', tempStoragePlace: 'СВХ-1',
  destinationPlace: 'Ташкент', submitterType: 'ЮЛ', submitterBin: '123456789012', submitterName: 'ТОО Брокер',
  organizations: [{ role: 'Декларант', subjectType: 'ЮЛ', bin: '123456789012', name: 'ТОО Брокер', shortName: 'Брокер', address: 'Алматы', phone: '+7', email: 'a@b.kz' }],
  carriers: [{ role: 'Перевозчик', subjectType: 'ЮЛ', bin: '987654321098', name: 'КТЖ', countryCode: '398', phone: null, email: null }],
  transportMeans: [{ transportModeCode: '20', purposeCode: '1', vehicleTypeCode: '200', wagonOrContainerNumber: '12345678', isEmpty: false, isWagonReturn: false, inContainer: true, matchesTransitVehicle: true }],
  identificationMeans: [{ noSeal: false, meansTypeCode: '1', quantity: 2, number: 'SL-123' }],
  packages: [{ packagingInfoKindCode: '0', packageTypeCode: 'CT', packageCount: 36, description: 'Коробки' }],
  containers: [{ containerNumber: 'MRSU4885849', note: '40HC' }],
  precedingDocs: [{ docTypeCode: '09013', number: 'PD-1', date: '2026-09-01' }],
  cargoOperations: [{ operationTypeCode: '1' }],
  guarantees: [{ guaranteeTypeCode: '01', amount: 1000, currencyCode: 'KZT', number: 'G-1' }],
}

/** Полная партия: все поля DTO заполнены, включая таможню назначения, коды стран, адреса и transit-коллекции. */
export const fullPartia = (o: Partial<DocumentPackageClientConsolidationDto> = {}): DocumentPackageClientConsolidationDto => ({
  id: 'p1',
  containerId: 'c1',
  clientName: 'kazakhmys',
  destinationStation: 'Сарыагаш',
  destinationCustomsAuthority: 'ТП «Сарыагаш»',
  sealNumber: 'SL-123',
  shipper: { name: 'Lenovo Ltd', countryCode: 'CN', region: 'Guangdong', city: 'Shenzhen', street: 'Nanshan 1' },
  consignee: { name: 'ТОО «Казахмыс Трейд»', countryCode: 'KZ', region: 'Алматинская', city: 'Алматы', street: 'Абая 12, оф. 305' },
  goodsItems: [
    {
      id: 'g1', sortOrder: 0, description: 'Ноутбуки', tnvedCode: '8471300000', tnvedDescription: 'Машины', countryOfOrigin: 'CN',
      quantity: 120, unit: 'шт', unitCode: '796', grossWeightKg: 420.5, netWeightKg: 400, packagesCount: 12, quantityTypeCode: '1',
      customsValue: 25000, currency: 'USD',
    },
    {
      id: 'g2', sortOrder: 1, description: 'Блоки питания', tnvedCode: '8504403009', tnvedDescription: null, countryOfOrigin: 'CN',
      quantity: 240, unit: 'шт', unitCode: '796', grossWeightKg: 150, netWeightKg: 140, packagesCount: 24, quantityTypeCode: null,
      customsValue: 2700, currency: 'USD',
    },
  ],
  doc44Items: [{ id: 'd1', sortOrder: 0, docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'LNV-1', docDate: '2026-09-12' }],
  transitDataJson: JSON.stringify(fullTransit),
  ...o,
})

export const file = (o: Partial<DocumentPackageFileDto> = {}): DocumentPackageFileDto => ({
  id: 'f1',
  packageId: 'pkg1',
  containerId: null,
  clientConsolidationId: null,
  documentType: null,
  originalFileName: 'scan.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1000,
  uploadedByUserId: 'u1',
  uploadedAtUtc: '2026-10-08T09:14:00Z',
  ...o,
})

export const container = (o: Partial<DocumentPackageContainerDto> = {}): DocumentPackageContainerDto => ({
  id: 'c1',
  packageId: 'pkg1',
  containerNumber: 'MRSU4885849',
  secondaryContainerNumber: null,
  consolidations: [fullPartia()],
  ...o,
})

/**
 * Пакет: контейнер c1 с партией p1, пустой контейнер c2 и файлы всех уровней:
 * f-free — свободный, f-rail — ЖД накладная c1, f-inv — инвойс партии p1 (контейнер не указан, как при загрузке из формы),
 * f-tsd — ТСД партии p1 с контейнером.
 */
export const pkg = (o: Partial<DocumentPackageDto> = {}): DocumentPackageDto => ({
  id: 'pkg1',
  trainNumber: '1234',
  comment: null,
  status: 'uploaded',
  createdByExpeditorId: 'e1',
  createdByExpeditorUsername: 'expeditor',
  createdAtUtc: '2026-10-08T09:14:00Z',
  updatedAtUtc: '2026-10-08T09:14:00Z',
  reviewedByUserId: null,
  reviewedAtUtc: null,
  reviewComment: null,
  files: [
    file({ id: 'f-free', originalFileName: 'free.pdf' }),
    file({ id: 'f-rail', containerId: 'c1', originalFileName: 'rail.pdf' }),
    file({ id: 'f-inv', clientConsolidationId: 'p1', documentType: 'invoice', originalFileName: 'invoice.pdf' }),
    file({ id: 'f-tsd', containerId: 'c1', clientConsolidationId: 'p1', originalFileName: 'tsd.pdf' }),
  ],
  containers: [container(), container({ id: 'c2', containerNumber: 'TCLU 1234567', secondaryContainerNumber: 'CN-77', consolidations: [] })],
  ...o,
})
