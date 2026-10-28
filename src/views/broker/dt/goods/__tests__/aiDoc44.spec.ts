// Гр. 44 из перечня документов Zircon AI («Из документов», 29.10.2026): дубли, «Б/Н» с датой инвойса, referenced_only,
// code_to_verify, code = null, совместимость без documents, без дублей строк прежнего пути (extras). Значения вымышленные.
import { describe, expect, it } from 'vitest'
import type { Import40ExtractionDocument } from '@/api/import40'
import type { Import40Doc44ItemInput } from '@/types/api'
import { applyExcelFallback, docLine, type ExcelDoc } from '@/views/broker/case/steps/excelFallback'
import { doc44FromAiDocuments } from '../aiDoc44'

const doc = (o: Partial<Import40ExtractionDocument>): Import40ExtractionDocument => ({
  kind: 'invoice', code: '04021', name: 'Инвойс (счёт-фактура)', codeName: 'Счет-фактура (инвойс) к договору', codeToVerify: false,
  forBox44: true, number: 'TEST-INV-1', date: '2026-03-01', flags: [], sourceFiles: ['invoice.xlsx'], ...o,
})
const invoice = doc({})
const packing = doc({
  kind: 'packing_list', code: '04131', name: 'Упаковочный лист', codeName: 'Упаковочный лист', number: 'TEST-INV-1', date: null,
  flags: ['number_from_invoice'],
})
const cols = (rows: readonly Import40Doc44ItemInput[]) => rows.map((d) => [d.docTypeCode, d.docNumber, d.docDate])

