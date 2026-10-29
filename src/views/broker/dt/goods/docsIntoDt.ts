// «Из документов» в уже созданную ДТ (29.10.2026, задача 5 запуска): клиент прислал ещё сканы или Excel — разбор тем же
// конвейером, что новая ДТ (extract-batch → documentsImport.prepareDocumentsDeclaration), но вместо создания ДТ — слияние
// в открытую ДТ, ничего не теряя:
// - товары — правилами «Из Excel» (importMerge.planMerge / applyMerge, режим «Дополнить»): совпавшие дозаполняются только
//   по пустым полям, расхождения — списком, новые — в конец; повторный разбор тех же документов дублей не плодит;
// - гр. 44 — doc44FromAiDocuments с existing = строки ДТ: тот же код и номер — второй строки нет, «Б/Н», у строки того же
//   кода без номера дописывается номер; новые строки при товарах в ДТ — к товарам этого разбора (как «Из Excel», ревью 22.10);
// - шапка (стороны, транспорт, условия поставки, валюта) — только пустые графы; другое значение — замечание, графа ДТ
//   не меняется. Сторона с другим названием (или БИН) — не дозаполняется вовсе: адрес чужой стороны не нужен.
// Здесь — чистые функции (план и применение к форме); загрузка, окна и сохранение — useDocsIntoDt.
import type { Import40DeclarationUpsert, Import40ExtractionDocument, Import40FileDto, Import40Party } from '@/api/import40'
import type { Import40Doc44ItemInput, Import40GoodsItemInput, Import40TransportMeans } from '@/types/api'
import { normPartyName } from '@/utils/importText'
import { extractableCaseFiles, preselectedIds } from '@/views/broker/case/steps/extractDocs'
import { RELEASED_STATUS } from '@/views/import40/dtAccess'
import type { DtFormState } from '../dtPayload'
import { doc44FromAiDocuments } from './aiDoc44'
import { applyMerge, planMerge, sameValue, type ExistingConflict, type MergeMode, type MergePlan } from './importMerge'
import type { DtGoodsModel, GoodsSnapshot } from './useDtGoods'

type Goods = Import40GoodsItemInput

// ───────────────────────── доступ и выбор файлов ─────────────────────────

export interface DocsIntoDtAccess {
  /** CanManageDeclarations (админ, РОП, декларант). */
  canManage: boolean
  /** ДТ можно править (useDtForm.editable: право и ДТ не заменена разделением). */
  editable: boolean
  /** Статус заявки; с «ДТ выпущена» — нельзя. */
  caseStatus?: number | null
  /** Дата выпуска ДТ (в том числе из КЕДЕН) — выпущенная ДТ не дополняется. */
  releasedAtUtc?: string | null
}

/** «Из документов» в эту ДТ: декларант, ДТ правится, не выпущена. */
export function canDocsIntoDt(a: DocsIntoDtAccess): boolean {
  return a.canManage && a.editable && (a.caseStatus ?? 0) < RELEASED_STATUS && !a.releasedAtUtc
}

export interface DocsDefaults {
  /** Что отметить сразу. */
  ids: string[]
  /** Загружены после создания ДТ (подпись «новый»). */
  newIds: string[]
  /** Дата создания ДТ известна (новый сервер). */
  known: boolean
}

/**
 * Что отметить в окне выбора: документы заявки, загруженные после создания ДТ (их ещё не разбирали в эту ДТ); дата
 * создания неизвестна (старый сервер) — как для новой ДТ: инвойс и упаковочный лист.
 */
export function docsDefaults(files: readonly Import40FileDto[], dtCreatedAtUtc?: string | null): DocsDefaults {
  const list = extractableCaseFiles(files)
  const since = dtCreatedAtUtc ? Date.parse(dtCreatedAtUtc) : NaN
  if (Number.isNaN(since)) return { ids: preselectedIds(list), newIds: [], known: false }
  const newIds = list.filter((f) => Date.parse(f.createdAtUtc) > since).map((f) => f.id)
  return { ids: newIds, newIds, known: true }
}

// ───────────────────────── план слияния ─────────────────────────

/** Замечание слияния: ключ broker.dt.goods.docsInto.remark.* и параметры. */
export interface DocsIntoRemark { key: 'headerDiffers' | 'transportDiffers' | 'totalDiffers'; params: Record<string, string | number> }

