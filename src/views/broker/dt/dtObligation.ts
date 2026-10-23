import { OBLIGATION_LIMITS, type ObligationFields } from '@/api/dtForms'
import type { Import40Doc44ItemInput, Import40GoodsItemInput } from '@/types/api'
import { splitFeatureCodes } from '@/utils/nonTariffCodes'

// Обязательство при условном выпуске (23.10.2026, образец и голосовые декларантов): письмо в ДГД — поля окна и тело
// запроса; связка кода гр. 33 D0122 (условный выпуск) со строкой гр. 44 08999 (обязательство) — автострока и
// предупреждения в обе стороны. Текст самого письма строит сервер.

/**
 * Вид документа гр. 44 для обязательства — 08999 «Иные документы, подтверждающие условия помещения товаров под заявленные
 * таможенные процедуры»: так декларанты ставят его у ДТ с D0122 на проде (номер «Б/Н», признак 1). В голосовом 23.10
 * прозвучало «0839» — не сверено, в списке непроверенного. Код — только здесь.
 */
export const OBLIGATION_DOC_CODE = '08999'
/** Название 08999, если классификатора 2009 нет под рукой. */
export const OBLIGATION_DOC_NAME = 'Иные документы, подтверждающие условия помещения товаров под заявленные таможенные процедуры'
/** Код гр. 33 по списку КЕДЕН: продукция под оценку соответствия, документы — после выпуска (условный выпуск). В редакции
 *  Приказа № 259 тот же смысл — D0129; переход выключен (Gr33Edition на сервере), здесь — только код КЕДЕН. */
export const CONDITIONAL_RELEASE_CODE = 'D0122'
/** Исх. № и номер строки 08999 по умолчанию (как в образце и на проде). */
export const OBLIGATION_DEFAULT_NUMBER = 'Б/Н'
/** Признак представления строки 08999 — «1», представлен при подаче (как у декларантов). */
const OBLIGATION_PRESENT_KIND = '1'

// ---- Поля окна ----

/** Должность по умолчанию — в документ по-русски (как «Директор» в шаблоне доверенности). */
export const DEFAULT_POSITION = 'Директор'

/** Поля, когда значения по умолчанию с сервера не пришли: дата — сегодня, «Б/Н», «Директор», руководитель клиента. */
export const emptyObligationFields = (today: string, signerName: string | null): ObligationFields => ({
  date: today,
  number: OBLIGATION_DEFAULT_NUMBER,
  consigneeName: null,
  invoices: [],
  countryFrom: null,
  postCode: null,
  postName: null,
  warehouseName: null,
  address: null,
  signerPosition: DEFAULT_POSITION,
  signerName,
})

const clean = (v: string | null | undefined, max: number = OBLIGATION_LIMITS.text): string | null => {
  const s = (v ?? '').trim()
  return s ? s.slice(0, max) : null
}

/**
 * Тело POST — ровно то, что в окне: строки обрезаны по краям (пусто — null, в документе черта), инвойсы без номера и
 * даты убраны, не больше 20, исх. № — до 50 (номер строки гр. 44). Дата — как выбрана.
 */
export function obligationBody(f: ObligationFields): ObligationFields {
  return {
    date: f.date,
    number: clean(f.number, OBLIGATION_LIMITS.number),
    consigneeName: clean(f.consigneeName),
    invoices: f.invoices
      .map((i) => ({ number: clean(i.number), date: i.date || null }))
      .filter((i) => i.number || i.date)
      .slice(0, OBLIGATION_LIMITS.invoices),
    countryFrom: clean(f.countryFrom),
    postCode: clean(f.postCode),
    postName: clean(f.postName),
    warehouseName: clean(f.warehouseName),
    address: clean(f.address, OBLIGATION_LIMITS.address),
    signerPosition: clean(f.signerPosition),
    signerName: clean(f.signerName),
  }
}

/** Не заполнено перед формированием (ключи broker.dt.forms.missing.*): Ф.И.О. и адрес нахождения товара. */
export function obligationMissing(f: Pick<ObligationFields, 'signerName' | 'address'>): string[] {
  const out: string[] = []
  if (!(f.signerName ?? '').trim()) out.push('name')
  if (!(f.address ?? '').trim()) out.push('address')
  return out
}

// ---- D0122 (гр. 33) ↔ строка гр. 44 08999 ----

