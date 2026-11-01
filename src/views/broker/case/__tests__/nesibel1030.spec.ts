// Правки декларанта 30.10.2026 (пакет E, 01.11.2026): гр. 31 только по-китайски, ЖД — вагоны и код 20, гр. 2 «по поручению».
// Данные вымышленные (пакет ЖДН + упаковочный + инвойс по образцу, без реальных сторон).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Import40ExtractionPartySource, Import40ExtractionPreview } from '@/api/import40'
import { caseIsRail, compositionMode, looksLikeWagons } from '@/utils/transportMode'
import { chineseOnly, hasRussianPart, parseForeignAddress, russianPart, withoutPartyServiceParts } from '@/utils/importText'
import { mergeImportDocs } from '@/views/broker/dt/goods/importMerge'
import { emptyImportRow, type ImportDoc, type ImportRow } from '@/views/broker/dt/goods/importRows'
import { onBehalfSender, resolveOnBehalfSender, type DocumentsNote } from '../steps/documentsImport'
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
