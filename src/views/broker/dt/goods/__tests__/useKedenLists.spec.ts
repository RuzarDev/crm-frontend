import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: api }))

import { pinPreferences, resetKedenLists, useKedenLists } from '../useKedenLists'

const LISTS = {
  ИМ40: { 'pref-fee': ['ОО', 'МД'], 'pref-duty': ['ОО', 'Z', 'БГ'], prev: ['00', '51'], 'movement-features': ['000', '001'] },
  ИМ53: { 'pref-fee': ['ОО'], prev: ['00'] },
  ЭК10: { 'pref-excise': ['Z'] },
}
const opts = (...codes: string[]) => codes.map((c) => ({ value: c, label: `${c} — ${c}` }))

const scope = effectScope()
beforeEach(() => {
  resetKedenLists()
  api.get.mockReset().mockResolvedValue(LISTS)
})
afterEach(() => vi.clearAllMocks())

describe('useKedenLists', () => {
  it('ключ = направление гр. 1 + 2 цифры процедуры; сужает поле и оставляет текущий код вне списка', async () => {
    const src = ref({ direction: 'ИМ', procedure: '40' })
    const kl = scope.run(() => useKedenLists(src))!
    await flushPromises()
    expect(kl.key.value).toBe('ИМ40')
    expect(kl.keyLabel.value).toBe('ИМ 40')
    expect(kl.narrowed.value).toBe(true)
    expect(kl.narrow('pref-fee', opts('ОО', 'МД', 'ПП', 'ТХ'), null).map((o) => o.value)).toEqual(['ОО', 'МД'])
    // Выбранный вне списка — остаётся (не удаляется) и помечается.
    expect(kl.narrow('pref-fee', opts('ОО', 'МД', 'ПП', 'ТХ'), 'ПП').map((o) => o.value)).toEqual(['ОО', 'МД', 'ПП'])
    expect(kl.offList('pref-fee', 'ПП')).toBe(true)
    expect(kl.offList('pref-fee', 'МД')).toBe(false)
    expect(kl.offList('pref-fee', null)).toBe(false)
    // Поля, которого нет в списке сочетания, — не сужаем.
    expect(kl.narrow('pref-vat', opts('ОО', 'ТТ'), null)).toHaveLength(2)
    // Другая процедура — другой список.
    src.value = { direction: 'ИМ', procedure: '5300' }
    await nextTick()
    expect(kl.key.value).toBe('ИМ53')
    expect(kl.narrow('prev', opts('00', '51', '40'), null).map((o) => o.value)).toEqual(['00'])
  })

  it('сочетания нет в списках — без сужения и без подсветки; без процедуры ключа нет', async () => {
    const src = ref({ direction: 'ИМ', procedure: '60' as string | null })
    const kl = scope.run(() => useKedenLists(src))!
    await flushPromises()
    expect(kl.narrowed.value).toBe(false)
    expect(kl.narrow('pref-fee', opts('ОО', 'ПП'), 'ПП')).toHaveLength(2)
    expect(kl.offList('pref-fee', 'ПП')).toBe(false)
    src.value = { direction: 'ИМ', procedure: null }
    await nextTick()
    expect(kl.key.value).toBeNull()
  })

  it('гр. 37 процедура (K2): только процедуры, для которых у направления есть списки; 4-значная — по первым 2 цифрам', async () => {
    const kl = scope.run(() => useKedenLists(() => ({ direction: 'ИМ', procedure: '40' })))!
    await flushPromises()
    expect(kl.narrow('procedure', opts('10', '40', '53', '60'), null).map((o) => o.value)).toEqual(['40', '53'])
    expect(kl.offList('procedure', '10')).toBe(true)
    expect(kl.offList('procedure', '4000')).toBe(false)
    const ek = scope.run(() => useKedenLists(() => ({ direction: 'эк', procedure: '10' })))!
    expect(ek.narrow('procedure', opts('10', '40'), null).map((o) => o.value)).toEqual(['10'])
    expect(ek.narrow('pref-excise', opts('Z', 'О', 'Б'), null).map((o) => o.value)).toEqual(['Z'])
  })

  it('один запрос на сессию; ошибка — молча, полный список, без повторов', async () => {
    api.get.mockRejectedValue(new Error('boom'))
    const a = scope.run(() => useKedenLists(() => ({ direction: 'ИМ', procedure: '40' })))!
    const b = scope.run(() => useKedenLists(() => ({ direction: 'ИМ', procedure: '40' })))!
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(a.narrow('pref-fee', opts('ОО', 'ПП'), null)).toHaveLength(2)
    expect(b.offList('pref-fee', 'ПП')).toBe(false)
    expect(a.narrowed.value).toBe(false)
  })

  it('текущий код, которого нет и в справочнике, — пунктом «как есть»', async () => {
    const kl = scope.run(() => useKedenLists(() => ({ direction: 'ИМ', procedure: '40' })))!
    await flushPromises()
    expect(kl.narrow('pref-fee', opts('ОО'), 'XX')[0]).toEqual({ value: 'XX', label: 'XX' })
  })

  it('pinPreferences: «ОО, О, Z» сверху, остальное по коду', () => {
    expect(pinPreferences(opts('ТХ', 'Z', 'АЗ', 'О', 'ОО', 'БГ')).map((o) => o.value)).toEqual(['ОО', 'О', 'Z', 'АЗ', 'БГ', 'ТХ'])
  })
})
