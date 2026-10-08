import { describe, expect, it } from 'vitest'
import { ReestrEntryStatus, REESTR_COLUMN_KEYS, type ReestrTransitFields } from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS, reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'
import {
  DEPARTURE_OFFICE_MAX,
  SECTION_ORDER,
  TRANSIT_FIELD_SECTION,
  changedSections,
  draftFromEntry,
  draftToUpsertBody,
  goodsTotals,
  mergeDrafts,
  sectionCount,
  sectionState,
  validateDraft,
  type RecordDraft,
} from '../recordModel'
import { fullEntry, good } from './recordFixture'

const emptyDraft = (): RecordDraft => draftFromEntry(null)

describe('SECTION_ORDER', () => {
  it('порядок меню — как на доске', () => {
    expect(SECTION_ORDER).toEqual([
      'main', 'row', 'goods', 'doc44', 'organizations', 'carriers', 'transport',
      'seals', 'containers', 'packaging', 'preceding', 'guarantees', 'misc',
    ])
  })

  it('у каждого поля transit есть раздел', () => {
    const keys = Object.keys(REESTR_TRANSIT_DEFAULTS).sort()
    expect(Object.keys(TRANSIT_FIELD_SECTION).sort()).toEqual(keys)
    expect(TRANSIT_FIELD_SECTION.packagingInfoCode).toBe('packaging')
    expect(TRANSIT_FIELD_SECTION.submitterBin).toBe('misc')
    expect(TRANSIT_FIELD_SECTION.departureCustomsOffice).toBe('main')
    expect(TRANSIT_FIELD_SECTION.totalValue).toBe('main')
  })
})

describe('draftFromEntry', () => {
  it('новая запись — пустые поля строки и дефолты транзита', () => {
    const d = emptyDraft()
    expect(Object.keys(d.fields).sort()).toEqual([...REESTR_COLUMN_KEYS, 'Пост'].sort())
    expect(Object.values(d.fields).every((v) => v === null)).toBe(true)
    expect(d.sealNumber).toBeNull()
    expect(d.packagingType).toBeNull()
    expect(d.transit).toEqual(REESTR_TRANSIT_DEFAULTS)
    expect(d.transit).not.toBe(REESTR_TRANSIT_DEFAULTS)
    expect(d.goods).toEqual([])
    expect(d.guarantees).toEqual([])
  })

  it('берёт поля строки, «Пост», пломбу и вид упаковки из data; дата — ISO', () => {
    const d = draftFromEntry(fullEntry())
    expect(d.fields['Пост']).toBe('57507 — ТП «Сарыагаш»')
    expect(d.fields['Дата']).toBe('2026-09-28')
    expect(d.fields['Контейнер']).toBe('DRYU9953726')
    expect(d.fields['Старая колонка']).toBeUndefined()
    expect(d.sealNumber).toBe('SL-123')
    expect(d.packagingType).toBe('Коробки')
  })

  it('глубокая копия: правка черновика не меняет исходную запись', () => {
    const entry = fullEntry()
    const d = draftFromEntry(entry)
    d.goods[0].grossWeightKg = 1
    d.transit.purposeCode = 'XX'
    d.doc44[0].formBlankNumber = 'changed'
    d.organizations.push({ ...d.organizations[0] })
    d.fields['№'] = 'другой'
    expect(entry.goods[0].grossWeightKg).toBe(420.5)
    expect(entry.transit.purposeCode).toBe('06')
    expect(entry.doc44[0].formBlankNumber).toBe('BL-55')
    expect(entry.organizations).toHaveLength(1)
    expect(entry.data['№']).toBe('2026-0030')
  })
})

