import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40DeclarationUpsert, Import40FileDto } from '@/api/import40'
import type { Import40Doc44ItemInput, Import40GoodsItemInput } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { blankCharacteristic } from '../editor/characteristics'
import { applyDocsIntoDt, canDocsIntoDt, docsDefaults, planDocsIntoDt, planHasChanges } from '../docsIntoDt'
import { newDtGoodsItem, useDtGoods } from '../useDtGoods'

// «Из документов» в уже созданную ДТ (29.10.2026, задача 5 запуска). Данные вымышленные: «ТОО ТЕСТ», БИН 000000000000.
const goods = (o: Partial<Import40GoodsItemInput> & { article?: string; mark?: string } = {}): Import40GoodsItemInput => {
  const { article, mark, ...rest } = o
  return {
    ...newDtGoodsItem('USD'),
    characteristics: [{ ...blankCharacteristic(), productArticle: article ?? null, tradeMarkName: mark ?? null }],
    ...rest,
  }
}
const doc = (code: string, number: string | null, date: string | null = null, o: Partial<Import40Doc44ItemInput> = {}): Import40Doc44ItemInput => ({
  docTypeCode: code, docTypeName: null, docNumber: number, docDate: date, goodsItemIndex: null, appliesToAll: true,
  goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0', ...o,
})
const setup = (o: Partial<DtFormState> = {}) => {
  const form = reactive({ ...emptyDtForm(), id: 'd1', currency: 'USD', ...o }) as DtFormState
  const model = useDtGoods(form, { readiness: () => null, canEdit: true })
  return { form, model }
}
const body = (o: Partial<Import40DeclarationUpsert> = {}): Import40DeclarationUpsert => ({ ...o })

describe('canDocsIntoDt: кнопка «Из документов» в ДТ', () => {
  const ok = { canManage: true, editable: true, caseStatus: 2, releasedAtUtc: null }
  it('декларант, ДТ правится, не выпущена — можно', () => {
    expect(canDocsIntoDt(ok)).toBe(true)
  })
  it('нет права, только для чтения, выпущена (статус заявки или дата выпуска) — нельзя', () => {
    expect(canDocsIntoDt({ ...ok, canManage: false })).toBe(false)
    expect(canDocsIntoDt({ ...ok, editable: false })).toBe(false)
    expect(canDocsIntoDt({ ...ok, caseStatus: 4 })).toBe(false)
    expect(canDocsIntoDt({ ...ok, caseStatus: 7 })).toBe(false)
    expect(canDocsIntoDt({ ...ok, releasedAtUtc: '2026-10-28T10:00:00Z' })).toBe(false)
  })
})

describe('docsDefaults: что отметить в окне выбора', () => {
  const file = (id: string, at: string, o: Partial<Import40FileDto> = {}): Import40FileDto => ({
    id, section: 'documents', originalFileName: `${id}.pdf`, contentType: 'application/pdf', sizeBytes: 1,
    uploadedByBusinessRole: 'client', createdAtUtc: at, docKind: null, ...o,
  })
  const files = [
    file('inv', '2026-10-27T09:00:00Z', { docKind: 'invoice', originalFileName: 'inv.xlsx' }),
    file('scan', '2026-10-29T08:00:00Z', { section: 'border-scans' }),
    file('cert', '2026-10-29T09:00:00Z'),
    file('poa', '2026-10-29T09:30:00Z', { section: 'power-of-attorney' }),
  ]
  it('дата создания ДТ известна — загруженные после неё (доверенность не распознаётся)', () => {
    expect(docsDefaults(files, '2026-10-28T12:00:00.123456Z')).toEqual({ ids: ['scan', 'cert'], newIds: ['scan', 'cert'], known: true })
  })
  it('новых нет — ничего не отмечено; дата неизвестна (старый сервер) — инвойс и упаковочный', () => {
    expect(docsDefaults(files, '2026-10-30T00:00:00Z')).toEqual({ ids: [], newIds: [], known: true })
    expect(docsDefaults(files, null)).toEqual({ ids: ['inv'], newIds: [], known: false })
  })
})

