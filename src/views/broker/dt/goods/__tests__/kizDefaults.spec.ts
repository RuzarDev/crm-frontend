import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import {
  adoptKizDefaults, customFields, deriveKizDefaults, emptyKizDefaults, hasKizState, isCustomMarking, isKizCarrier, kizDefaultsEmpty,
  kizFollowers, kizState, markingFromDefaults, removeKizRow, resetKizState, resetMarkingToDefaults, sameValue, setKizAfterRelease,
  setKizDefault, setKizNumber,
} from '../editor/kizDefaults'

// КИЗ гр. 31.13 (правка №12): общие значения «Для всех кодов» выводятся из строк и в сеансе живут по объекту товара.
const row = (o: Partial<Import40GoodsMarking>): Import40GoodsMarking => ({
  markingAfterRelease: false, kizCount: 1, levelCode: '0', idTypeCode: '999', idApplicationCode: '01', number: null, aggregated: false, ...o,
})
const goods = (markings: Import40GoodsMarking[] = []) => reactive({ description: 'ОБУВЬ', markings } as unknown as Import40GoodsItemInput)

beforeEach(() => resetKizState())

describe('deriveKizDefaults', () => {
  it('самое частое значение каждого поля среди строк с номером; при равенстве — из более ранней строки', () => {
    const d = deriveKizDefaults([
      row({ number: 'A', levelCode: '1', kizCount: 5 }),
      row({ number: 'B', levelCode: '0', kizCount: 1 }),
      row({ number: 'C', levelCode: '0', kizCount: 5 }),
      row({ number: null, levelCode: '3', kizCount: 7 }),
      row({ number: null, levelCode: '3', kizCount: 7 }),
      row({ number: null, levelCode: '3', kizCount: 7 }),
    ])
    expect(d).toMatchObject({ levelCode: '0', kizCount: 5, idApplicationCode: '01', idTypeCode: '999', aggregated: false })
    // Равенство 1:1 — побеждает ранняя строка.
    expect(deriveKizDefaults([row({ number: 'A', idTypeCode: '301' }), row({ number: 'B', idTypeCode: '101' })]).idTypeCode).toBe('301')
  })

  it('номеров нет ни в одной строке — считаются все; «после выпуска» — есть хоть у одной; пустой список — пусто', () => {
    expect(deriveKizDefaults([row({ levelCode: '2' }), row({ levelCode: '2', markingAfterRelease: true })]))
      .toMatchObject({ levelCode: '2', afterRelease: true })
    expect(deriveKizDefaults([])).toEqual(emptyKizDefaults())
    // '' и undefined — пусто.
    expect(deriveKizDefaults([{ number: 'X', levelCode: '' }, { number: 'Y' }])).toMatchObject({ levelCode: null, kizCount: null, aggregated: false })
  })
})

describe('sameValue / isCustomMarking / markingFromDefaults', () => {
  it('пустые равны, булевы — через !!', () => {
    expect(sameValue('', null)).toBe(true)
    expect(sameValue(undefined, null)).toBe(true)
    expect(sameValue(null, false)).toBe(true)
    expect(sameValue(0, null)).toBe(false)
    expect(sameValue('01', '1')).toBe(false)
  })

  it('строка со своими значениями отличается от общих; новая — с общими значениями и номером', () => {
    const d = deriveKizDefaults([row({ number: 'A' })])
    expect(isCustomMarking(row({ number: 'B' }), d)).toBe(false)
    expect(isCustomMarking(row({ number: 'B', levelCode: '1' }), d)).toBe(true)
    expect(isCustomMarking({ number: 'B', levelCode: '0', idTypeCode: '999', idApplicationCode: '01', kizCount: 1 }, d)).toBe(false)
    expect(markingFromDefaults(d, '4871813090801')).toEqual(row({ number: '4871813090801' }))
    expect(markingFromDefaults(emptyKizDefaults())).toEqual({
      markingAfterRelease: false, kizCount: null, levelCode: null, idTypeCode: null, idApplicationCode: null, number: null, aggregated: false,
    })
    expect(kizDefaultsEmpty(emptyKizDefaults())).toBe(true)
    expect(kizDefaultsEmpty(d)).toBe(false)
  })

  it('ревью: строка без номера — без количества КИЗ (в XML CIMQuantity — сумма по всем строкам) и не «свои значения»', () => {
    const d = deriveKizDefaults([row({ number: 'A' })])
    const blankRow = markingFromDefaults(d)
    expect(blankRow).toMatchObject({ number: null, kizCount: null, levelCode: '0', idApplicationCode: '01', idTypeCode: '999' })
    expect(isCustomMarking(blankRow, d)).toBe(false)
    // Строка без номера, но со своим количеством (старые ДТ) — своё значение.
    expect(customFields(row({ number: null, kizCount: 500 }), d)).toEqual(['kizCount'])
  })
})