describe('draftToUpsertBody', () => {
  it('круговой путь без правок = тело исходной записи (цены, «Пост», пломба, гр.44, все 11 коллекций)', () => {
    const entry = fullEntry()
    const body = draftToUpsertBody(entry, draftFromEntry(entry), entry.clientId)
    expect(body).toEqual(reestrEntryToUpsertBody(entry))
    // поля инцидента 08.10 — явно
    expect(body.customsPost).toBe('57507 — ТП «Сарыагаш»')
    expect(body.sealNumber).toBe('SL-123')
    expect(body.packagingType).toBe('Коробки')
    expect(body.grandTotalWithVat).toBe(45000)
    expect(body.pricePerDeclarationWithVat).toBe(30000)
    expect(body.pricePerSupplementalSheetWithVat).toBe(7500)
    expect(body.supplementalSheetsTotalWithVat).toBe(15000)
    expect(body.doc44Items[0]).toMatchObject({ authorizedBody: 'Орган', authorizedBodyId: 'ORG-7', formBlankNumber: 'BL-55' })
    for (const k of ['goodsItems', 'doc44Items', 'organizations', 'carriers', 'transportMeans', 'identificationMeans',
      'packages', 'containers', 'precedingDocs', 'cargoOperations', 'guarantees'] as const) {
      expect(body[k], k).toHaveLength(1 + (k === 'goodsItems' ? 1 : 0))
    }
  })

  it('статус в теле — статус исходной записи; новая — «В работе»', () => {
    const entry = fullEntry({ status: ReestrEntryStatus.Released })
    expect(draftToUpsertBody(entry, draftFromEntry(entry), 'c1').status).toBe(ReestrEntryStatus.Released)
    expect(draftToUpsertBody(null, emptyDraft(), 'c9').status).toBe(ReestrEntryStatus.InProgress)
  })

  it('новая запись: клиент из аргумента, цены пустые, дефолты транзита', () => {
    const d = emptyDraft()
    d.fields['Контейнер'] = ' MSKU1234567 '
    const body = draftToUpsertBody(null, d, 'c9')
    expect(body.clientId).toBe('c9')
    expect(body.container).toBe('MSKU1234567')
    expect(body.grandTotalWithVat).toBeNull()
    expect(body.purposeCode).toBe('06')
    expect(body.goodsItems).toEqual([])
  })

  it('правка одного товара меняет в теле только его', () => {
    const entry = fullEntry()
    const d = draftFromEntry(entry)
    d.goods[1].grossWeightKg = 151
    const body = draftToUpsertBody(entry, d, entry.clientId)
    const orig = reestrEntryToUpsertBody(entry)
    expect(body.goodsItems[1].grossWeightKg).toBe(151)
    expect(body.goodsItems[0]).toEqual(orig.goodsItems[0])
    expect({ ...body, goodsItems: null }).toEqual({ ...orig, goodsItems: null })
  })

  it('поля строки нормализуются: дата ДД.ММ.ГГГГ → ISO, десятичная запятая → точка, пусто → null', () => {
    const entry = fullEntry()
    const d = draftFromEntry(entry)
    d.fields['Дата'] = '01.10.2026'
    d.fields['Вес'] = '1 200,5'
    d.fields['Подкод'] = '   '
    d.sealNumber = ''
    const body = draftToUpsertBody(entry, d, entry.clientId)
    expect(body.documentDate).toBe('2026-10-01')
    expect(body.weightKg).toBe(1200.5)
    expect(body.subcode).toBeNull()
    expect(body.sealNumber).toBeNull()
  })

  it('тело не держит ссылок на черновик', () => {
    const entry = fullEntry()
    const d = draftFromEntry(entry)
    const body = draftToUpsertBody(entry, d, entry.clientId)
    d.goods[0].tnvedCode = 'поменяли после'
    d.transit.purposeCode = 'ZZ'
    expect(body.goodsItems[0].tnvedCode).toBe('8471300000')
    expect(body.purposeCode).toBe('06')
  })
})