/** Графы шапки, которые разбор может заполнить (подпись — broker.dt.goods.docsInto.field.*). */
export type HeaderGroup = 'sender' | 'receiver' | 'incoterms' | 'incotermsPlace' | 'currency' | 'departure' | 'destination'
  | 'arrival' | 'border' | 'total'

/** Значение для пустой графы: path — поле формы или «sender.city» / «receiver.name». */
export interface HeaderFill { group: HeaderGroup; path: string; value: unknown }

export interface DocsIntoDtPlan {
  goods: {
    incoming: Goods[]
    mode: MergeMode
    plan: MergePlan
    /** Позиция товара ДТ для каждого товара разбора (сопоставленный или новый в конце). */
    targetIndex: number[]
    conflicts: ExistingConflict[]
  }
  doc44: {
    /** Строки гр. 44 после слияния: прежние (у пустого номера может появиться номер) и новые в конце. */
    rows: Import40Doc44ItemInput[]
    existing: number
    added: number
    /** Прежних строк, у которых появился номер. */
    filled: number
  }
  header: { fills: HeaderFill[]; groups: HeaderGroup[] }
  remarks: DocsIntoRemark[]
}

export interface DocsIntoDtInput {
  /** Товары разбора как в форме (documentsImport: DocumentsDeclaration.goods). */
  goods: readonly Goods[]
  /** Тело «новой ДТ» того же разбора — шапка и гр. 44 (DocumentsDeclaration.body). */
  body: Import40DeclarationUpsert
}

export interface DocsIntoDtOptions {
  /** Названия видов документов (классификатор 2009) для новых строк гр. 44. */
  docKindNames?: ReadonlyMap<string, string> | null
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
const plateKey = (s: string | null | undefined) => (s ?? '').toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '')
const PARTY_FIELDS = ['name', 'countryCode', 'region', 'city', 'street'] as const satisfies readonly (keyof Import40Party)[]
const SENDER_EXTRA = ['senderShortName', 'senderDistrict', 'senderHouse', 'senderApt'] as const
const RECEIVER_EXTRA = ['receiverBin', 'receiverDistrict', 'receiverHouse', 'receiverApt'] as const

/** Гр. 44 строк «новой ДТ» → документы перечня, чтобы слить их со строками ДТ одним правилом doc44FromAiDocuments. */
const asDocuments = (rows: readonly Import40Doc44ItemInput[]): Import40ExtractionDocument[] => rows
  .filter((r) => !blank(r.docTypeCode))
  .map((r) => ({
    code: r.docTypeCode, codeName: r.docTypeName ?? null, name: r.docTypeName ?? r.docTypeCode, forBox44: true,
    number: r.docNumber ?? null, date: r.docDate ? r.docDate.slice(0, 10) : null,
  }))

function planGoods(existing: readonly Goods[], incoming: readonly Goods[]): DocsIntoDtPlan['goods'] {
  const mode: MergeMode = existing.length ? 'fill' : 'append'
  const plan = planMerge(existing, incoming, mode)
  let next = existing.length
  const targetIndex = plan.matches.map((m) => (mode === 'append' ? null : m.existing) ?? next++)
  return { incoming: [...incoming], mode, plan, targetIndex, conflicts: plan.conflicts }
}

function planDoc44(
  existing: readonly Import40Doc44ItemInput[], fresh: readonly Import40Doc44ItemInput[], bindTo: readonly number[] | null,
  opts: DocsIntoDtOptions,
): DocsIntoDtPlan['doc44'] {
  const res = doc44FromAiDocuments(existing, asDocuments(fresh), { docKindNames: opts.docKindNames })
  const kept = res.rows.slice(0, existing.length)
  const indexes = bindTo?.length ? [...new Set(bindTo)].sort((a, b) => a - b).join(',') : null
  // ДТ уже с товарами: новые документы — к товарам этого разбора, а не «ко всем» (инвойс B не встанет под товары инвойса A).
  const added = res.rows.slice(existing.length)
    .map((r) => (indexes != null ? { ...r, appliesToAll: false, goodsItemIndex: null, goodsItemIndexes: indexes } : r))
  const filled = kept.filter((r, i) => (r.docNumber ?? '') !== (existing[i].docNumber ?? '')).length
  return { rows: [...kept, ...added], existing: existing.length, added: added.length, filled }
}

