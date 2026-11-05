// Правки декларанта 30.10.2026 (пакет E, 01.11.2026): гр. 31 только по-китайски, ЖД — вагоны и код 20, гр. 2 «по поручению».
// Данные вымышленные (пакет ЖДН + упаковочный + инвойс по образцу, без реальных сторон).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Import40ExtractionPartySource, Import40ExtractionPreview } from '@/api/import40'
import { caseIsRail, compositionMode, looksLikeWagons } from '@/utils/transportMode'
import { chineseOnly, hasRussianPart, parseForeignAddress, russianPart, withoutPartyServiceParts } from '@/utils/importText'
import { mergeImportDocs } from '@/views/broker/dt/goods/importMerge'
import { emptyImportRow, type ImportDoc, type ImportRow } from '@/views/broker/dt/goods/importRows'
import { onBehalfSender, resolveOnBehalfSender, withLatinConsignor, type DocumentsNote } from '../steps/documentsImport'
import { applyExcelFallback } from '../steps/excelFallback'

const search = vi.fn()
vi.mock('@/api/partyRefs', () => ({ partyRefsApi: { search: (...a: unknown[]) => search(...a) } }))

const r = (o: Partial<ImportRow>): ImportRow => ({ ...emptyImportRow(o.source ?? 'x'), ...o })
const doc = (source: string, kind: ImportDoc['kind'], rows: Partial<ImportRow>[]): ImportDoc =>
  ({ source, kind, rows: rows.map((x) => r({ source, ...x })) })

describe('E1. Гр. 31: русская часть описания', () => {
  it('двуязычная ячейка «贴面板↵Подвесная панель» — только русская часть', () => {
    expect(russianPart('贴面板\nПодвесная панель')).toBe('Подвесная панель')
    expect(hasRussianPart('贴面板\nПодвесная панель')).toBe(true)
    expect(chineseOnly('贴面板')).toBe(true)
    expect(chineseOnly('Подвесная панель')).toBe(false)
  })

  it('в инвойсе только «贴面板», в упаковочном у того же товара есть русское — берётся русское', () => {
    const m = mergeImportDocs([
      doc('invoice.pdf', 'invoice', [{ lineNo: 1, tnvedCode: '6811890009', description: '贴面板', value: 1000 }]),
      doc('packing.pdf', 'packing', [{ lineNo: 1, tnvedCode: '6811890009', description: '贴面板 Подвесная панель', grossWeightKg: 500 }]),
    ])
    expect(m.rows).toHaveLength(1)
    expect(russianPart(m.rows[0].description)).toBe('Подвесная панель')
    expect(m.rows[0].value).toBe(1000)
  })

  it('русское в базе не заменяется; русского нигде нет — остаётся китайское', () => {
    const kept = mergeImportDocs([
      doc('invoice.pdf', 'invoice', [{ lineNo: 1, description: 'Панель стеновая', value: 1 }]),
      doc('packing.pdf', 'packing', [{ lineNo: 1, description: '贴面板 Подвесная панель' }]),
    ])
    expect(kept.rows[0].description).toBe('Панель стеновая')
    const none = mergeImportDocs([
      doc('invoice.pdf', 'invoice', [{ lineNo: 1, description: '贴面板', value: 1 }]),
      doc('packing.pdf', 'packing', [{ lineNo: 1, description: '贴面板' }]),
    ])
    expect(none.rows[0].description).toBe('贴面板')
  })
})

describe('L3. Описание целиком через пробел (Zircon AI от 03.11)', () => {
  it('одно русское слово от 4 букв — китайская часть уходит', () => {
    expect(russianPart('贴面板 Панель')).toBe('Панель')
    expect(hasRussianPart('贴面板 Панель')).toBe(true)
    expect(chineseOnly('贴面板 Панель')).toBe(false)
    expect(russianPart('贴面板 / Панель')).toBe('Панель')
  })

  it('«贴面板 Подвесная панель HS 6811890009»: код остаётся текстом, иероглифы уходят', () => {
    expect(russianPart('贴面板 Подвесная панель')).toBe('Подвесная панель')
    expect(russianPart('贴面板 Подвесная панель HS 6811890009')).toBe('Подвесная панель HS 6811890009')
  })

  it('латинские бренды и модели не теряются', () => {
    expect(russianPart('贴面板 Панель BrandX RC-100')).toBe('Панель BrandX RC-100')
    expect(russianPart('BrandX 贴面板 Панель')).toBe('BrandX Панель')
    expect(russianPart('贴面板 Панель 型号 RC-100')).toBe('Панель RC-100')
  })

  it('подпись свойства или короткое слово — не перевод: описание остаётся китайским', () => {
    expect(russianPart('不锈钢板，冷轧。марка 201J2')).toBe('不锈钢板，冷轧。марка 201J2')
    expect(russianPart('贴面板 Модель RC-100')).toBe('贴面板 Модель RC-100')
    expect(russianPart('贴面板 шт')).toBe('贴面板 шт')
    expect(chineseOnly('贴面板 Модель RC-100')).toBe(true)
  })

  it('одно русское слово при длинном китайском описании (меньше 30% букв) — как раньше, не обрезается', () => {
    const long = '用于标记各类产品的台式激光打标机主机外壳支架 Панель'
    expect(russianPart(long)).toBe(long)
  })
})

