import type { UtilizationFee } from '@/api/nationalLists'

// Утильсбор (прил. 4 Методики № 448 в ред. Приказа МЭПР № 54) — строка для КП и себестоимости на языке интерфейса:
// сумма по сверенной ставке; оценка «≈ … — ставка не сверена» (в итоги не идёт); чего не хватает; ставки нет.

type T = (key: string, params?: Record<string, unknown>) => string

/** Коды, за которые платится утильсбор: 8701–8705, 8429, 8433 5x — уборочная техника (как UtilizationFee.CategoryOf). */
export const isUtilizationCode = (code: string | null | undefined): boolean => /^(870[1-5]|8429|84335)/.test((code ?? '').replace(/\D/g, ''))

/** Какие параметры ТС нужны по коду: 8703 (кроме 8703 80 — электро) — объём; 8704 и 8701 2x — масса; прочие 8701 — мощность. */
export function utilizationInputs(code: string | null | undefined): { engineVolume: boolean; mass: boolean; power: boolean } {
  const c = (code ?? '').replace(/\D/g, '')
  return {
    engineVolume: c.startsWith('8703') && !c.startsWith('870380'),
    mass: c.startsWith('8704') || /^87012/.test(c),
    power: c.startsWith('8701') && !/^87012/.test(c),
  }
}

/** «Легковой M1» и т. п. */
export const utilizationCategory = (t: T, category: string): string => t(`utilization.category.${category}`)

/** Строка состояния: «756 875 ₸» / «≈ 4 757 500 ₸ — коэффициент не сверен» / «Не хватает: масса» / «Ставки нет». */
export function utilizationStatusText(t: T, fee: UtilizationFee, money: (n: number) => string): string {
  switch (fee.status) {
    case 'ok': return money(fee.amountKzt ?? 0)
    case 'unverified': return t('utilization.unverified', { sum: money(fee.estimateKzt ?? 0) })
    case 'needInput': return t('utilization.needInput', { list: fee.missing.map((m) => t(`utilization.missing.${m}`)).join(', ') })
    default: return t('utilization.noRate')
  }
}
