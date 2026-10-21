import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import {
  adoptKizDefaults, deriveKizDefaults, emptyKizDefaults, hasKizState, isCustomMarking, kizDefaultsEmpty, kizFollowers, kizState,
  markingFromDefaults, resetKizState, resetMarkingToDefaults, sameValue, setKizAfterRelease, setKizDefault,
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
})