describe('doc44FromAiDocuments', () => {
  it('строка на каждый документ: вид из справочника 2009 (нет — code_name), «для всех товаров», признак «0»', () => {
    const names = new Map([['04021', 'СЧЕТ-ФАКТУРА (ИНВОЙС)']])
    const r = doc44FromAiDocuments([], [invoice, doc({ kind: 'cmr', code: '02015', name: 'CMR', codeName: 'Международная накладная', number: 'TEST-CMR-5', date: null })],
      { docKindNames: names })
    expect(r.rows).toEqual([
      docLine('04021', 'TEST-INV-1', '2026-03-01', names),
      { ...docLine('02015', 'TEST-CMR-5', null), docTypeName: 'МЕЖДУНАРОДНАЯ НАКЛАДНАЯ' },
    ])
    expect(r.remarks).toEqual([])
  })

  it('дубли: тот же код и номер (без регистра, пробелов, «№ / -») — второй строки нет; пустой номер — дописываем номер и дату', () => {
    const existing = [
      { ...docLine('04021', '№ test inv/1', null), docTypeName: 'ИНВОЙС ДЕКЛАРАНТА' },
      docLine('02015', null, null),
    ]
    const r = doc44FromAiDocuments(existing, [invoice, doc({ kind: 'cmr', code: '02015', number: 'TEST-CMR-5', date: '2026-03-02' })])
    // строку декларанта не перетираем (номер и дата — как были), пустую CMR — дописали
    expect(cols(r.rows)).toEqual([['04021', '№ test inv/1', null], ['02015', 'TEST-CMR-5', '2026-03-02']])
    expect(r.rows[0].docTypeName).toBe('ИНВОЙС ДЕКЛАРАНТА')
    // existing не изменился (чистая функция)
    expect(existing[1].docNumber).toBeNull()
  })

  it('другой номер того же кода — отдельная строка (второй инвойс пакета)', () => {
    const r = doc44FromAiDocuments([docLine('04021', 'TEST-INV-1', '2026-03-01')], [invoice, doc({ number: 'TEST-INV-2', date: '2026-03-05' })])
    expect(cols(r.rows)).toEqual([['04021', 'TEST-INV-1', '2026-03-01'], ['04021', 'TEST-INV-2', '2026-03-05']])
  })

  it('упаковочный без своего номера — «Б/Н», дата своя, иначе дата его инвойса', () => {
    expect(cols(doc44FromAiDocuments([], [invoice, packing]).rows)).toEqual([
      ['04021', 'TEST-INV-1', '2026-03-01'], ['04131', 'Б/Н', '2026-03-01'],
    ])
    expect(cols(doc44FromAiDocuments([], [invoice, { ...packing, date: '2026-03-03' }]).rows)[1]).toEqual(['04131', 'Б/Н', '2026-03-03'])
    // инвойса в перечне нет — запасная дата инвойса из опций
    expect(cols(doc44FromAiDocuments([], [packing], { invoiceDate: '2026-02-27' }).rows)).toEqual([['04131', 'Б/Н', '2026-02-27']])
    // два инвойса, у каждого упаковочный без номера — две строки «Б/Н» со своими датами
    const second = doc({ number: 'TEST-INV-2', date: '2026-03-09' })
    expect(cols(doc44FromAiDocuments([], [invoice, second, packing, { ...packing, number: 'TEST-INV-2' }]).rows)).toEqual([
      ['04021', 'TEST-INV-1', '2026-03-01'], ['04021', 'TEST-INV-2', '2026-03-09'], ['04131', 'Б/Н', '2026-03-01'], ['04131', 'Б/Н', '2026-03-09'],
    ])
    // «Б/Н» с той же датой уже есть — без второй строки
    expect(doc44FromAiDocuments([docLine('04131', 'б/н', '2026-03-01')], [invoice, packing]).rows).toHaveLength(2)
  })

  it('referenced_only — строка и замечание «скана нет»; code_to_verify — замечание «сверьте код»', () => {
    const contract = doc({
      kind: 'contract', code: '03011', name: 'Внешнеторговый договор (контракт)', number: 'TEST-CTR-9', date: '2026-01-10',
      flags: ['referenced_only', 'reconcile_with_contract_card'], sourceFiles: [],
    })
    const spec = doc({ kind: 'specification', code: '03012', name: 'Спецификация к контракту', codeToVerify: true, number: 'S-1', flags: ['doc_code_to_verify'] })
    const r = doc44FromAiDocuments([], [contract, spec])
    expect(cols(r.rows)).toEqual([['03011', 'TEST-CTR-9', '2026-01-10'], ['03012', 'S-1', '2026-03-01']])
    expect(r.remarks).toEqual([
      { key: 'doc44NoScan', params: { name: 'Внешнеторговый договор (контракт)', number: 'TEST-CTR-9' } },
      { key: 'doc44VerifyCode', params: { code: '03012', name: 'Спецификация к контракту' } },
    ])
    // контракт уже в гр. 44 (прежний путь) — строки нет, а замечание о скане остаётся
    const again = doc44FromAiDocuments([docLine('03011', 'TEST-CTR-9', '2026-01-10')], [contract])
    expect(again.rows).toHaveLength(1)
    expect(again.remarks.map((x) => x.key)).toEqual(['doc44NoScan'])
    // контракт заявки выбран — 03011/03031 ставит сервер из карточки, из перечня не пишем
    expect(doc44FromAiDocuments([], [contract, { ...contract, code: '03031', kind: 'unk_notice' }], { hasCaseContract: true }))
      .toEqual({ rows: [], remarks: [] })
  })

  it('code = null — в гр. 44 не идёт, замечание «не определён код»; forBox44 = false и 09034 — пропуск', () => {
    const cert = doc({ kind: 'origin_cert', code: null, name: 'Сертификат о происхождении товара', codeToVerify: true, number: 'CO-77', sourceFiles: ['cert.pdf'] })
    const idk = doc({ kind: 'inspection_image', code: null, forBox44: false, number: null })
    const r = doc44FromAiDocuments([], [cert, idk, doc({ code: '09034', number: 'X-1' })])
    expect(r.rows).toEqual([])
    expect(r.remarks).toEqual([{ key: 'doc44NoCode', params: { name: 'Сертификат о происхождении товара', file: 'cert.pdf' } }])
    // ссылка на транспортный документ без вида, номер которого уже в гр. 44 (по виду транспорта) — молча
    const ref = doc({ kind: null, code: null, name: 'Документ', number: 'TEST-CMR-5', flags: ['referenced_only', 'transport_doc_reference'], sourceFiles: [] })
    expect(doc44FromAiDocuments([docLine('02013', 'TEST-CMR-5', null)], [ref])).toEqual({ rows: [docLine('02013', 'TEST-CMR-5', null)], remarks: [] })
  })

  it('транспортный документ под другим кодом 020xx с тем же номером — тот же документ', () => {
    const r = doc44FromAiDocuments([docLine('02013', 'TEST-CMR-5', null)], [doc({ kind: 'cmr', code: '02015', number: 'test cmr 5', date: null })])
    expect(cols(r.rows)).toEqual([['02013', 'TEST-CMR-5', null]])
  })

  it('без номера: строка этого вида есть — пустую вторую не добавляем, нет — строка без номера', () => {
    const cmr = doc({ kind: 'cmr', code: '02015', number: null, date: null })
    expect(doc44FromAiDocuments([docLine('02015', 'TEST-CMR-5', null)], [cmr]).rows).toHaveLength(1)
    expect(cols(doc44FromAiDocuments([], [cmr]).rows)).toEqual([['02015', null, null]])
  })

  it('совместимость: нет documents или пусто — строки как были; ДТ только для чтения — ничего', () => {
    const existing = [docLine('04021', 'TEST-INV-1', null)]
    expect(doc44FromAiDocuments(existing, undefined)).toEqual({ rows: existing, remarks: [] })
    expect(doc44FromAiDocuments(existing, [])).toEqual({ rows: existing, remarks: [] })
    expect(doc44FromAiDocuments(existing, [doc({ number: 'TEST-INV-2' })], { readonly: true })).toEqual({ rows: existing, remarks: [] })
  })
})

