// Модель страницы ТД партии «Авто-транзита» (очередь 2а): ответ сервера ↔ черновик разделов записи транзита,
// пункты «Не заполнено» → раздел и поле. Разделы views/broker/transit/record/sections/* правят RecordDraft;
// у ТД нет строки ЖД-реестра, поэтому fields — пустой объект и в тело PUT не уходит.
import { toRaw } from 'vue'
import type { DeclarationData, DeclarationMissing } from '@/api/autoTransit'
import type { ReestrTransitFields } from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import { COLLECTION_SECTION, TRANSIT_FIELD_SECTION, type RecordDraft, type SectionKey } from '@/views/broker/transit/record/recordModel'

/** Разделы страницы ТД по порядку (план, Task 2). Контейнеры — свёрнутым блоком в конце, в меню их нет. */
export const TD_SECTIONS: SectionKey[] = [
  'main', 'organizations', 'carriers', 'transport', 'seals', 'goods', 'doc44', 'packaging', 'preceding', 'guarantees', 'misc',
]
const PAGE_SECTIONS = new Set<SectionKey>([...TD_SECTIONS, 'containers'])

type CollectionKey = keyof typeof COLLECTION_SECTION
const COLLECTIONS = Object.keys(COLLECTION_SECTION) as CollectionKey[]

/**
 * Пустой транзит: те же ключи, что у записи транзита, но без ЖД-умолчаний (RW, ПИ, СД) — у авто их подставляет
 * сервер в черновике, а пропавшее из старого JSON поле не должно стать «железной дорогой».
 */
const EMPTY_TRANSIT = Object.fromEntries(
  Object.keys(REESTR_TRANSIT_DEFAULTS).map((k) => [k, k === 'isMultimodal' ? false : null]),
) as unknown as ReestrTransitFields

const clone = <T>(v: T): T => structuredClone(toRaw(v))
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Черновик разделов из data ответа. Терпит неполный и старый JSON: нет списка — пустой, нет поля транзита — null. */
export function dataToDraft(data: Partial<DeclarationData> | null | undefined): RecordDraft {
  const d = (isObj(data) ? data : {}) as Partial<DeclarationData>
  const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? clone(v) : [])
  const draft = {
    fields: {},
    sealNumber: d.sealNumber ?? null,
    packagingType: d.packagingType ?? null,
    // Незнакомые поля транзита (сервер новее фронта) сохраняются: уйдут обратно в PUT как были.
    transit: { ...EMPTY_TRANSIT, ...(isObj(d.transit) ? clone(d.transit) : {}) } as ReestrTransitFields,
  } as RecordDraft
  for (const c of COLLECTIONS) (draft as unknown as Record<string, unknown>)[c] = list(d[c] as unknown[] | undefined)
  return draft
}

/** Поля data, которые держит черновик; всё прочее верхнего уровня — «лишнее» (dataExtras). */
const KNOWN_DATA_KEYS = new Set<string>(['sealNumber', 'packagingType', 'transit', ...COLLECTIONS])

/**
 * Незнакомые поля верхнего уровня data (сервер новее фронта): черновик их не держит, поэтому useTd хранит их рядом
 * и кладёт обратно в PUT — PUT заменяет ТД целиком, без них они бы стёрлись.
 */
export function dataExtras(data: Partial<DeclarationData> | null | undefined): Record<string, unknown> {
  if (!isObj(data)) return {}
  return Object.fromEntries(Object.entries(clone(data)).filter(([k]) => !KNOWN_DATA_KEYS.has(k)))
}

/**
 * Тело data для PUT: вся форма целиком (все разделы, в том числе пустые), без fields, глубокая копия без реактивных
 * обёрток; extras — незнакомые поля ответа (dataExtras), известные поля из черновика они не перекрывают.
 */
export function draftToData(draft: RecordDraft, extras: Record<string, unknown> = {}): DeclarationData {
  const { fields: _fields, ...rest } = clone(draft)
  return { ...clone(extras), ...rest }
}

// ---- Копия с прошлой ТД (Task 3) ----

/** Поля транзита, которые копируются из прошлой ТД: страны, органы отправления и назначения, сведения об упаковке. */
const COPY_TRANSIT: (keyof ReestrTransitFields)[] = [
  'departureCountryCode', 'destinationCountryCode', 'departureCustomsOffice', 'destinationCustomsOffice', 'packagingInfoCode',
]
/** Списки, которые копируются; товары — отдельно, по галочке. */
const COPY_LISTS = ['organizations', 'guarantees', 'packages'] as const