describe('E2. ЖД: вагоны, а не тягач с прицепом', () => {
  const h = (number: string) => ({ number, typeCode: null, isTrailer: false, headNumber: null })
  const t = (number: string, head: string) => ({ number, typeCode: null, isTrailer: true, headNumber: head })

  it('номер вагона ЖДН, прочитанный «38265/6», — не состав «31»; авто — как раньше', () => {
    expect(looksLikeWagons([h('38265'), t('6', '38265')])).toBe(true)
    expect(compositionMode([h('38265'), t('6', '38265')])).toBeNull()
    expect(compositionMode([h('12345678'), h('12345679')])).toBeNull()
    expect(compositionMode([h('184AFR19'), t('48AEU19', '184AFR19')])).toBe('31')
    expect(compositionMode([h('184AFR19')])).toBe('30')
  })

  it('заявка ЖД: вид ЖД или «Авто» по умолчанию без машины, но с вагонами', () => {
    expect(caseIsRail({ transportMode: 0 })).toBe(true)
    expect(caseIsRail({ transportMode: 1, vehicleNumber: '', trailerNumber: '', wagonNumber: '12345678' })).toBe(true)
    expect(caseIsRail({ transportMode: 1, vehicleNumber: '', trailerNumber: '', wagonNumber: '', wagonNumbers: ['12345678'] })).toBe(true)
    expect(caseIsRail({ transportMode: 1, vehicleNumber: '184AFR19', trailerNumber: '', wagonNumber: '12345678' })).toBe(false)
    expect(caseIsRail({ transportMode: 1, vehicleNumber: '', trailerNumber: '', wagonNumber: '' })).toBe(false)
    expect(caseIsRail(null)).toBe(false)
  })

  it('«Из документов» при ЖД: «АВТО:» из Excel не идёт в гр. 18, транспортный документ — ЖД накладная 02013', () => {
    const rows: unknown[][] = [['Invoice'], ['АВТО: 184AFR19/48AEU19'], ['№', 'Description', 'Qty', 'Amount'], [1, 'Панель стеновая', 1, 10]]
    const excel = { fileName: 'inv.xlsx', goods: [], header: { kind: 'invoice' as const }, rows, totals: null } as never
    const preview: Import40ExtractionPreview = { goodsItems: [] }
    const rail = applyExcelFallback(preview, [excel], { extras: { rail: true, transportDocument: 'TEST-SMGS-1', hintCodes: [], goods: [] } })
    expect(rail.preview.arrivalTransportNumbers ?? []).toEqual([])
    expect(rail.doc44Items.find((d) => d.docNumber === 'TEST-SMGS-1')?.docTypeCode).toBe('02013')
    const road = applyExcelFallback(preview, [excel], { extras: { transportDocument: 'TEST-CMR-1', hintCodes: [], goods: [] }, transportMode: 1 })
    expect(road.preview.arrivalTransportNumbers?.map((m) => m.number)).toEqual(['184AFR19', '48AEU19'])
    expect(road.doc44Items.find((d) => d.docNumber === 'TEST-CMR-1')?.docTypeCode).toBe('02015')
  })
})

