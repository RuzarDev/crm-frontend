import type { ReestrEntry, ReestrGoodsItemInput } from '@/types/api'
import { ReestrEntryStatus } from '@/types/api'

export const good = (o: Partial<ReestrGoodsItemInput> = {}): ReestrGoodsItemInput => ({
  description: null, tnvedCode: null, tnvedDescription: null, countryOfOrigin: null, quantity: null, unit: null, unitCode: null,
  grossWeightKg: null, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: null, currency: null, ...o,
})

/** Полная запись: все 11 коллекций, цены импорта, «Пост», пломба, вид упаковки, лишний ключ data — поля инцидента 08.10. */
export const fullEntry = (o: Partial<ReestrEntry> = {}): ReestrEntry => ({
  id: 'r1',
  createdAtUtc: '2026-10-01T08:00:00Z',
  status: ReestrEntryStatus.Submitted,
  clientId: 'c1',
  sourceConsolidationId: null,
  data: {
    '№': '2026-0030',
    'Дата': '2026-09-28',
    'Контейнер': 'DRYU9953726',
    'Получатель': 'ТОО «Казахмыс Трейд»',
    'Станция назначения': 'Сарыагаш',
    'Пост': '57507 — ТП «Сарыагаш»',
    'Отправитель': 'Lenovo Ltd',
    'Отправка': 'ЖД',
    'Груз': 'Ноутбуки',
    'Подкод': '01',
    'Код ТНВЭД': '8471300000',
    'Количество мест': '36',
    'Вес': '570.5',
    'ТД': '56000/221',
    'Кол-во ТД': '1',
    'Количество доп.листов': '2',
    '№ Пломбы': 'SL-123',
    'Вид упаковки': 'Коробки',
    'Старая колонка': 'не показывается, но не теряется',
  },
  grandTotalWithVat: 45000,
  pricePerDeclarationWithVat: 30000,
  pricePerSupplementalSheetWithVat: 7500,
  supplementalSheetsTotalWithVat: 15000,
  deprecationWarning: null,
  goods: [
    good({ tnvedCode: '8471300000', description: 'Ноутбуки', packagesCount: 12, grossWeightKg: 420.5, customsValue: 25000, currency: 'USD' }),
    good({ tnvedCode: '8473302008', description: 'Блоки питания', packagesCount: 24, grossWeightKg: 150, customsValue: 2700, currency: 'USD' }),
  ],
  doc44: [
    { docTypeCode: '04021', docTypeName: 'Инвойс', docNumber: 'LNV-1', docDate: '2026-09-12', authorizedBody: 'Орган', authorizedBodyId: 'ORG-7', formBlankNumber: 'BL-55' },
  ],
  transit: {
    purposeCode: '06', departureCustomsOffice: '57507', entryMethodCode: 'RW', movementDirectionCode: 'ПИ', usedAsDeclarationCode: 'СД',
    goodsQuantity: 2, cargoPlacesCount: 36, departureCountryCode: '156', destinationCountryCode: '398', grossWeightKg: 570.5,
    totalValue: 27700, docCurrencyCode: 'USD', transportDocTypeCode: '02015', transportDocNumber: 'A 0045871', transportDocDate: '2026-09-28',
    isMultimodal: true, transportModeCode: '20', loadingCountryCode: '156', loadingRailStation: 'Хоргос', unloadingCountryCode: '398',
    unloadingRailStation: 'Сарыагаш', destinationCustomsOffice: 'UZ001', packagingInfoCode: '1', tempStoragePlace: 'СВХ-1',
    destinationPlace: 'Ташкент', submitterType: 'ЮЛ', submitterBin: '123456789012', submitterName: 'ТОО Брокер',
  },
  organizations: [{ role: 'Декларант', subjectType: 'ЮЛ', bin: '123456789012', name: 'ТОО Брокер', shortName: 'Брокер', address: 'Алматы', phone: '+7', email: 'a@b.kz' }],
  carriers: [{ role: 'Перевозчик', subjectType: 'ЮЛ', bin: '987654321098', name: 'КТЖ', countryCode: '398', phone: null, email: null }],
  transportMeans: [{ transportModeCode: '20', purposeCode: '1', vehicleTypeCode: '200', wagonOrContainerNumber: '12345678', isEmpty: false, isWagonReturn: false, inContainer: true, matchesTransitVehicle: true }],
  identificationMeans: [{ noSeal: false, meansTypeCode: '1', quantity: 2, number: 'SL-123' }],
  packages: [{ packagingInfoKindCode: '0', packageTypeCode: 'CT', packageCount: 36, description: 'Коробки' }],
  containers: [{ containerNumber: 'DRYU9953726', note: '40HC' }],
  precedingDocs: [{ docTypeCode: '09013', number: 'PD-1', date: '2026-09-01' }],
  cargoOperations: [{ operationTypeCode: '1' }],
  guarantees: [{ guaranteeTypeCode: '01', amount: 1000, currencyCode: 'KZT', number: 'G-1' }],
  ...o,
})
