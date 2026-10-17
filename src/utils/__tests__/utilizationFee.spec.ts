import { describe, expect, it } from 'vitest'
import type { UtilizationFee } from '@/api/nationalLists'
import { isUtilizationCode, utilizationInputs, utilizationStatusText } from '../utilizationFee'

const t = (k: string, p?: Record<string, unknown>) => `${k}${p ? JSON.stringify(p) : ''}`
const fee = (p: Partial<UtilizationFee>): UtilizationFee => ({
  status: 'ok', category: 'M1', measure: 'cm3', over: 1000, upTo: 2000, fromRbRf: false, coefficient: 3.5, baseRateKzt: 216250, units: 1,
  amountKzt: 756875, estimateKzt: null, missing: [], text: '', note: null, ...p,
})

describe('utilizationFee', () => {
  it('коды под утильсбором: 8701–8705, 8429, 8433 5x', () => {
    expect(['8703231981', '8701941000', '8705100009', '8429521000', '8433510001', '8433590000', '8433900000', '8433110000', '8706001100', '8471300000', ''].map(isUtilizationCode))
      .toEqual([true, true, true, true, true, true, false, false, false, false, false])
  })

  it('какие параметры ТС спрашивать по коду', () => {
    expect(utilizationInputs('8703231981')).toEqual({ engineVolume: true, mass: false, power: false })
    expect(utilizationInputs('8703800002')).toEqual({ engineVolume: false, mass: false, power: false })
    expect(utilizationInputs('8704219100')).toEqual({ engineVolume: false, mass: true, power: false })
    expect(utilizationInputs('8701219000')).toEqual({ engineVolume: false, mass: true, power: false })
    expect(utilizationInputs('8701941000')).toEqual({ engineVolume: false, mass: false, power: true })
  })

  it('строка состояния: сумма, оценка «не сверено», чего не хватает, ставки нет', () => {
    const money = (n: number) => `${n} ₸`
    expect(utilizationStatusText(t, fee({}), money)).toBe('756875 ₸')
    expect(utilizationStatusText(t, fee({ status: 'unverified', amountKzt: null, estimateKzt: 10 }), money)).toBe('utilization.unverified{"sum":"10 ₸"}')
    expect(utilizationStatusText(t, fee({ status: 'needInput', missing: ['mass', 'country'] }), money))
      .toBe('utilization.needInput{"list":"utilization.missing.mass, utilization.missing.country"}')
    expect(utilizationStatusText(t, fee({ status: 'noRate' }), money)).toBe('utilization.noRate')
  })
})