describe('setKizNumber', () => {
  it('номер появился — количество из общих значений; стёрт — снято; своё количество и ручная правка — не трогаются', () => {
    const g = goods([row({ number: 'A' }), row({ number: null, kizCount: null }), row({ number: null, kizCount: 7 })])
    const [, b, c] = g.markings!
    setKizNumber(g, b, 'B')
    expect([b.number, b.kizCount]).toEqual(['B', 1])
    setKizNumber(g, b, '')
    expect([b.number, b.kizCount]).toEqual([null, null])
    setKizNumber(g, c, 'C')
    expect(c.kizCount).toBe(7)
    // Изменено вручную — при стирании номера не снимается.
    setKizNumber(g, b, 'B')
    kizState(g).markOverride(b, 'kizCount')
    setKizNumber(g, b, ' ')
    expect([b.number, b.kizCount]).toEqual([null, 1])
  })
})

describe('setKizDefault', () => {
  it('меняет только строки со старым значением и без ручной правки; возвращает число изменённых', () => {
    const g = goods([row({ number: 'A' }), row({ number: 'B' }), row({ number: 'C', levelCode: '2' }), row({ number: 'D' })])
    const st = kizState(g)
    expect(st.defaults.levelCode).toBe('0')
    st.markOverride(g.markings![1], 'levelCode')
    expect(setKizDefault(g, 'levelCode', '1')).toBe(2)
    expect(g.markings!.map((m) => m.levelCode)).toEqual(['1', '0', '2', '1'])
    expect(st.defaults.levelCode).toBe('1')
    // То же значение — ничего не меняется.
    expect(setKizDefault(g, 'levelCode', '1')).toBe(0)
  })

  it('набор по цифре: строки, следовавшие общему значению до набора; своё «2» промежуточное «2» не захватывает', () => {
    const g = goods([row({ number: 'A' }), row({ number: 'B', kizCount: 2 }), row({ number: 'C' })])
    const followers = kizFollowers(g, 'kizCount')
    expect(followers.map((m) => m.number)).toEqual(['A', 'C'])
    expect(setKizDefault(g, 'kizCount', 2, followers)).toBe(2)
    expect(setKizDefault(g, 'kizCount', 20, followers)).toBe(2)
    expect(g.markings!.map((m) => m.kizCount)).toEqual([20, 2, 20])
    // Удалённая за время набора строка не возвращается.
    g.markings!.splice(0, 1)
    expect(setKizDefault(g, 'kizCount', 25, followers)).toBe(1)
  })

  it('«Как у всех» возвращает общие значения и снимает ручную правку', () => {
    const g = goods([row({ number: 'A' }), row({ number: 'B' })])
    const st = kizState(g)
    g.markings![1].kizCount = 10
    st.markOverride(g.markings![1], 'kizCount')
    expect(setKizDefault(g, 'kizCount', 2)).toBe(1)
    expect(g.markings!.map((m) => m.kizCount)).toEqual([2, 10])
    resetMarkingToDefaults(g, g.markings![1])
    expect(g.markings![1].kizCount).toBe(2)
    expect(st.overridden(g.markings![1], 'kizCount')).toBe(false)
    expect(setKizDefault(g, 'kizCount', 3)).toBe(2)
  })

  it('ревью: «0 → 1 → 0» (промах) не переписывает строку, у которой «1» было своим при открытии ДТ', () => {
    const g = goods([row({ number: 'A' }), row({ number: 'B' }), row({ number: 'C', levelCode: '1' })])
    expect(kizState(g).defaults.levelCode).toBe('0')
    expect(setKizDefault(g, 'levelCode', '1')).toBe(2)
    expect(g.markings!.map((m) => m.levelCode)).toEqual(['1', '1', '1'])
    expect(setKizDefault(g, 'levelCode', '0')).toBe(2)
    expect(g.markings!.map((m) => m.levelCode)).toEqual(['0', '0', '1'])
    expect(isCustomMarking(g.markings![2], kizState(g).defaults)).toBe(true)
  })

  it('ревью: общее количество не задаётся строкам без номера', () => {
    const g = goods([row({ number: 'A' }), row({ number: null, kizCount: null }), row({ number: null, kizCount: 500 })])
    expect(kizFollowers(g, 'kizCount').map((m) => m.number)).toEqual(['A'])
    expect(setKizDefault(g, 'kizCount', 2)).toBe(1)
    expect(g.markings!.map((m) => m.kizCount)).toEqual([2, null, 500])
    // Строка без номера получила номер — уже новое общее количество.
    setKizNumber(g, g.markings![1], 'B')
    expect(g.markings![1].kizCount).toBe(2)
    // «Как у всех» строке без номера — без количества.
    resetMarkingToDefaults(g, g.markings![2])
    expect(g.markings![2].kizCount).toBeNull()
  })

  it('агрегированная: null/undefined в строке = «нет»', () => {
    const g = goods([{ number: 'A', levelCode: '0' }, { number: 'B', levelCode: '0', aggregated: null }])
    expect(setKizDefault(g, 'aggregated', true)).toBe(2)
    expect(g.markings!.map((m) => m.aggregated)).toEqual([true, true])
  })

  it('состояние — по объекту товара: тот же товар — те же общие значения, другой — свои', () => {
    const a = goods([row({ number: 'A' })])
    const b = goods([row({ number: 'B', levelCode: '2' })])
    setKizDefault(a, 'idTypeCode', '301')
    expect(kizState(a).defaults.idTypeCode).toBe('301')
    expect(kizState(b).defaults.levelCode).toBe('2')
    expect(hasKizState(a)).toBe(true)
    // Новый объект с теми же строками (загрузка, «Отменить» из клонов) — значения выводятся заново.
    const a2 = goods(a.markings!.map((m) => ({ ...m })))
    expect(hasKizState(a2)).toBe(false)
    expect(kizState(a2).defaults.idTypeCode).toBe('301')
  })
})