describe('L7. Сцепка с двумя прицепами', () => {
  const means = [
    { number: '184AFR19', typeCode: null, isTrailer: false, headNumber: null },
    { number: '48AEU19', typeCode: null, isTrailer: true, headNumber: '184AFR19' },
    { number: '49AEU19', typeCode: null, isTrailer: true, headNumber: '184AFR19' },
  ]

  it('гр. 18 от сервера не теряется по пути в ДТ, состав — 32', () => {
    const preview: Import40ExtractionPreview = { goodsItems: [], arrivalTransportNumbers: means, borderTransportNumbers: [means[0]] }
    const res = applyExcelFallback(preview, [], { extras: { hintCodes: [], goods: [] }, transportMode: 1 })
    expect(res.preview.arrivalTransportNumbers).toEqual(means)
    expect(res.preview.borderTransportNumbers).toEqual([means[0]])
    expect(compositionMode(means)).toBe('32')
  })
})

describe('E3. Гр. 2: отправитель по накладной «по поручению» продавца', () => {
  const seller: Import40ExtractionPartySource = { name: 'Test Seller Co.,Ltd', address: 'No.1 Test Road, Test City, China', docType: 'invoice_packing', fileName: 'invoice.pdf' }
  const forwarder: Import40ExtractionPartySource = {
    name: 'Test Forwarding Co.,Ltd',
    address: '测试 China, Room 11, Floor 2, Building 3, No.9 Test North Road, Test District, Chengdu, Sichuan USCC:91000000MA00TEST0X 电话-Телефон:0000-1234567',
    docType: 'transport', fileName: 'smgs.pdf',
  }
  beforeEach(() => { search.mockReset(); search.mockResolvedValue([]) })

  it('отправитель ЖДН другой, чем продавец, — «по поручению»; совпадают или накладной нет — как раньше', () => {
    expect(onBehalfSender([seller, forwarder], seller.name)).toEqual({ consignor: forwarder, seller: seller.name })
    expect(onBehalfSender([seller], seller.name)).toBeNull()
    expect(onBehalfSender([seller, { ...forwarder, name: 'TEST SELLER CO., LTD.' }], seller.name)).toBeNull()
    expect(onBehalfSender(null, seller.name)).toBeNull()
    // разбор взял отправителем саму накладную — продавец из другого документа
    expect(onBehalfSender([forwarder, seller], forwarder.name)).toEqual({ consignor: forwarder, seller: seller.name })
    // подпись графы вместо имени — не отправитель
    expect(onBehalfSender([seller, { ...forwarder, name: '2Consignee' }], seller.name)).toBeNull()
  })

  it('гр. 2: «X ПО ПОРУЧЕНИЮ Y» заглавными, адрес и страна — отправителя по накладной, без иероглифов, USCC и телефона', async () => {
    const notes: DocumentsNote[] = []
    const s = (await resolveOnBehalfSender({ consignor: forwarder, seller: seller.name }, notes))!
    expect(s.party.name).toBe('TEST FORWARDING CO.,LTD ПО ПОРУЧЕНИЮ TEST SELLER CO.,LTD')
    expect(s.shortName).toBe(s.party.name)
    expect(s.party.countryCode).toBe('156')
    expect(s.party.street).toContain('CHENGDU')
    expect(JSON.stringify(s)).not.toMatch(/USCC|91000000|1234567|测试|ТЕЛЕФОН/)
    expect(notes.map((n) => n.key)).toContain('senderOnBehalf')
  })

  // L2 (04.11.2026): единый PDF «ЖДН + инвойс» — отправители из documents[]: вид документа, чистый адрес, страна.
  it('страна из документа не теряется: в адресе её нет', async () => {
    const consignor: Import40ExtractionPartySource = {
      name: 'Test Rail Logistics', address: 'Test Road 1, Urumqi', docType: 'transport', kind: 'rail_waybill', fileName: 'a.pdf#p1', countryCode: '156', countryName: 'China',
    }
    const s = (await resolveOnBehalfSender({ consignor, seller: seller.name }, []))!
    expect(s.party.countryCode).toBe('156')
    expect(s.party.street).toContain('TEST ROAD 1')
    // кода нет — по названию страны
    const byName = (await resolveOnBehalfSender({ consignor: { ...consignor, countryCode: null }, seller: seller.name }, []))!
    expect(byName.party.countryCode).toBe('156')
  })

  it('разбор взял отправителем накладную — продавец из инвойса, а не из другого документа', () => {
    const contract: Import40ExtractionPartySource = { name: 'Test Other Party', docType: 'contract', kind: 'contract' }
    const invoice: Import40ExtractionPartySource = { ...seller, kind: 'invoice' }
    expect(onBehalfSender([forwarder, contract, invoice], forwarder.name)?.seller).toBe(seller.name)
  })

  it('длиннее 200 знаков — обрезается с замечанием, не молча', async () => {
    const notes: DocumentsNote[] = []
    const s = (await resolveOnBehalfSender({ consignor: { ...forwarder, name: 'F'.repeat(120) }, seller: 'S'.repeat(120) }, notes))!
    expect(s.party.name!.length).toBe(200)
    expect(s.shortName!.length).toBe(120)
    expect(notes.find((n) => n.key === 'senderOnBehalfLong')?.params?.full).toHaveLength(120 + ' ПО ПОРУЧЕНИЮ '.length + 120)
  })

  it('адрес: USCC и телефон вырезаются, страна в начале узнаётся', () => {
    const cleaned = withoutPartyServiceParts('Room 1, No.2 Test Rd, Chengdu.USCC:91000000MA00TEST0X, Tel: +86 28 1234 5678')
    expect(cleaned.startsWith('Room 1, No.2 Test Rd, Chengdu.')).toBe(true)
    expect(cleaned).not.toMatch(/USCC|91000000|Tel|5678/)
    // «Hotel» — не телефон
    expect(withoutPartyServiceParts('Grand Hotel 12345 Road')).toBe('Grand Hotel 12345 Road')
    const a = parseForeignAddress('China, Room 11, No.9 Test North Road, Test District, Chengdu, Sichuan')!
    expect(a.countryText).toBe('China')
    expect(a.city).toBeNull()
    expect(a.apt).toBe('ROOM 11')
    // страна в конце — как раньше
    expect(parseForeignAddress('Room 1, Test City, China')!.countryText).toBe('China')
  })
})

