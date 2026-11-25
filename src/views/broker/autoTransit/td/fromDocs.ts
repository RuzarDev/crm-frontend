// «Заполнить из документов» на странице ПИ / ТД (очередь 3, этап 2, спека 2026-11-25, 5.2–5.3): чистая логика —
// какие файлы предлагать, слияние ответа сервера с формой, сверка документов между собой, разбор ошибок.
// Правило слияния: пустое поле заполняется, заполненное не трогается; товары — «заменить» или «добавить».
// В базу ничего не пишется: результат ложится в черновик, сохраняет «Сохранить».
import { toRaw } from 'vue'
import type { AutoVehicle, DeclarationData, DocumentsCheck, FileKind, TruckFile } from '@/api/autoTransit'
import type { ReestrDoc44ItemInput, ReestrOrganizationInput } from '@/types/api'
import type { RecordDraft } from '@/views/broker/transit/record/recordModel'
import { dataToAuto, dataToDraft, type AutoPart } from './tdModel'

export type GoodsMode = 'replace' | 'add'

const clone = <T>(v: T): T => structuredClone(toRaw(v))
const blank = (v: unknown): boolean => v == null || (typeof v === 'string' && !v.trim())

// ---- Файлы ----

/** Виды, которые сервер отправляет в Zircon AI; остальное он пропускает с предупреждением. */
export const RECOGNIZED_KINDS: readonly FileKind[] = ['cmr', 'invoice', 'packingList']
/** Как на сервере: не больше 20 файлов и 60 МБ за раз (больше — 413). */
export const MAX_FILES = 20
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024

/** Файлы для выбора: этой партии, затем общие машины; возвращённые и чужих партий — нет. */
export function pickableFiles(files: TruckFile[], partyId: string): TruckFile[] {
  const ok = files.filter((f) => !f.returned)
  return [...ok.filter((f) => f.partyId === partyId), ...ok.filter((f) => f.partyId == null)]
}

/** Отмечены по умолчанию — CMR, инвойс, упаковочный (не больше MAX_FILES). */
export const defaultSelected = (files: TruckFile[]): string[] =>
  files.filter((f) => RECOGNIZED_KINDS.includes(f.kind)).slice(0, MAX_FILES).map((f) => f.id)

// ---- Слияние ----

/** Итоги «Основного»: при «добавить» к своим товарам итоги документов неверны (это только их товары) — не подставляем. */
const TOTAL_KEYS = new Set<string>(['goodsQuantity', 'cargoPlacesCount', 'grossWeightKg', 'totalValue'])
const ORG_FIELDS = ['subjectType', 'bin', 'name', 'shortName', 'address', 'phone', 'email'] as const
const DOC_FIELDS = ['docTypeName', 'docNumber', 'docDate', 'authorizedBody', 'authorizedBodyId', 'formBlankNumber'] as const

const fillBlank = <T extends object>(target: T, source: T, keys: readonly (keyof T)[]) => {
  for (const k of keys) if (blank(target[k]) && !blank(source[k])) target[k] = source[k]
}

/**
 * Черновик и машины с данными из документов. Исходные не меняются. Нераспознанный раздел (null / нет) — без изменений.
 * Стороны — по роли: нет такой — добавляется, есть — заполняются её пустые поля. Гр. 44 — строка того же кода без номера
 * (строки шаблона) или с тем же номером заполняется, иначе добавляется новая. Машины: пусто — список из документов,
 * иначе пустой госномер строки той же роли; недостающая роль добавляется (прицеп — со ссылкой на свой тягач).
 */
