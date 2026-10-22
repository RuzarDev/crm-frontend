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

// Единица, введённая текстом (ячейка таблицы строк, вставка из Excel): «ШТ», «шт.», «М2», «м²», «796», «PCS», «Килограмм».
// Латинские двойники кириллицы (M, K, T…) сравниваются как кириллица; частые латинские обозначения — по таблице ниже.
const LATIN_ALIASES: Record<string, string> = {
  PCS: '796', PC: '796', PCE: '796', EA: '796', ШТУК: '796', ШТУКИ: '796', ШТУКА: '796',
  KG: '166', KGS: '166', G: '163', GR: '163', T: '168', TN: '168', TNE: '168',
  L: '112', LTR: '112', M: '006', MTR: '006', M2: '055', SQM: '055', MTK: '055', M3: '113', CBM: '113', MTQ: '113',
  PR: '715', PAIR: '715', PAIRS: '715', SET: '839', SETS: '839',
  // Частые русские краткие — и когда справочник ОКЕИ не загрузился (импорт из Excel, пакет 21.10).
  ШТ: '796', ПАР: '715', ПАРА: '715', ПАРЫ: '715', КГ: '166', Л: '112', М2: '055', М3: '113', КОМПЛ: '839', КОМПЛЕКТ: '839',
  // Иероглифы китайских инвойсов (Импорт 2.0): 台/个/件/只/支/把/张 — штука, 双/对 — пара, 套 — комплект, 米 — метр,
  // 千克/公斤 — кг, 吨 — тонна, 升 — литр, 平方米 — м², 立方米 — м³.
  台: '796', 个: '796', 件: '796', 只: '796', 支: '796', 把: '796', 张: '796', 双: '715', 对: '715', 套: '839',
  米: '006', 千克: '166', 公斤: '166', 吨: '168', 升: '112', 平方米: '055', 立方米: '113',
}
const LOOKALIKE: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' }
const unitKey = (s: string) => s.toLocaleUpperCase('ru-RU').replace(/[\s.]/g, '').replace(/²/g, '2').replace(/³/g, '3')
const cyr = (s: string) => s.replace(/[ABCEHKMOPTXY]/g, (ch) => LOOKALIKE[ch] ?? ch)

/**
 * Код ОКЕИ по тексту: код (1–3 цифры, «55» → «055»), краткое наименование, наименование или латинское обозначение.
 * Не распознано — null. Справочник загружен — код должен в нём быть; не загружен — код и латинские обозначения как есть.
 */
export function okeiFromText(text: string | null | undefined): string | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const whole = okeiOne(raw)
  if (whole) return whole
  // Двуязычная единица «台 ⏎ шт», «件/pcs», «米 m» (инвойс 39th, 22.10.2026): целиком не узнана — каждая часть по
  // отдельности, первая узнанная («Квадратный метр» узнаётся целиком и на «метр» не распадается).
  const parts = raw.split(/[\n\r/|]+|\s+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  for (const p of parts) {
    const code = okeiOne(p)
    if (code) return code
  }
  return null
}

function okeiOne(raw: string): string | null {
  const loaded = byCode.value.size > 0
  const known = (code: string) => (!loaded || byCode.value.has(code) ? code : null)
  if (/^\d{1,3}$/.test(raw)) return known(okeiCode(raw))
  const key = unitKey(raw)
  if (!key) return null
  const k = cyr(key)
  for (const u of okeiUnits.value) if (u.shortName && cyr(unitKey(u.shortName)) === k) return u.code
  for (const u of okeiUnits.value) if (cyr(unitKey(u.name)) === k) return u.code
  const alias = LATIN_ALIASES[key]
  return alias ? known(alias) : null
}

/** Для тестов. */
export function resetOkeiUnits(): void {
  okeiUnits.value = []
  byCode.value = new Map()
  loading = null
}