describe('«Из документов» (applyExcelFallback): перечень и прежний путь — одна дедупликация', () => {
  const extras = {
    invoiceNumber: 'TEST-INV-1', invoiceDate: '2026-03-01', contractNumber: 'TEST-CTR-9', contractDate: '2026-01-10',
    transportDocument: 'TEST-CMR-5', hintCodes: [], goods: [],
  }
  const preview = { goodsItems: [] }

  it('без documents — как раньше (инвойс, транспортный по виду транспорта, контракт из extras)', () => {
    const r = applyExcelFallback(preview, [], { extras, transportMode: 1 })
    expect(cols(r.doc44Items)).toEqual([['04021', 'TEST-INV-1', '2026-03-01'], ['02015', 'TEST-CMR-5', null], ['03011', 'TEST-CTR-9', '2026-01-10']])
    expect(r.doc44Notes).toEqual([])
  })

  it('с documents — строки extras и перечня не дублируются; новое из перечня — в конце; замечания — в doc44Notes', () => {
    const documents = [
      invoice, packing,
      doc({ kind: 'cmr', code: '02015', name: 'CMR', number: 'TEST-CMR-5', date: '2026-03-04', sourceFiles: ['cmr.pdf'] }),
      doc({ kind: 'contract', code: '03011', name: 'Внешнеторговый договор (контракт)', number: 'TEST-CTR-9', date: '2026-01-10', flags: ['referenced_only'], sourceFiles: [] }),
      doc({ kind: 'phyto_cert', code: '01207', name: 'Фитосанитарный сертификат', number: 'PH-12', date: '2026-03-02', sourceFiles: ['phyto.pdf'] }),
      doc({ kind: 'origin_cert', code: null, name: 'Сертификат о происхождении товара', number: 'CO-1', sourceFiles: ['co.pdf'] }),
    ]
    const r = applyExcelFallback(preview, [], { extras: { ...extras, documents }, transportMode: 1 })
    expect(cols(r.doc44Items)).toEqual([
      ['04021', 'TEST-INV-1', '2026-03-01'], ['02015', 'TEST-CMR-5', null], ['03011', 'TEST-CTR-9', '2026-01-10'],
      ['04131', 'Б/Н', '2026-03-01'], ['01207', 'PH-12', '2026-03-02'],
    ])
    expect(r.doc44Notes.map((n) => n.key)).toEqual(['doc44NoScan', 'doc44NoCode'])
  })

  it('упаковочный из шапки Excel с номером инвойса — «Б/Н» и при перечне не дублируется', () => {
    const header = (kind: 'invoice' | 'packing'): ExcelDoc['header'] => ({
      kind, number: 'TEST-INV-1', date: '2026-03-01', incoterms: null, incotermsPlace: null, sellerName: null, sellerAddress: null,
      buyerName: null, buyerBin: null, buyerAddress: null, currency: null, contractNumber: null, contractDate: null, originText: null,
    } as never)
    const docs: ExcelDoc[] = [{ fileName: 'book.xlsx', goods: [], header: header('invoice') }, { fileName: 'book.xlsx', goods: [], header: header('packing') }]
    // без перечня — номер инвойса, как с правки 2.8
    expect(cols(applyExcelFallback(preview, docs, { extras }).doc44Items).slice(0, 2)).toEqual([
      ['04021', 'TEST-INV-1', '2026-03-01'], ['04131', 'TEST-INV-1', '2026-03-01'],
    ])
    const r = applyExcelFallback(preview, docs, { extras: { ...extras, documents: [invoice, { ...packing, sourceFiles: ['book.xlsx'] }] } })
    expect(cols(r.doc44Items).filter(([c]) => c === '04131')).toEqual([['04131', 'Б/Н', '2026-03-01']])
    expect(cols(r.doc44Items).filter(([c]) => c === '04021')).toEqual([['04021', 'TEST-INV-1', '2026-03-01']])
  })

  it('номер инвойса шапки Excel главнее Zircon AI — инвойс перечня из того же файла не даёт второй строки', () => {
    const header = { kind: 'invoice', number: 'INV-EXCEL-3', numberLabeled: true, date: '2026-03-01' } as never
    const docs: ExcelDoc[] = [{ fileName: 'inv.xlsx', goods: [], header }]
    const aiInvoice = doc({ number: 'CTR-LIKE-1', sourceFiles: ['inv.xlsx#Invoice'] })
    const r = applyExcelFallback(preview, docs, { extras: { invoiceNumber: 'CTR-LIKE-1', hintCodes: [], goods: [], documents: [aiInvoice] } })
    expect(cols(r.doc44Items)).toEqual([['04021', 'INV-EXCEL-3', '2026-03-01']])
    // инвойс с этим номером из другого файла — второй инвойс пакета, строка добавляется
    const other = applyExcelFallback(preview, docs, { extras: { invoiceNumber: 'CTR-LIKE-1', hintCodes: [], goods: [], documents: [{ ...aiInvoice, sourceFiles: ['scan.pdf'] }] } })
    expect(cols(other.doc44Items)).toEqual([['04021', 'INV-EXCEL-3', '2026-03-01'], ['04021', 'CTR-LIKE-1', '2026-03-01']])
  })
})
