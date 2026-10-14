// Единицы ОКЕИ (классификатор ЕЭК 2016) для ДТ: ДЕИ гр. 41 («055 — М2») и выбор единицы (OkeiUnitSelect — как окно
// «Единицы измерения» КЕДЕН: код, наименование, кр. наименование). Справочник грузится один раз на сессию и тихо;
// без справочника поля показывают код и наименование из товара.
import { shallowRef } from 'vue'
import { referencesApi } from '@/api/references'
import type { RefOkeiUnit } from '@/types/api'

export interface OkeiUnit {
  code: string
  name: string
  shortName: string | null
}

/** Список единиц (по коду) — для окна выбора. Пустой, пока справочник не загружен. */
export const okeiUnits = shallowRef<readonly OkeiUnit[]>([])
const byCode = shallowRef<ReadonlyMap<string, OkeiUnit>>(new Map())
let loading: Promise<void> | null = null

export function ensureOkeiUnits(): Promise<void> {
  if (!loading) {
    loading = Promise.resolve()
      .then(() => referencesApi.listOkeiUnits({ silent: true }))
      .then((list: RefOkeiUnit[]) => {
        const units = list
          .filter((u) => u.isActive !== false && u.code)
          .map((u) => ({ code: okeiCode(u.code), name: u.name, shortName: u.shortName?.trim() || null }))
          .sort((a, b) => a.code.localeCompare(b.code))
        okeiUnits.value = units
        byCode.value = new Map(units.map((u) => [u.code, u]))
      })
      .catch((e) => {
        console.error('Failed to load OKEI units', e)
        loading = null // следующий товар попробует снова
      })
  }
  return loading
}

/** Код ОКЕИ — три цифры с ведущими нулями («55» → «055», «6» → «006»), как в классификаторе ЕЭК 2016 и КЕДЕН. */
export function okeiCode(code: string | null | undefined): string {
  const c = (code ?? '').trim()
  return /^\d{1,2}$/.test(c) ? c.padStart(3, '0') : c
}
const norm = okeiCode

/** Единица по коду ОКЕИ; нет в справочнике (или не загрузился) — null. */
export const okeiUnit = (code: string | null | undefined): OkeiUnit | null => byCode.value.get(norm(code)) ?? null

/** Наименование единицы по коду ОКЕИ; нет в справочнике (или не загрузился) — null. */
export const okeiName = (code: string | null | undefined): string | null => okeiUnit(code)?.name ?? null

/** Краткое наименование («КГ», «М2»); нет — null. */
export const okeiShort = (code: string | null | undefined): string | null => okeiUnit(code)?.shortName ?? null

/** Подпись «055 — М2»: код и краткое наименование (нет краткого — наименование; нет в справочнике — fallback). */
export function okeiLabel(code: string | null | undefined, fallback?: string | null): string {
  const c = norm(code)
  if (!c) return ''
  const u = okeiUnit(c)
  const name = u?.shortName || u?.name || (fallback ?? '').trim()
  return name ? `${c} — ${name}` : c
}

/** Для тестов. */
export function resetOkeiUnits(): void {
  okeiUnits.value = []
  byCode.value = new Map()
  loading = null
}