export function mergeFromDocuments(draft: RecordDraft, auto: AutoPart, data: Partial<DeclarationData>, mode: GoodsMode): { draft: RecordDraft; auto: AutoPart } {
  const out = clone(draft)
  const outAuto = clone(auto)
  const src = dataToDraft(data)
  const docGoods = Array.isArray(data.goods) ? src.goods : []
  const hadGoods = out.goods.length > 0

  // Транзит
  const tIn = (data.transit && typeof data.transit === 'object' ? data.transit : {}) as Record<string, unknown>
  const tOut = out.transit as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(tIn)) {
    if (blank(v)) continue
    if (TOTAL_KEYS.has(k) && mode === 'add' && hadGoods && docGoods.length) continue
    if (blank(tOut[k])) tOut[k] = v
  }

  // Стороны
  for (const o of src.organizations as ReestrOrganizationInput[]) {
    const same = out.organizations.find((x) => x.role === o.role)
    if (same) fillBlank(same, o, ORG_FIELDS)
    else out.organizations.push(o)
  }

  // Товары
  if (docGoods.length) out.goods = mode === 'replace' ? docGoods : [...out.goods, ...docGoods]

  // Гр. 44
  for (const d of src.doc44 as ReestrDoc44ItemInput[]) {
    const code = d.docTypeCode
    const row = out.doc44.find((x) => x.docTypeCode === code && blank(x.docNumber))
      ?? out.doc44.find((x) => x.docTypeCode === code && !blank(d.docNumber) && x.docNumber?.trim() === d.docNumber?.trim())
    if (row) fillBlank(row, d, DOC_FIELDS)
    else out.doc44.push(d)
  }

  // Машины
  const docVehicles = Array.isArray(data.vehicles) ? dataToAuto({ vehicles: data.vehicles }).vehicles : []
  if (docVehicles.length) {
    if (!outAuto.vehicles.length) outAuto.vehicles = docVehicles
    else {
      const at = new Map<number, number>()
      docVehicles.forEach((v: AutoVehicle, i) => {
        const j = outAuto.vehicles.findIndex((x) => x.role === v.role)
        if (j >= 0) {
          const x = outAuto.vehicles[j]!
          if (blank(x.regNumber) && !blank(v.regNumber)) x.regNumber = v.regNumber
          if (blank(x.typeCode) && !blank(v.typeCode)) x.typeCode = v.typeCode
          at.set(i, j)
        } else {
          const head = v.headIndex != null ? at.get(v.headIndex) ?? null : null
          outAuto.vehicles.push({ ...v, headIndex: head })
          at.set(i, outAuto.vehicles.length - 1)
        }
      })
    }
  }
  return { draft: out, auto: outAuto }
}

/** Будут ли заменены товары формы (тогда — подтверждение). */
export const wouldReplaceGoods = (draft: RecordDraft, data: Partial<DeclarationData>, mode: GoodsMode): boolean =>
  mode === 'replace' && draft.goods.length > 0 && Array.isArray(data.goods) && data.goods.length > 0

// ---- Сверка документов ----

export type DocCheckKey = 'places' | 'grossKg' | 'plates'
export interface DocCheckRow { key: DocCheckKey; cmr: number | string | null; invoice: number | string | null; packing: number | string | null }

const SLOTS = ['cmr', 'invoice', 'packing'] as const
const normPlate = (v: string) => v.replace(/[\s/]+/g, '').toUpperCase()

/** Где документы разошлись: места и брутто точно (до 4 знаков), госномер — без пробелов, «/» и регистра. Одно значение — не сравниваем. */
export function documentsMismatch(check: DocumentsCheck | null | undefined): DocCheckRow[] {
  if (!check) return []
  const out: DocCheckRow[] = []
  for (const key of ['places', 'grossKg', 'plates'] as DocCheckKey[]) {
    const vals = check[key] as Record<(typeof SLOTS)[number], number | string | null> | undefined
    if (!vals) continue
    const present = SLOTS.map((s) => vals[s]).filter((v) => !blank(v))
    const norm = present.map((v) => (typeof v === 'number' ? String(Math.round(v * 10_000)) : normPlate(String(v))))
    if (new Set(norm).size > 1) out.push({ key, cmr: vals.cmr ?? null, invoice: vals.invoice ?? null, packing: vals.packing ?? null })
  }
  return out
}

// ---- Ошибки и подписи ----

export type FromDocsErrorKey = 'busy' | 'tooLarge' | 'service' | 'notFound' | 'invalid' | 'network'
export interface FromDocsError { key: FromDocsErrorKey; params: Record<string, unknown>; text?: string; warnings?: string[] }

/** Ответ сервера → ключ broker.autoTransit.td.fromDocs.error.* (тексты на языке страницы; у 400 — ещё текст сервера). */
export function fromDocsError(e: unknown): FromDocsError {
  const r = (e as { response?: { status?: number; data?: unknown } })?.response
  const d = (r?.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  switch (r?.status) {
    case 503: return { key: 'busy', params: num(d.retryAfterMin) != null ? { min: d.retryAfterMin } : {} }
    case 413: return { key: 'tooLarge', params: num(d.limitMb) != null ? { mb: d.limitMb } : {} }
    case 404: return { key: 'notFound', params: {} }
    case 400: {
      const text = typeof d.error === 'string' && d.error.trim() ? d.error : undefined
      const warnings = Array.isArray(d.warnings) ? d.warnings.filter((x): x is string => typeof x === 'string') : []
      return { key: 'invalid', params: {}, ...(text ? { text } : {}), ...(warnings.length ? { warnings } : {}) }
    }
    case undefined: case 0: return { key: 'network', params: {} }
    default: return { key: 'service', params: {} }
  }
}

/** Подпись поля расхождения: товар — с номером с 1; остальное — ключ с «_» вместо точек (страница ищет его в локали). */
export function conflictKey(field: string): { key: string; n?: number; field?: string } {
  const m = /^goods\[(\d+)\]\.(\w+)$/.exec(field.trim())
  if (m) return { key: 'goodsItem', n: Number(m[1]) + 1, field: m[2]! }
  return { key: field.trim().replace(/[.[\]]+/g, '_').replace(/_$/, '') }
}