function planHeader(form: DtFormState, body: Import40DeclarationUpsert, out: DocsIntoDtPlan['header'], remarks: DocsIntoRemark[]) {
  const fill = (group: HeaderGroup, path: string, value: unknown) => {
    out.fills.push({ group, path, value })
    if (!out.groups.includes(group)) out.groups.push(group)
  }
  const differs = (field: HeaderGroup, doc: unknown, dt: unknown) =>
    remarks.push({ key: 'headerDiffers', params: { field, doc: String(doc), dt: String(dt) } })

  const party = (role: 'sender' | 'receiver', extra: readonly (keyof DtFormState & keyof Import40DeclarationUpsert)[]) => {
    const doc = body[role]
    const dt = form[role]
    const docBin = role === 'receiver' ? digits(body.receiverBin) : ''
    if (!doc?.name && !docBin) return
    const dtName = dt?.name?.trim() || ''
    const dtBin = role === 'receiver' ? digits(form.receiverBin) : ''
    if (dtName || dtBin) {
      // Та же сторона: по БИН, если он есть у обеих, иначе по названию без форм собственности и кавычек. Сравнить не по
      // чему (в ДТ только БИН, в документах только название) — графу не трогаем и не гадаем.
      const comparable = (!!dtBin && !!docBin) || (!!dtName && !!doc?.name)
      if (!comparable) return
      const same = dtBin && docBin ? dtBin === docBin : normPartyName(dtName) === normPartyName(doc!.name)
      if (!same) {
        differs(role, doc?.name || docBin, dtName || dtBin)
        return
      }
    }
    for (const f of PARTY_FIELDS) if (blank(dt?.[f]) && !blank(doc?.[f])) fill(role, `${role}.${f}`, doc![f])
    for (const k of extra) if (blank(form[k]) && !blank(body[k])) fill(role, k, body[k])
  }
  party('sender', SENDER_EXTRA)
  // «Совпадает с декларантом» — гр. 8 повторяет гр. 14, разбор её не трогает.
  if (!form.consigneeEqualsDeclarant) party('receiver', RECEIVER_EXTRA)

  const simple = (group: HeaderGroup, key: 'incoterms' | 'incotermsPlace' | 'currency' | 'departureCountryCode' | 'destinationCountryCode', remark: boolean) => {
    const doc = body[key]
    if (blank(doc)) return
    if (blank(form[key])) fill(group, key, doc)
    // Страны бывают кодом и буквами («156» / «CN») — расхождение по ним не показываем, только дозаполняем.
    else if (remark && !sameValue(form[key], doc)) differs(group, doc, form[key])
  }
  simple('incoterms', 'incoterms', true)
  simple('incotermsPlace', 'incotermsPlace', true)
  simple('currency', 'currency', true)
  simple('departure', 'departureCountryCode', false)
  simple('destination', 'destinationCountryCode', false)

  const transport = (group: 'arrival' | 'border', key: 'arrivalTransportNumbers' | 'borderTransportNumbers') => {
    const doc = (body[key] ?? []).filter((m) => !blank(m.number))
    if (!doc.length) return
    const dt = (form[key] ?? []).filter((m: Import40TransportMeans) => !blank(m.number))
    if (!dt.length) {
      fill(group, key, doc.map((m) => ({ ...m })))
      return
    }
    const have = new Set(dt.map((m: Import40TransportMeans) => plateKey(m.number)))
    if (doc.some((m) => !have.has(plateKey(m.number)))) {
      remarks.push({ key: 'transportDiffers', params: { field: group, doc: doc.map((m) => m.number).join(', '), dt: dt.map((m: Import40TransportMeans) => m.number).join(', ') } })
    }
  }
  transport('arrival', 'arrivalTransportNumbers')
  transport('border', 'borderTransportNumbers')
}

/**
 * План слияния разбора в открытую ДТ — для сводки перед «Применить» и для самого применения (план строится заново по
 * текущей форме — правки, сделанные пока шёл разбор, не теряются).
 */
