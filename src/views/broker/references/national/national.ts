import type { ZTone } from '@/components/z/ZTag.vue'
import type { KzListRow, NationalMeasure, NationalMeasureRequest, NationalMeasureState, UtilizationRateRow } from '@/api/nationalLists'
import { formatActDate } from '@/components/nonTariffMeasures'

// «Справочники → ТН ВЭД → Национальные перечни»: вкладки, подписи состояний и периодов, поиск по перечням, форма меры.

export const P = 'broker.references.national'
type T = (key: string, params?: Record<string, unknown>) => string

export const NATIONAL_TABS = ['measures', 'marking', 'muc', 'utilization'] as const
export type NationalTab = (typeof NATIONAL_TABS)[number]
export const parseTab = (v: unknown): NationalTab =>
  (NATIONAL_TABS as readonly string[]).includes(String(v)) ? (v as NationalTab) : 'measures'

export const STATE_TONE: Record<NationalMeasureState, ZTone> = { active: 'danger', upcoming: 'wait', expired: 'neutral', removed: 'neutral' }

export const d = (iso: string | null | undefined): string => formatActDate(iso) ?? '—'

/** «С 27.07.2026 по 26.01.2027» / «С 27.07.2026, до отмены». */
export const periodText = (t: T, m: Pick<NationalMeasure, 'validFrom' | 'validTo'>): string =>
  m.validTo ? t(`${P}.measures.period`, { from: d(m.validFrom), to: d(m.validTo) }) : t(`${P}.measures.periodOpen`, { from: d(m.validFrom) })

/** «Приказ Министра сельского хозяйства РК № 273 от 11.07.2026». */
export const actText = (t: T, a: { actName: string; actNumber: string; actDate: string | null }): string =>
  a.actDate ? t(`${P}.act`, { name: a.actName, number: a.actNumber, date: d(a.actDate) }) : t(`${P}.actNoDate`, { name: a.actName, number: a.actNumber })

/** Поиск по перечню: код (цифры без пробелов — по началу кода строки) или слово наименования. */
export function filterRows(rows: KzListRow[], query: string): KzListRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  const digits = q.replace(/\s+/g, '')
  if (/^\d+$/.test(digits))
    return rows.filter((r) => {
      const codes = r.codeText.replace(/из\s+/gi, '').split(/[,;]/).map((c) => c.replace(/\D/g, ''))
      return codes.some((c) => c.startsWith(digits) || digits.startsWith(c)) || String(r.number) === digits
    })
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.codeText.toLowerCase().includes(q))
}

/** Строка ставки утильсбора: «свыше 1 000 до 2 000 см³», «электродвигатель», «—». */
export function bandText(t: T, r: Pick<UtilizationRateRow, 'engine' | 'measure' | 'over' | 'upTo'>): string {
  if (r.engine === 'electric') return t(`${P}.util.electric`)
  if (!r.measure) return '—'
  const unit = t(`${P}.util.unit.${r.measure}`)
  const n = (v: number) => new Intl.NumberFormat('ru-RU').format(v).replace(/[  ]/g, ' ')
  if (r.over == null && r.upTo == null) return t(`${P}.util.anyBand`)
  if (r.over == null) return t(`${P}.util.upTo`, { to: n(r.upTo!), unit })
  if (r.upTo == null) return t(`${P}.util.over`, { from: n(r.over), unit })
  return t(`${P}.util.between`, { from: n(r.over), to: n(r.upTo), unit })
}

/** Пустая форма меры: запрет ввоза, действует с сегодняшнего дня (дату ставит окно). */
export const emptyRequest = (): NationalMeasureRequest => ({
  kind: 'ban', direction: 'IN', codeText: '', goods: '', name: '', exceptions: null, note: null,
  actName: '', actNumber: '', actDate: null, actUrl: null, validFrom: null, validTo: null,
})

export const toRequest = (m: NationalMeasure): NationalMeasureRequest => ({
  kind: m.kind, direction: m.direction, codeText: m.codeText, goods: m.goods, name: m.name, exceptions: m.exceptions, note: m.note,
  actName: m.actName, actNumber: m.actNumber, actDate: m.actDate, actUrl: m.actUrl, validFrom: m.validFrom, validTo: m.validTo,
})

/** Проверка формы до отправки (сервер проверяет то же и разбирает коды): поле → ключ ошибки i18n. */
export function validateRequest(r: NationalMeasureRequest): Record<string, string> {
  const e: Record<string, string> = {}
  if (!r.codeText.trim()) e.codeText = 'required'
  if (!r.goods.trim()) e.goods = 'required'
  if (!r.name.trim()) e.name = 'required'
  if (!r.actName.trim()) e.actName = 'required'
  if (!r.actNumber.trim()) e.actNumber = 'required'
  if (!r.validFrom) e.validFrom = 'required'
  if (r.validFrom && r.validTo && r.validTo < r.validFrom) e.validTo = 'beforeStart'
  if (r.actUrl?.trim() && !/^https?:\/\//i.test(r.actUrl.trim())) e.actUrl = 'url'
  return e
}
