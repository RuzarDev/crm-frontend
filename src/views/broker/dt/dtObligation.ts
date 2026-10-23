import { OBLIGATION_LIMITS, type ObligationFields } from '@/api/dtForms'
import type { Import40Doc44ItemInput, Import40GoodsItemInput } from '@/types/api'
import { splitFeatureCodes } from '@/utils/nonTariffCodes'

// Обязательство при условном выпуске (23.10.2026, образец и голосовые декларантов): письмо в ДГД — поля окна и тело
// запроса; строка гр. 44 08999 (обязательство) после формирования. Текст самого письма строит сервер.

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
 * даты убраны, не больше 20. Дата — как выбрана.
 */
export function obligationBody(f: ObligationFields): ObligationFields {
  return {
    date: f.date,
    number: clean(f.number),
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

/** Первая строка гр. 44 08999; нет — null. */
export const obligationDoc44 = (items: readonly Import40Doc44ItemInput[]): Import40Doc44ItemInput | null =>
  items.find(isObligationDoc) ?? null

const csv = (indexes: Iterable<number>) => [...new Set(indexes)].sort((a, b) => a - b).join(',')

/** Новая строка 08999: «Б/Н» (или номер), дата, признак 1, привязка к товарам (CSV позиций, не «на все товары»). */
function newObligationRow(name: string, number: string | null, date: string | null, goods: readonly number[]): Import40Doc44ItemInput {
  return {
    docTypeCode: OBLIGATION_DOC_CODE, docTypeName: name, docNumber: number, docDate: date,
    goodsItemIndex: null, appliesToAll: false, goodsItemIndexes: goods.length ? csv(goods) : null,
    docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: OBLIGATION_PRESENT_KIND,
  }
}

/**
 * После формирования обязательства: строка 08999 получает номер = исх. № и дату = дату обязательства (вид, признак и
 * привязку не трогаем). Строки нет — добавить (к товарам с D0122, без них — без привязки, т. е. на все товары).
 */
export function applyObligationToDoc44(
  items: Import40Doc44ItemInput[],
  doc: { number: string | null; date: string },
  goods: readonly number[],
  name: string,
): 'added' | 'updated' {
  const row = obligationDoc44(items)
  if (!row) {
    items.push(newObligationRow(name, doc.number, doc.date, goods))
    return 'added'
  }
  row.docNumber = doc.number
  row.docDate = doc.date
  return 'updated'
}