describe('planDocsIntoDt / applyDocsIntoDt: товары', () => {
  it('совпавший товар — только пустые поля, расхождение показано и не перетёрто; новый — в конец', () => {
    const { form, model } = setup({
      goodsItems: [goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1', grossWeightKg: 10, netWeightKg: null })],
    })
    const incoming = [
      goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1', grossWeightKg: 12, netWeightKg: 9, mark: 'ОТСУТСТВУЕТ' }),
      goods({ tnvedCode: '9403200009', description: 'СТОЛ', article: 'B-2', grossWeightKg: 30, customsValue: 100 }),
    ]
    const plan = planDocsIntoDt(form, { goods: incoming, body: body() })
    expect(plan.goods.plan.added).toBe(1)
    expect(plan.goods.plan.updated).toBe(1)
    expect(plan.goods.conflicts).toEqual([expect.objectContaining({ existing: 0, field: 'grossWeightKg', dtValue: 10, fileValue: 12 })])
    expect(plan.goods.targetIndex).toEqual([0, 1])

    applyDocsIntoDt(form, model, plan)
    expect(form.goodsItems).toHaveLength(2)
    expect(form.goodsItems[0].grossWeightKg).toBe(10) // заполненное декларантом — как было
    expect(form.goodsItems[0].netWeightKg).toBe(9) // пустое — из документов
    expect(form.goodsItems[0].characteristics?.[0].tradeMarkName).toBe('ОТСУТСТВУЕТ')
    expect(form.goodsItems[1].description).toBe('СТОЛ')
  })

  it('повторный разбор тех же документов — дублей нет, применять нечего', () => {
    const { form, model } = setup({ goodsItems: [goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1' })] })
    const incoming = () => [
      goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1', netWeightKg: 9 }),
      goods({ tnvedCode: '9403200009', description: 'СТОЛ', article: 'B-2' }),
    ]
    applyDocsIntoDt(form, model, planDocsIntoDt(form, { goods: incoming(), body: body() }))
    expect(form.goodsItems).toHaveLength(2)
    const again = planDocsIntoDt(form, { goods: incoming(), body: body() })
    expect(again.goods.plan.added).toBe(0)
    expect(again.goods.plan.updated).toBe(2)
    // Совпали, но дозаполнять нечего — «применять нечего» (ревью 29.10, M1).
    expect(again.goods.filled).toBe(0)
    expect(planHasChanges(again)).toBe(false)
    const res = applyDocsIntoDt(form, model, again)
    expect(res.updated).toBe(0)
    expect(form.goodsItems).toHaveLength(2)
  })

  it('без сопоставления «по порядку»: равное число других товаров без кода и артикула — все новые (ревью 29.10, I1)', () => {
    const { form, model } = setup({ goodsItems: [goods({ description: 'СТУЛ' }), goods({ description: 'СТОЛ' })] })
    const plan = planDocsIntoDt(form, { goods: [goods({ description: 'ЛАМПА', grossWeightKg: 3 }), goods({ description: 'КОВЁР', grossWeightKg: 7 })], body: body() })
    expect(plan.goods.plan).toMatchObject({ added: 2, updated: 0 })
    applyDocsIntoDt(form, model, plan)
    expect(form.goodsItems.map((g) => [g.description, g.grossWeightKg])).toEqual([['СТУЛ', null], ['СТОЛ', null], ['ЛАМПА', 3], ['КОВЁР', 7]])
    // Описание декларант перевёл, артикул тот же — тот же товар (по ключу код + артикул).
    const same = setup({ goodsItems: [goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1' })] })
    const p2 = planDocsIntoDt(same.form, { goods: [goods({ tnvedCode: '9401790009', description: 'CHAIR', article: 'A-1' })], body: body() })
    expect(p2.goods.plan).toMatchObject({ added: 0, updated: 1 })
  })

  it('«Добавить все как новые» — совпавшие тоже в конец, товары ДТ не меняются, расхождений нет', () => {
    const { form, model } = setup({ goodsItems: [goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1', grossWeightKg: 10 })] })
    const incoming = [goods({ tnvedCode: '9401790009', description: 'СТУЛ', article: 'A-1', grossWeightKg: 12, netWeightKg: 9 })]
    expect(planDocsIntoDt(form, { goods: incoming, body: body() }).goods.plan).toMatchObject({ added: 0, updated: 1 })
    const plan = planDocsIntoDt(form, { goods: incoming, body: body() }, { mode: 'append' })
    expect(plan.goods.plan).toMatchObject({ added: 1, updated: 0 })
    expect(plan.goods.conflicts).toEqual([])
    applyDocsIntoDt(form, model, plan)
    expect(form.goodsItems.map((g) => [g.grossWeightKg, g.netWeightKg])).toEqual([[10, null], [12, 9]])
  })

  it('пустая ДТ — все товары новые, гр. 22 — сумма товаров', () => {
    const { form, model } = setup()
    const plan = planDocsIntoDt(form, { goods: [goods({ description: 'СТУЛ', customsValue: 40 }), goods({ description: 'СТОЛ', customsValue: 60.5 })], body: body() })
    expect(plan.goods.mode).toBe('append')
    expect(plan.header.fills).toContainEqual({ group: 'total', path: 'totalInvoiceValue', value: 100.5 })
    applyDocsIntoDt(form, model, plan)
    expect(form.goodsItems.map((g) => g.description)).toEqual(['СТУЛ', 'СТОЛ'])
    expect(form.totalInvoiceValue).toBe(100.5)
  })

  it('гр. 22 заполнена, товары добавились — не трогаем, сверка суммы — замечанием', () => {
    const { form } = setup({ totalInvoiceValue: 50, goodsItems: [goods({ tnvedCode: '9401790009', description: 'СТУЛ', customsValue: 50 })] })
    const plan = planDocsIntoDt(form, { goods: [goods({ tnvedCode: '9403200009', description: 'СТОЛ', customsValue: 25 })], body: body() })
    expect(plan.header.groups).not.toContain('total')
    expect(plan.remarks).toContainEqual({ key: 'totalDiffers', params: { dt: 50, sum: 75 } })
  })

  it('стоимость в разных валютах — гр. 22 не суммируется и не сверяется, замечание (ревью 29.10, M5)', () => {
    const empty = setup({ currency: 'USD', goodsItems: [goods({ tnvedCode: '9401790009', description: 'СТУЛ', customsValue: 50, currency: 'USD' })] })
    const plan = planDocsIntoDt(empty.form, { goods: [goods({ tnvedCode: '9403200009', description: 'СТОЛ', customsValue: 25, currency: 'EUR' })], body: body() })
    expect(plan.header.groups).not.toContain('total')
    expect(plan.remarks).toContainEqual({ key: 'totalCurrency', params: { list: 'USD, EUR', currency: 'USD' } })
    expect(plan.remarks.some((r) => r.key === 'totalDiffers')).toBe(false)
  })
})

describe('planDocsIntoDt: гр. 44 — doc44FromAiDocuments со строками ДТ', () => {
  it('тот же документ — второй строки нет; «Б/Н», CMR, сертификат — новые строки к товарам разбора; пустая строка декларанта не трогается', () => {
    const { form, model } = setup({
      goodsItems: [goods({ description: 'СТУЛ', article: 'A-1' })],
      doc44Items: [doc('04021', 'UR-0910', '2026-10-10T00:00:00'), doc('02015', null)],
    })
    const fresh = [doc('04021', 'ur0910', '2026-10-10'), doc('04131', 'Б/Н', '2026-10-10'), doc('02015', 'CMR 77'), doc('09023', 'SERT-5', '2026-10-01')]
    const plan = planDocsIntoDt(form, { goods: [goods({ description: 'СТОЛ', article: 'B-2' })], body: body({ doc44Items: fresh }) })
    // Инвойс уже есть. Пустая 02015 декларанта привязана к прежним товарам — CMR этого разбора не пишется в неё, а встаёт
    // новой строкой к товарам разбора (ревью 29.10, M2).
    expect(plan.doc44.added).toBe(3)
    expect(plan.doc44.filled).toBe(0)
    applyDocsIntoDt(form, model, plan)
    expect(form.doc44Items.map((d) => [d.docTypeCode, d.docNumber])).toEqual([
      ['04021', 'UR-0910'], ['02015', null], ['04131', 'Б/Н'], ['02015', 'CMR 77'], ['09023', 'SERT-5'],
    ])
    // В ДТ уже были товары — новые документы привязаны к товарам этого разбора (новый товар — позиция 1), не «ко всем».
    expect(form.doc44Items[2]).toMatchObject({ appliesToAll: false, goodsItemIndexes: '1' })
    expect(form.doc44Items[3]).toMatchObject({ appliesToAll: false, goodsItemIndexes: '1' })
    expect(form.doc44Items[0].docNumber).toBe('UR-0910') // строку декларанта не меняем

    // Ещё раз те же документы — гр. 44 без дублей.
    const again = planDocsIntoDt(form, { goods: [goods({ description: 'СТОЛ', article: 'B-2' })], body: body({ doc44Items: fresh }) })
    expect(again.doc44.added).toBe(0)
    expect(again.doc44.filled).toBe(0)
  })

  it('тот же документ привязан к части товаров — к нему дописываются товары разбора (ревью 29.10, M4)', () => {
    const { form, model } = setup({
      goodsItems: [goods({ description: 'СТУЛ', article: 'A-1' })],
      doc44Items: [doc('04021', 'INV-1', '2026-10-10', { appliesToAll: false, goodsItemIndexes: '0' }), doc('04131', 'Б/Н', '2026-10-10')],
    })
    const fresh = [doc('04021', 'INV-1', '2026-10-10'), doc('04131', 'Б/Н', '2026-10-10')]
    const plan = planDocsIntoDt(form, { goods: [goods({ description: 'СТОЛ', article: 'B-2' })], body: body({ doc44Items: fresh }) })
    expect(plan.doc44).toMatchObject({ added: 0, extend: [{ index: 0, goodsItemIndexes: '0,1' }] })
    expect(planHasChanges(plan)).toBe(true)
    applyDocsIntoDt(form, model, plan)
    expect(form.doc44Items[0].goodsItemIndexes).toBe('0,1')
    expect(form.doc44Items[1]).toMatchObject({ appliesToAll: true, goodsItemIndexes: null }) // «для всех» — как было
  })

  it('ДТ без товаров — новые документы «для всех товаров», у пустой строки того же кода — номер', () => {
    const { form } = setup({ doc44Items: [doc('02015', null)] })
    const plan = planDocsIntoDt(form, { goods: [goods({ description: 'СТОЛ' })], body: body({ doc44Items: [doc('02015', 'CMR 77')] }) })
    expect(plan.doc44).toMatchObject({ added: 0, filled: 1 })
  })

  it('ДТ без товаров — новые документы «для всех товаров»', () => {
    const { form } = setup()
    const plan = planDocsIntoDt(form, { goods: [goods({ description: 'СТОЛ' })], body: body({ doc44Items: [doc('04021', 'INV-1', '2026-10-10')] }) })
    expect(plan.doc44.rows).toEqual([expect.objectContaining({ docTypeCode: '04021', docNumber: 'INV-1', docDate: '2026-10-10', appliesToAll: true })])
  })
})

describe('planDocsIntoDt: шапка — только пустые графы', () => {
  it('пустые графы заполняются, заполненные декларантом — нет; другое значение — замечание', () => {
    const { form, model } = setup({ currency: 'EUR', incoterms: '', incotermsPlace: '', arrivalTransportNumbers: [] })
    const plan = planDocsIntoDt(form, {
      goods: [],
      body: body({
        currency: 'USD', incoterms: 'FCA', incotermsPlace: 'ХОРГОС',
        arrivalTransportNumbers: [{ number: '123ABC02', typeCode: null, isTrailer: false, headNumber: null }],
        sender: { name: 'TEST TRADING CO., LTD', countryCode: 'CN', city: 'URUMQI' }, senderShortName: 'TEST TRADING CO., LTD',
      }),
    })
    expect(plan.header.groups).toEqual(expect.arrayContaining(['sender', 'incoterms', 'incotermsPlace', 'arrival']))
    expect(plan.header.groups).not.toContain('currency')
    expect(plan.remarks).toContainEqual({ key: 'headerDiffers', params: { field: 'currency', doc: 'USD', dt: 'EUR' } })
    expect(planHasChanges(plan)).toBe(true)

    const res = applyDocsIntoDt(form, model, plan)
    expect(form.currency).toBe('EUR')
    expect(form.incoterms).toBe('FCA')
    expect(form.sender).toMatchObject({ name: 'TEST TRADING CO., LTD', countryCode: 'CN', city: 'URUMQI' })
    expect(form.arrivalTransportNumbers.map((m) => m.number)).toEqual(['123ABC02'])

    // «Отменить» — шапка как была.
    res.undo()
    expect(form.incoterms).toBe('')
    expect(form.sender?.name ?? null).toBeNull()
    expect(form.arrivalTransportNumbers).toEqual([])
  })

  it('та же сторона (без форм собственности) — дозаполняется адрес; другая — не трогается, замечание', () => {
    const same = setup({ sender: { name: 'TEST TRADING CO LTD', countryCode: 'CN', region: null, city: null, street: null } })
    const p1 = planDocsIntoDt(same.form, { goods: [], body: body({ sender: { name: 'Test Trading Co., Ltd.', countryCode: 'CN', city: 'URUMQI', street: 'NO. 1 ROAD' } }) })
    expect(p1.header.fills).toEqual(expect.arrayContaining([
      { group: 'sender', path: 'sender.city', value: 'URUMQI' }, { group: 'sender', path: 'sender.street', value: 'NO. 1 ROAD' },
    ]))
    expect(p1.header.fills.some((f) => f.path === 'sender.name')).toBe(false)

    const other = setup({ sender: { name: 'ДРУГОЙ ПОСТАВЩИК', countryCode: 'CN', region: null, city: null, street: null } })
    const p2 = planDocsIntoDt(other.form, { goods: [], body: body({ sender: { name: 'TEST TRADING CO LTD', city: 'URUMQI' } }) })
    expect(p2.header.fills).toEqual([])
    expect(p2.remarks).toEqual([{ key: 'headerDiffers', params: { field: 'sender', doc: 'TEST TRADING CO LTD', dt: 'ДРУГОЙ ПОСТАВЩИК' } }])
  })

  it('транспорт: строки ДТ без номера (вид, прицеп) не заменяются — номер и пустые поля по порядку (ревью 29.10, M3)', () => {
    const { form, model } = setup({ arrivalTransportNumbers: [{ number: '', typeCode: '30', nationality: 'KZ', isTrailer: false }] })
    const plan = planDocsIntoDt(form, {
      goods: [],
      body: body({ arrivalTransportNumbers: [
        { number: '123ABC02', typeCode: null, isTrailer: false, headNumber: null },
        { number: '45XYZ02', typeCode: null, isTrailer: true, headNumber: '123ABC02' },
      ] }),
    })
    applyDocsIntoDt(form, model, plan)
    expect(form.arrivalTransportNumbers).toEqual([
      { number: '123ABC02', typeCode: '30', nationality: 'KZ', isTrailer: false },
      { number: '45XYZ02', typeCode: null, isTrailer: true, headNumber: '123ABC02' },
    ])
  })

  it('получатель: другой БИН — замечание; «совпадает с декларантом» — гр. 8 не трогается; транспорт другой — замечание', () => {
    const a = setup({ receiver: { name: 'ТОО ТЕСТ', countryCode: '398', region: null, city: null, street: null }, receiverBin: '000000000000' })
    const p = planDocsIntoDt(a.form, {
      goods: [],
      body: body({ receiver: { name: 'ТОО «ТЕСТ»', city: 'АЛМАТЫ' }, receiverBin: '111111111111' }),
    })
    expect(p.header.fills).toEqual([])
    expect(p.remarks[0]).toMatchObject({ key: 'headerDiffers', params: { field: 'receiver' } })

    const b = setup({ consigneeEqualsDeclarant: true, arrivalTransportNumbers: [{ number: '777AAA02', typeCode: null }] })
    const q = planDocsIntoDt(b.form, {
      goods: [],
      body: body({ receiver: { name: 'ТОО ТЕСТ', city: 'АЛМАТЫ' }, arrivalTransportNumbers: [{ number: '123ABC02', typeCode: null }] }),
    })
    expect(q.header.fills).toEqual([])
    expect(q.remarks).toEqual([{ key: 'transportDiffers', params: { field: 'arrival', doc: '123ABC02', dt: '777AAA02' } }])
    expect(planHasChanges(q)).toBe(false)
  })
})