/**
 * Черновик с данными прошлой ТД того же получателя: организации, обеспечение, страны, органы отправления и назначения,
 * упаковка; товары — только при withGoods. Транспортные средства, перевозчики, пломбы, документы гр. 44 и итоги
 * остаются от текущей машины и партии. Ничего не сохраняет: результат — новый объект, исходные не меняются.
 * Источник из старого JSON без списка или поля даёт пустое значение (как dataToDraft).
 */
export function applyCopy(draft: RecordDraft, source: Partial<DeclarationData> | null | undefined, withGoods: boolean): RecordDraft {
  const src = dataToDraft(source)
  const out = clone(draft)
  for (const k of COPY_LISTS) (out as unknown as Record<string, unknown>)[k] = src[k]
  if (withGoods) out.goods = src.goods
  out.packagingType = src.packagingType
  const t = out.transit as unknown as Record<string, unknown>
  for (const k of COPY_TRANSIT) t[k] = src.transit[k]
  return out
}

const hasValue = (v: unknown): boolean => (typeof v === 'string' ? v.trim() !== '' : v != null && v !== false)

/** Копия заменит уже введённое (непустые организации, обеспечение, упаковка, страны, органы; товары — при withGoods). */
export function copyWouldReplace(draft: RecordDraft, withGoods: boolean): boolean {
  if (COPY_LISTS.some((k) => draft[k].length > 0)) return true
  if (withGoods && draft.goods.length > 0) return true
  if (hasValue(draft.packagingType)) return true
  return COPY_TRANSIT.some((k) => hasValue(draft.transit[k]))
}

// ---- «Не заполнено» ----

/** Ключ по частям: «goods[2].tnvedCode» → head goods, index 2, field tnvedCode; «transit.x» → head transit, field x. */
export function parseMissingKey(key: string): { head: string; index: number | null; field: string | null } {
  const m = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?(?:\.([A-Za-z0-9_]+))?/.exec(key.trim())
  if (!m) return { head: key.trim(), index: null, field: null }
  return { head: m[1]!, index: m[2] != null ? Number(m[2]) : null, field: m[3] ?? null }
}

/** Раздел страницы для пункта: section ответа, если такой раздел на странице есть; иначе — по ключу; иначе «Основное». */
export function missingSection(m: DeclarationMissing): SectionKey {
  if (PAGE_SECTIONS.has(m.section as SectionKey)) return m.section as SectionKey
  const { head, field } = parseMissingKey(m.key)
  if (head === 'transit' && field && field in TRANSIT_FIELD_SECTION) return TRANSIT_FIELD_SECTION[field as keyof ReestrTransitFields]
  if (head in COLLECTION_SECTION) return COLLECTION_SECTION[head as CollectionKey]
  if (head in TRANSIT_FIELD_SECTION) {
    const s = TRANSIT_FIELD_SECTION[head as keyof ReestrTransitFields]
    if (PAGE_SECTIONS.has(s)) return s
  }
  return 'main'
}

/**
 * Поле, к которому вести после прокрутки к разделу: имя для [data-f] и номер строки (среди одноимённых полей раздела).
 * У «transit.x» и «x» — поле x; у «organizations.consignee» — поля нет (роль, а не графа): только раздел.
 */
export function missingTarget(m: DeclarationMissing): { field: string | null; index: number } {
  const { head, index, field } = parseMissingKey(m.key)
  if (head === 'transit') return { field, index: 0 }
  if (head in COLLECTION_SECTION) return { field: index != null ? field : null, index: index ?? 0 }
  if (head in TRANSIT_FIELD_SECTION) return { field: head, index: 0 }
  return { field: null, index: 0 }
}

/**
 * Подпись пункта: ключ в broker.autoTransit.td.missing.* и параметры. Строка товара — «goodsItem» с номером с 1
 * (индекс в ключе — с 0, как в массиве). Остальное — ключ без «transit.», точки → «_». Страница сама подставляет
 * запасную подпись, если такого ключа в локали нет.
 */
export function missingLabel(m: DeclarationMissing): { key: string; params: Record<string, unknown> } {
  const { head, index, field } = parseMissingKey(m.key)
  if (head === 'goods' && index != null) return { key: 'goodsItem', params: { n: index + 1, field: field ?? '' } }
  return { key: m.key.trim().replace(/^transit\./, '').replace(/[.[\]]+/g, '_').replace(/_$/, ''), params: {} }
}