describe('validateDraft', () => {
  it.each(['№', 'Контейнер', 'Получатель', 'Отправитель', 'Груз'])('достаточно поля «%s»', (key) => {
    const d = emptyDraft()
    d.fields[key] = 'x'
    expect(validateDraft(d, { isNew: false, clientId: null })).toEqual([])
  })

  it('прочие поля строки не считаются (правило сервера IsMeaningfulRequest)', () => {
    const d = emptyDraft()
    d.fields['Подкод'] = '01'
    d.fields['ТД'] = '56000/221'
    d.fields['Груз'] = '   '
    expect(validateDraft(d, { isNew: false, clientId: 'c1' })).toEqual(['broker.transitRecord.errors.needKeyField'])
  })

  it('новая запись без клиента', () => {
    const d = emptyDraft()
    d.fields['№'] = '1'
    expect(validateDraft(d, { isNew: true, clientId: null })).toEqual(['broker.transitRecord.errors.needClient'])
    expect(validateDraft(d, { isNew: true, clientId: 'c1' })).toEqual([])
    expect(validateDraft(emptyDraft(), { isNew: true, clientId: '' })).toEqual([
      'broker.transitRecord.errors.needKeyField',
      'broker.transitRecord.errors.needClient',
    ])
  })

  it('таможня отправления без кода поста длиннее 32 знаков — сохранять нельзя (колонка сервера 32)', () => {
    const d = emptyDraft()
    d.fields['№'] = '1'
    d.transit.departureCustomsOffice = 'ТАМОЖЕННЫЙ ПОСТ «БЕЗ КОДА» С ОЧЕНЬ ДЛИННЫМ НАЗВАНИЕМ'
    expect(validateDraft(d, { isNew: false, clientId: 'c1' })).toEqual(['broker.transitRecord.errors.departureOfficeTooLong'])
    d.transit.departureCustomsOffice = 'Я'.repeat(DEPARTURE_OFFICE_MAX)
    expect(validateDraft(d, { isNew: false, clientId: 'c1' })).toEqual([])
    d.transit.departureCustomsOffice = '57507'
    expect(validateDraft(d, { isNew: false, clientId: 'c1' })).toEqual([])
    d.transit.departureCustomsOffice = null
    expect(validateDraft(d, { isNew: false, clientId: 'c1' })).toEqual([])
  })
})

describe('sectionState', () => {
  it('полная запись — все разделы «заполнен»', () => {
    const d = draftFromEntry(fullEntry())
    for (const key of SECTION_ORDER) expect(sectionState(key, d), key).toBe('done')
  })

  it('новая запись: «Основное» требует внимания (нет стран), остальное пусто', () => {
    const d = emptyDraft()
    expect(sectionState('main', d)).toBe('warn')
    for (const key of SECTION_ORDER.filter((k) => k !== 'main')) expect(sectionState(key, d), key).toBe('empty')
  })

  it('«Основное»: нет страны отправления или назначения — warn', () => {
    const d = draftFromEntry(fullEntry())
    d.transit.departureCountryCode = null
    expect(sectionState('main', d)).toBe('warn')
    d.transit.departureCountryCode = '156'
    d.transit.destinationCountryCode = ' '
    expect(sectionState('main', d)).toBe('warn')
  })

  it('«Основное»: совсем пусто — empty; «Пост» — данные «Основного»', () => {
    const d = emptyDraft()
    d.transit = Object.fromEntries(Object.keys(d.transit).map((k) => [k, k === 'isMultimodal' ? false : null])) as unknown as ReestrTransitFields
    expect(sectionState('main', d)).toBe('empty')
    d.fields['Пост'] = '57507'
    expect(sectionState('main', d)).toBe('warn')
    expect(sectionState('row', d)).toBe('empty')
  })

  it('«Строка реестра»: любое поле, пломба или вид упаковки', () => {
    const d = emptyDraft()
    d.sealNumber = 'SL'
    expect(sectionState('row', d)).toBe('done')
  })

  it('товары: без кода ТН ВЭД или без описания — warn', () => {
    const d = draftFromEntry(fullEntry())
    d.goods[1].tnvedCode = null
    expect(sectionState('goods', d)).toBe('warn')
    d.goods[1].tnvedCode = '8473302008'
    d.goods[1].description = ''
    expect(sectionState('goods', d)).toBe('warn')
    d.goods[1].tnvedDescription = 'Части машин'
    expect(sectionState('goods', d)).toBe('done')
  })

  it('организации: без названия или БИН/ИНН — warn', () => {
    const d = draftFromEntry(fullEntry())
    d.organizations[0].bin = null
    expect(sectionState('organizations', d)).toBe('warn')
    d.organizations[0].bin = '1'
    d.organizations[0].name = ' '
    expect(sectionState('organizations', d)).toBe('warn')
  })

  it('перевозчики: без названия — warn', () => {
    const d = draftFromEntry(fullEntry())
    d.carriers[0].name = null
    expect(sectionState('carriers', d)).toBe('warn')
  })

  it('гр.44: без кода вида или номера — warn', () => {
    const d = draftFromEntry(fullEntry())
    d.doc44[0].docNumber = null
    expect(sectionState('doc44', d)).toBe('warn')
    d.doc44[0].docNumber = 'N'
    d.doc44[0].docTypeCode = ''
    expect(sectionState('doc44', d)).toBe('warn')
  })

  it('добавленная пустая строка — данных нет', () => {
    const d = emptyDraft()
    d.containers.push({ containerNumber: null, note: '' })
    d.transportMeans.push({ transportModeCode: null, purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: null, isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false })
    expect(sectionState('containers', d)).toBe('empty')
    expect(sectionState('transport', d)).toBe('empty')
    d.identificationMeans.push({ noSeal: true, meansTypeCode: null, quantity: null, number: null })
    expect(sectionState('seals', d)).toBe('done')
  })

  it('упаковка — скаляр или строки; прочее — поля или грузовые операции', () => {
    const d = emptyDraft()
    d.transit.packagingInfoCode = '1'
    expect(sectionState('packaging', d)).toBe('done')
    d.cargoOperations.push({ operationTypeCode: '1' })
    expect(sectionState('misc', d)).toBe('done')
  })
})