type Gr33Goods = Pick<Import40GoodsItemInput, 'prohibitionCode'>

/** У товара в гр. 33 есть D0122 (коды — строкой через запятую, как в форме). */
export const hasConditionalReleaseCode = (g: Gr33Goods): boolean =>
  splitFeatureCodes(g.prohibitionCode).includes(CONDITIONAL_RELEASE_CODE)

/** Позиции (с 0) товаров с D0122. */
export const conditionalReleaseGoods = (goods: readonly Gr33Goods[]): number[] =>
  goods.flatMap((g, i) => (hasConditionalReleaseCode(g) ? [i] : []))

const isObligationDoc = (d: Import40Doc44ItemInput) => (d.docTypeCode ?? '').trim() === OBLIGATION_DOC_CODE

const normNumber = (n: string | null | undefined) => (n ?? '').trim().toLocaleUpperCase('ru')

const csvTokens = (d: Import40Doc44ItemInput) => (d.goodsItemIndexes ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/** «На все товары»: appliesToAll или ни позиции, ни CSV (как KedenXmlExporter.DocAppliesToGood на сервере). */
const appliesToAllGoods = (d: Import40Doc44ItemInput) => !!d.appliesToAll || (d.goodsItemIndex == null && !csvTokens(d).length)

/** Строка явно привязана (позиция или CSV) хотя бы к одному из товаров; «на все товары» — не в счёт. */
const boundToAny = (d: Import40Doc44ItemInput, goods: readonly number[]) => {
  if (appliesToAllGoods(d)) return false
  const have = new Set(csvTokens(d).map(Number))
  if (d.goodsItemIndex != null) have.add(d.goodsItemIndex)
  return goods.some((i) => have.has(i))
}

/** Документ гр. 44 относится к товару (позиция с 0) — та же семантика, что DocAppliesToGood сервера. */
const appliesToGood = (d: Import40Doc44ItemInput, i: number) => appliesToAllGoods(d) || boundToAny(d, [i])

/**
 * Строка обязательства в гр. 44. 08999 — общий код («Иные документы…»): под ним может стоять и другой документ, поэтому
 * не первую попавшуюся 08999 (ревью 23.10.2026 — правило привязывало D0122 к чужому письму, формирование перетирало его
 * номер и дату):
 * - sure — 08999 с номером «Б/Н» (так ставят правило D0122 и декларанты на проде) или с номером обязательства, уже
 *   сформированного на этой странице (known);
 * - иначе 08999, явно привязанная к товару с D0122 (condGoods): скорее всего обязательство, но это не точно (sure=false);
 * - weak (только для формирования) — 08999 «на все товары»: могла остаться от прошлого обязательства без D0122 —
 *   спросить, а не добавлять вторую. Автоправило такую строку не берёт: добавит свою.
 * Нет подходящей — null: обязательство — отдельной строкой.
 */
export function findObligationDoc44(
  items: readonly Import40Doc44ItemInput[],
  condGoods: readonly number[],
  opts: { known?: readonly string[]; weak?: boolean } = {},
): { row: Import40Doc44ItemInput; sure: boolean } | null {
  const docs = items.filter(isObligationDoc)
  const sureNumbers = new Set([OBLIGATION_DEFAULT_NUMBER, ...(opts.known ?? [])].map(normNumber).filter(Boolean))
  const sure = docs.find((d) => sureNumbers.has(normNumber(d.docNumber)))
  if (sure) return { row: sure, sure: true }
  const bound = docs.find((d) => boundToAny(d, condGoods)) ?? (opts.weak ? docs.find(appliesToAllGoods) : undefined)
  return bound ? { row: bound, sure: false } : null
}

const csv = (indexes: Iterable<number>) => [...new Set(indexes)].sort((a, b) => a - b).join(',')

/** Новая строка 08999: «Б/Н» (или номер), дата, признак 1, привязка к товарам (CSV позиций, не «на все товары»). */
function newObligationRow(name: string, number: string | null, date: string | null, goods: readonly number[]): Import40Doc44ItemInput {
  return {
    docTypeCode: OBLIGATION_DOC_CODE, docTypeName: name, docNumber: number, docDate: date,
    goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: goods.length ? csv(goods) : null,
    docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: OBLIGATION_PRESENT_KIND,
  }
}

/** Дописать позиции товаров в привязку строки; строка «на все товары» (или без привязки — то же) не меняется. */
function bindGoods(row: Import40Doc44ItemInput, goods: readonly number[]): boolean {
  if (appliesToAllGoods(row)) return false
  const have = new Set(csvTokens(row).map(Number).filter((n) => Number.isInteger(n)))
  if (row.goodsItemIndex != null) have.add(row.goodsItemIndex)
  const missing = goods.filter((i) => !have.has(i))
  if (!missing.length) return false
  row.goodsItemIndexes = csv([...have, ...missing])
  row.goodsItemIndex = null
  return true
}

/**
 * Автоправило формы ДТ: у товаров появился D0122 (added — их позиции) — в гр. 44 нужна строка 08999. Строка обязательства
 * (findObligationDoc44: «Б/Н» / номер обязательства / привязана к товару с D0122) есть — её номер, дату, вид и признак не
 * трогать (декларант мог править), только дописать в привязку новые товары с D0122. Нет (в т. ч. 08999 есть, но это
 * другой документ — привязан к товарам без D0122 или «на все товары» со своим номером) — добавить: «Б/Н», дата гр. А,
 * признак 1, привязка ко всем товарам с D0122 (all). Чужую 08999 не трогаем.
 * 'added' — строка добавлена, 'bound' — дописана привязка, null — ничего не менялось.
 */
export function ensureObligationDoc44(
  items: Import40Doc44ItemInput[],
  goods: { all: readonly number[]; added: readonly number[] },
  name: string,
  date: string | null,
  known: readonly string[] = [],
): 'added' | 'bound' | null {
  if (!goods.added.length) return null
  const found = findObligationDoc44(items, goods.all, { known })
  if (!found) {
    items.push(newObligationRow(name, OBLIGATION_DEFAULT_NUMBER, date, goods.all))
    return 'added'
  }
  return bindGoods(found.row, goods.added) ? 'bound' : null
}

/**
 * После формирования обязательства: строка обязательства получает номер = исх. № (пусто — «Б/Н»: в письме «исх. ____»,
 * номер строки не стираем) и дату = дату обязательства; вид, признак и привязку не трогаем. Строки нет — добавить (к
 * товарам с D0122, без них — без привязки, т. е. на все товары). Строка найдена не наверняка (sure=false: номер не «Б/Н»
 * и не номер обязательства — может быть другим документом) — без ответа декларанта (choice) ничего не меняем и
 * возвращаем 'ask' со строкой: 'overwrite' — это обязательство, записать в неё; 'add' — другой документ, обязательство —
 * отдельной строкой.
 */
export function applyObligationToDoc44(
  items: Import40Doc44ItemInput[],
  doc: { number: string | null; date: string },
  goods: readonly number[],
  name: string,
  opts: { known?: readonly string[]; choice?: 'overwrite' | 'add' } = {},
): 'added' | 'updated' | { ask: Import40Doc44ItemInput } {
  const number = (doc.number ?? '').trim() || OBLIGATION_DEFAULT_NUMBER
  const found = opts.choice === 'add' ? null : findObligationDoc44(items, goods, { known: opts.known, weak: true })
  if (!found) {
    items.push(newObligationRow(name, number, doc.date, goods))
    return 'added'
  }
  if (!found.sure && opts.choice !== 'overwrite') return { ask: found.row }
  found.row.docNumber = number
  found.row.docDate = doc.date
  return 'updated'
}

export type ObligationWarning = { kind: 'noDoc'; goodsIndex: number } | { kind: 'noCode' }

/**
 * Предупреждения (не блок — в «До подачи»), те же, что считает сервер (KedenXmlReadiness), но по несохранённой форме:
 * 'noDoc' — у товара с D0122 нет ни одной строки 08999, относящейся к нему (удалили вручную или отвязали от товара; по
 * товару, goodsIndex — позиция с 0); 'noCode' — строка 08999 есть, а D0122 нет ни у одного товара (код убрали — строку
 * сами не удаляем).
 */
export function obligationWarnings(goods: readonly Gr33Goods[], doc44: readonly Import40Doc44ItemInput[]): ObligationWarning[] {
  const docs = doc44.filter(isObligationDoc)
  const cond = conditionalReleaseGoods(goods)
  if (!cond.length) return docs.length ? [{ kind: 'noCode' }] : []
  return cond.filter((i) => !docs.some((d) => appliesToGood(d, i))).map((goodsIndex) => ({ kind: 'noDoc', goodsIndex }))
}