describe('гр. 2: китайское название накладной (04.11.2026)', () => {
  const source = (name: string, address: string | null) => ({ name, address, docType: 'transport' }) as never

  it('берёт латинское название из адреса и чистит адрес', () => {
    const out = withLatinConsignor(source('测试货运有限公司',
      'TeSt Forward Trading Co.,Ltd.USCC:91000000TEST0000 X1,China Room12,Floor 3,No.9 North Road, Test District, Chengdu'))
    expect(out.name).toBe('TeSt Forward Trading Co.,Ltd')
    expect(out.address).toBe('Room12,Floor 3,No.9 North Road, Test District, Chengdu')
  })

  it('пустой USCC, слитное «Co.Ltd», телефон и пометка перевозчика', () => {
    const out = withLatinConsignor(source('测试货运有限公司', 'Test Forward Co.Ltd.USCC: ,China Room12, Chengdu Телефон:0000-111 КЖД'))
    expect(out.name).toBe('Test Forward Co.Ltd')
    expect(out.address).toBe('Room12, Chengdu')
  })

  it('латинское название не трогает, без латинского в адресе оставляет как есть', () => {
    const latin = source('TEST TRADE LTD', 'Test Other Co.,Ltd.USCC:1,China Room1')
    expect(withLatinConsignor(latin)).toBe(latin)
    const chinese = source('测试货运有限公司', '四川省成都市')
    expect(withLatinConsignor(chinese)).toBe(chinese)
  })

  it('гр. 2 «X ПО ПОРУЧЕНИЮ Y» с латинским X; только китайское — замечание', async () => {
    const notes: DocumentsNote[] = []
    const consignor = source('测试货运有限公司', 'Test Forward Co.,Ltd.USCC:1,China Room12, Chengdu')
    const built = await resolveOnBehalfSender({ consignor, seller: 'TEST SELLER LTD' }, notes)
    expect(built?.party.name).toBe('TEST FORWARD CO.,LTD ПО ПОРУЧЕНИЮ TEST SELLER LTD')
    expect(notes.some((n) => n.key === 'senderNameHan')).toBe(false)

    const han: DocumentsNote[] = []
    await resolveOnBehalfSender({ consignor: source('测试货运有限公司', null), seller: 'TEST SELLER LTD' }, han)
    expect(han.some((n) => n.key === 'senderNameHan')).toBe(true)
  })
})

describe('«по поручению» и опечатка в названии (05.11.2026)', () => {
  it('Mada и Maida — одна компания', () => {
    expect(onBehalfSender([{ name: 'Test Maida Import Co., Ltd', docType: 'transport' } as never], 'Test Mada Import Co., Ltd')).toBeNull()
  })

  it('другая компания — по поручению', () => {
    expect(onBehalfSender([{ name: 'Test Forwarder Co., Ltd', docType: 'transport' } as never], 'Test Mada Import Co., Ltd')?.seller)
      .toBe('Test Mada Import Co., Ltd')
  })
})