export function planDocsIntoDt(form: DtFormState, input: DocsIntoDtInput, opts: DocsIntoDtOptions = {}): DocsIntoDtPlan {
  const existingGoods = form.goodsItems
  const goods = planGoods(existingGoods, input.goods)
  const bindTo = existingGoods.length && goods.incoming.length ? goods.targetIndex : null
  const doc44 = planDoc44(form.doc44Items ?? [], input.body.doc44Items ?? [], bindTo, opts)
  const header: DocsIntoDtPlan['header'] = { fills: [], groups: [] }
  const remarks: DocsIntoRemark[] = []
  planHeader(form, input.body, header, remarks)

  // Гр. 22: пустая — сумма стоимости товаров после слияния; заполненная и товары добавились — сверить с суммой.
  const value = (i: number) => existingGoods[i]?.customsValue ?? null
  const fromFile = new Map(goods.plan.matches.filter((m) => m.existing != null).map((m) => [m.existing!, goods.incoming[m.incoming].customsValue ?? null]))
  const values = [
    ...existingGoods.map((_, i) => value(i) ?? fromFile.get(i) ?? null),
    ...goods.plan.matches.filter((m) => goods.mode === 'append' || m.existing == null).map((m) => goods.incoming[m.incoming].customsValue ?? null),
  ].filter((v): v is number => v != null)
  const sum = values.length ? Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100 : null
  if (sum != null) {
    if (form.totalInvoiceValue == null) {
      header.fills.push({ group: 'total', path: 'totalInvoiceValue', value: sum })
      header.groups.push('total')
    } else if (goods.plan.added && Math.abs(Number(form.totalInvoiceValue) - sum) > 0.01) {
      remarks.push({ key: 'totalDiffers', params: { dt: Number(form.totalInvoiceValue), sum } })
    }
  }
  return { goods, doc44, header, remarks }
}

/** Есть что применить. */
export const planHasChanges = (p: DocsIntoDtPlan): boolean =>
  p.goods.plan.added > 0 || p.goods.plan.updated > 0 || p.doc44.added > 0 || p.doc44.filled > 0 || p.header.fills.length > 0

// ───────────────────────── применение ─────────────────────────

const getPath = (form: DtFormState, path: string): unknown => {
  const [head, tail] = path.split('.', 2)
  const v = (form as unknown as Record<string, unknown>)[head]
  return tail ? (v as Record<string, unknown> | null | undefined)?.[tail] : v
}
const setPath = (form: DtFormState, path: string, value: unknown) => {
  const rec = form as unknown as Record<string, unknown>
  const [head, tail] = path.split('.', 2)
  if (!tail) {
    rec[head] = value
    return
  }
  if (!rec[head]) rec[head] = {}
  ;(rec[head] as Record<string, unknown>)[tail] = value
}

export interface DocsIntoDtApplied {
  added: number
  updated: number
  doc44Added: number
  doc44Filled: number
  headerFilled: number
  /** Вернуть товары, гр. 44 и шапку как было до применения. */
  undo: () => void
}

/** Применить план к форме ДТ (через модель товаров — привязки и статусы как у «Из Excel»). */
export function applyDocsIntoDt(form: DtFormState, model: DtGoodsModel, plan: DocsIntoDtPlan): DocsIntoDtApplied {
  const snap: GoodsSnapshot = model.snapshot()
  const prevHeader = plan.header.fills.map((f) => {
    const v = getPath(form, f.path)
    return { path: f.path, value: Array.isArray(v) ? v.map((x) => ({ ...x })) : v }
  })
  const res = applyMerge(model, plan.goods.incoming, plan.goods.plan, plan.goods.mode)
  const rows = form.doc44Items
  plan.doc44.rows.forEach((r, i) => {
    if (i >= plan.doc44.existing) {
      rows.push({ ...r })
      return
    }
    const cur = rows[i]
    // Прежняя строка: только номер и дата у строки без номера (остальное — как вписал декларант).
    if (cur && blank(cur.docNumber) && !blank(r.docNumber)) {
      cur.docNumber = r.docNumber
      cur.docDate ??= r.docDate ?? null
    }
  })
  for (const f of plan.header.fills) setPath(form, f.path, f.value)
  return {
    added: res.added,
    updated: res.updated,
    doc44Added: plan.doc44.added,
    doc44Filled: plan.doc44.filled,
    headerFilled: plan.header.fills.length,
    undo: () => {
      model.restore(snap)
      for (const p of prevHeader) setPath(form, p.path, p.value)
    },
  }
}
