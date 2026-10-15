import { describe, expect, it } from 'vitest'
import { dgdLabel, dgdOf, isWarehouseLocation, looksLikeCustomsCode, officeFilter, officeOptions, type PostOption } from '../customsDgd'

const posts: PostOption[] = [
  { value: '50717', label: '50717 — ТАМОЖЕННЫЙ ПОСТ «КУРЫК»', parentCode: '50700', parentName: 'ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ' },
  { value: '50709', label: '50709 — ТАМОЖЕННЫЙ ПОСТ «МОРПОРТ»', parentCode: '50700', parentName: 'ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ' },
  { value: '55302', label: '55302 — ТАМОЖЕННЫЙ ПОСТ «АЛМАТЫ – ЦТО»', parentCode: null },
  { value: '59901', label: '59901 — ТАМОЖЕННЫЙ ПОСТ «ПЕРЕПОДЧИНЁН»', parentCode: '57500', parentName: 'ДГД ПО ОБЛАСТИ ЖЕТІСУ' },
]
const dgds = [{ code: '50700', name: 'ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ' }, { code: '55300', name: 'ДГД ПО ГОРОДУ АЛМАТЫ' }]

describe('customsDgd — ДГД органа гр. 30', () => {
  it('пост → его ДГД из справочника КЕДЕН; ДГД — как есть; неизвестный пост — по виду кода', () => {
    expect(dgdOf('50717', posts, dgds)).toBe('50700')
    expect(dgdOf(' 50700 ', posts, dgds)).toBe('50700')
    expect(dgdOf('59901', posts, dgds)).toBe('57500') // справочник важнее шаблона цифр
    expect(dgdOf('55302', posts, dgds)).toBe('55300') // ДГД не известен — шаблон
    expect(dgdOf('05100098', posts, dgds)).toBe('05100098')
    expect(dgdOf('', posts, dgds)).toBe('')
    expect(dgdOf(null, posts, dgds)).toBe('')
  })

  it('подпись ДГД — из списка ДГД или из поста; неизвестный — только код', () => {
    expect(dgdLabel('50700', posts, dgds)).toBe('50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ')
    expect(dgdLabel('57500', posts, dgds)).toBe('57500 — ДГД ПО ОБЛАСТИ ЖЕТІСУ')
    expect(dgdLabel('59900', posts, dgds)).toBe('59900')
  })

  it('список: каждый ДГД, за ним его посты; ДГД, известные только по постам, тоже есть', () => {
    const opts = officeOptions(posts, dgds)
    expect(opts.map((o) => `${o.kind}:${o.value}`)).toEqual([
      'dgd:50700', 'post:50717', 'post:50709',
      'dgd:55300', 'post:55302',
      'dgd:57500', 'post:59901',
    ])
    expect(opts.find((o) => o.value === '50717')?.dgdLabel).toBe('50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ')
  })

  it('без списка ДГД и без родителей — просто посты', () => {
    const plain: PostOption[] = [{ value: '55302', label: '55302 — А' }]
    expect(officeOptions(plain, []).map((o) => `${o.kind}:${o.value}`)).toEqual(['post:55302'])
  })

  it('поиск по коду и названию ДГД находит и ДГД, и его посты', () => {
    const opts = officeOptions(posts, dgds)
    const found = (q: string) => opts.filter((o) => officeFilter(q, o)).map((o) => String(o.value))
    expect(found('мангист')).toEqual(['50700', '50717', '50709'])
    expect(found('50700')).toEqual(['50700', '50717', '50709'])
    expect(found('курык')).toEqual(['50717'])
  })

  it('пятизначный код органа и коды складов', () => {
    expect(looksLikeCustomsCode(' 50700 ')).toBe(true)
    expect(looksLikeCustomsCode('KZ56VSX00000119')).toBe(false)
    expect(looksLikeCustomsCode('5070')).toBe(false)
    expect(isWarehouseLocation('11')).toBe(true)
    expect(isWarehouseLocation('21')).toBe(true)
    expect(isWarehouseLocation('99')).toBe(false)
    expect(isWarehouseLocation('')).toBe(false)
  })
})