describe('sectionCount', () => {
  it('длина коллекции; у «Основного», «Строки», «Прочего» — null', () => {
    const d = draftFromEntry(fullEntry())
    expect(sectionCount('goods', d)).toBe(2)
    expect(sectionCount('doc44', d)).toBe(1)
    expect(sectionCount('transport', d)).toBe(1)
    expect(sectionCount('seals', d)).toBe(1)
    expect(sectionCount('packaging', d)).toBe(1)
    expect(sectionCount('preceding', d)).toBe(1)
    expect(sectionCount('guarantees', d)).toBe(1)
    expect(sectionCount('main', d)).toBeNull()
    expect(sectionCount('row', d)).toBeNull()
    expect(sectionCount('misc', d)).toBeNull()
    expect(sectionCount('containers', emptyDraft())).toBe(0)
  })
})

describe('changedSections', () => {
  it('без правок — пусто', () => {
    expect(changedSections(draftFromEntry(fullEntry()), draftFromEntry(fullEntry()))).toEqual([])
  })

  it('правки раскладываются по разделам в порядке меню', () => {
    const a = draftFromEntry(fullEntry())
    const b = draftFromEntry(fullEntry())
    b.guarantees[0].amount = 5
    b.fields['Груз'] = 'другой'
    b.transit.submitterName = 'Иной'
    b.goods.pop()
    b.transit.packagingInfoCode = '2'
    b.identificationMeans = []
    expect(changedSections(a, b)).toEqual(['row', 'goods', 'seals', 'packaging', 'guarantees', 'misc'])
  })

  it('«Пост» → «Основное»; пломба и вид упаковки → «Строка реестра»; поля transit — по таблице', () => {
    const a = emptyDraft()
    const b = emptyDraft()
    b.fields['Пост'] = '57507'
    expect(changedSections(a, b)).toEqual(['main'])
    const c = emptyDraft()
    c.packagingType = 'Мешки'
    expect(changedSections(a, c)).toEqual(['row'])
    const e = emptyDraft()
    e.transit.isMultimodal = true
    e.transit.tempStoragePlace = 'СВХ'
    expect(changedSections(a, e)).toEqual(['main', 'misc'])
    const f = emptyDraft()
    f.cargoOperations.push({ operationTypeCode: '1' })
    f.carriers.push({ role: 'Перевозчик', subjectType: null, bin: null, name: null, countryCode: null, phone: null, email: null })
    f.transportMeans.push({ transportModeCode: '20', purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: null, isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false })
    f.precedingDocs.push({ docTypeCode: null, number: '1', date: null })
    f.containers.push({ containerNumber: 'X', note: null })
    f.organizations.push({ role: 'Декларант', subjectType: null, bin: null, name: null, shortName: null, address: null, phone: null, email: null })
    f.doc44.push({ docTypeCode: null, docTypeName: null, docNumber: null, docDate: null })
    expect(changedSections(a, f)).toEqual(['doc44', 'organizations', 'carriers', 'transport', 'containers', 'preceding', 'misc'])
  })
})