describe('setKizAfterRelease', () => {
  it('пустой список: включение создаёт строку-носитель без номера, выключение её убирает', () => {
    const g = goods([])
    setKizAfterRelease(g, true)
    expect(g.markings).toEqual([expect.objectContaining({ number: null, markingAfterRelease: true })])
    setKizAfterRelease(g, false)
    expect(g.markings).toEqual([])
  })

  it('ревью: выключение убирает только носитель, созданный признаком, — строку, добавленную «+», не трогает', () => {
    const g = goods([row({ number: null, levelCode: '1' })])
    setKizAfterRelease(g, true)
    setKizAfterRelease(g, false)
    expect(g.markings).toEqual([expect.objectContaining({ number: null, levelCode: '1', markingAfterRelease: false })])
    // Носитель получил номер — остаётся.
    const h = goods([])
    setKizAfterRelease(h, true)
    h.markings![0].number = 'A'
    setKizAfterRelease(h, false)
    expect(h.markings).toHaveLength(1)
  })

  it('ДТ открыта с «после выпуска» и одной строкой без номера — это носитель: снять признак — строка уходит', () => {
    const g = goods([row({ number: null, markingAfterRelease: true })])
    expect(isKizCarrier(g, g.markings![0])).toBe(true)
    setKizAfterRelease(g, false)
    expect(g.markings).toEqual([])
  })

  it('ревью: удалили последнюю строку при «после выпуска» — вместо пустого списка носитель, признак в данных остаётся', () => {
    const g = goods([row({ number: 'A' })])
    setKizAfterRelease(g, true)
    removeKizRow(g, g.markings![0])
    expect(g.markings).toEqual([expect.objectContaining({ number: null, markingAfterRelease: true })])
    expect(isKizCarrier(g, g.markings![0])).toBe(true)
    expect(kizState(g).defaults.afterRelease).toBe(true)
    // Без признака — просто удаление.
    const h = goods([row({ number: 'A' })])
    removeKizRow(h, h.markings![0])
    expect(h.markings).toEqual([])
  })

  it('есть строки: признак ставится и снимается у всех, строки с номером остаются', () => {
    const g = goods([row({ number: 'A' }), row({ number: 'B' })])
    setKizAfterRelease(g, true)
    expect(g.markings!.every((m) => m.markingAfterRelease)).toBe(true)
    expect(kizState(g).defaults.afterRelease).toBe(true)
    setKizAfterRelease(g, false)
    expect(g.markings!.map((m) => [m.number, m.markingAfterRelease])).toEqual([['A', false], ['B', false]])
  })
})

describe('adoptKizDefaults', () => {
  it('копирует общие значения товару без строк и без своего состояния, иначе не трогает', () => {
    const src = deriveKizDefaults([row({ number: 'A', levelCode: '1' })])
    const empty = goods([])
    adoptKizDefaults(empty, src)
    expect(kizState(empty).defaults.levelCode).toBe('1')
    const own = goods([row({ number: 'B', levelCode: '3' })])
    adoptKizDefaults(own, src)
    expect(kizState(own).defaults.levelCode).toBe('3')
  })

  it('ревью: «после выпуска» другому товару не копируется', () => {
    const empty = goods([])
    adoptKizDefaults(empty, { ...deriveKizDefaults([row({ number: 'A' })]), afterRelease: true })
    expect(kizState(empty).defaults).toMatchObject({ levelCode: '0', afterRelease: false })
  })
})