describe('goodsTotals', () => {
  it('пустой список', () => {
    expect(goodsTotals([])).toEqual({ items: 0, places: null, gross: null, value: null, currency: null })
  })

  it('суммы; пустые и нечисловые значения → null, если чисел нет вовсе', () => {
    const t = goodsTotals([
      good({ packagesCount: 12, grossWeightKg: 420.5, customsValue: 25000, currency: 'USD' }),
      good({ packagesCount: 24, grossWeightKg: 150, customsValue: null, currency: 'USD' }),
      good({ packagesCount: null, grossWeightKg: Number.NaN, customsValue: 'abc' as unknown as number, currency: 'USD' }),
    ])
    expect(t).toEqual({ items: 3, places: 36, gross: 570.5, value: 25000, currency: 'USD' })
    expect(goodsTotals([good(), good()])).toEqual({ items: 2, places: null, gross: null, value: null, currency: null })
  })

  it('дробные суммы без хвостов плавающей точки', () => {
    expect(goodsTotals([good({ grossWeightKg: 0.1 }), good({ grossWeightKg: 0.2 })]).gross).toBe(0.3)
  })

  it('количество товаров и мест — целые (на сервере int): дробная сумма мест округляется', () => {
    const t = goodsTotals([good({ packagesCount: 1.5 }), good({ packagesCount: 2.2 })])
    expect(t.items).toBe(2)
    expect(t.places).toBe(4)
    expect(goodsTotals([good({ packagesCount: 1.2 }), good({ packagesCount: 1.2 })]).places).toBe(2)
  })

  it('валюта — только если у всех товаров одна', () => {
    expect(goodsTotals([good({ currency: 'USD' }), good({ currency: 'EUR' })]).currency).toBeNull()
    expect(goodsTotals([good({ currency: 'USD' }), good({ currency: null })]).currency).toBeNull()
    expect(goodsTotals([good({ currency: 'EUR' }), good({ currency: 'EUR' })]).currency).toBe('EUR')
  })
})

describe('mergeDrafts', () => {
  it('правки пользователя остаются, остальное — с сервера', () => {
    const base = draftFromEntry(fullEntry())
    const mine = draftFromEntry(fullEntry())
    mine.fields['Груз'] = 'моя правка'
    mine.transit.submitterName = 'Моё'
    mine.containers.push({ containerNumber: 'NEW1234567', note: null })
    const theirs = draftFromEntry(fullEntry())
    theirs.fields['Подкод'] = '99'
    theirs.transit.grossWeightKg = 1
    theirs.goods = [good({ tnvedCode: '1' })]
    theirs.containers = []
    const out = mergeDrafts(base, mine, theirs)
    expect(out.fields['Груз']).toBe('моя правка')
    expect(out.fields['Подкод']).toBe('99')
    expect(out.transit.submitterName).toBe('Моё')
    expect(out.transit.grossWeightKg).toBe(1)
    expect(out.goods).toEqual([good({ tnvedCode: '1' })])
    expect(out.containers).toHaveLength(2)
  })

  it('без правок — ровно серверный черновик; результат не делит объекты с входами', () => {
    const base = draftFromEntry(fullEntry())
    const theirs = draftFromEntry(fullEntry({ data: { ...fullEntry().data, 'Груз': 'с сервера' } }))
    const out = mergeDrafts(base, draftFromEntry(fullEntry()), theirs)
    expect(out).toEqual(theirs)
    out.goods[0].tnvedCode = 'x'
    expect(theirs.goods[0].tnvedCode).toBe('8471300000')
  })
})
