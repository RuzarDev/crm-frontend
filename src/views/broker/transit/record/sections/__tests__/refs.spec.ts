import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type { ClassifierItem } from '@/types/api'

const api = vi.hoisted(() => ({
  listStations: vi.fn(), listCustomsPosts: vi.fn(), listCountries: vi.fn(), listForeignCustomsOffices: vi.fn(),
  listOkeiUnits: vi.fn(), listClassifiers: vi.fn(),
}))
vi.mock('@/api/references', () => ({ referencesApi: api }))

import {
  DEPARTURE_OFFICE_MAX, createRecordRefs, customsPostCode, departureOfficeTooLong, departureOfficeValue,
  provideRecordRefs, useRecordRefs,
} from '../refs'

const POST = '57507 — ТАМОЖЕННЫЙ ПОСТ «АЛТЫНКОЛЬ-ЖОЛ»'

describe('таможня отправления хранит код поста (B.12)', () => {
  it('код — ведущие 5–8 цифр названия', () => {
    expect(customsPostCode(POST)).toBe('57507')
    expect(customsPostCode('5750712 ПОСТ')).toBe('5750712')
    expect(customsPostCode('12345678 — ПОСТ')).toBe('12345678')
    expect(customsPostCode('  57507 — ПОСТ')).toBe('57507')
  })

  it('нет кода — null: меньше 5 цифр, цифры не в начале, пусто', () => {
    expect(customsPostCode('1234 ПОСТ')).toBeNull()
    expect(customsPostCode('ПОСТ 57507')).toBeNull()
    expect(customsPostCode('')).toBeNull()
    expect(customsPostCode(null)).toBeNull()
  })

  it('значение для сохранения: код вместо названия', () => {
    expect(departureOfficeValue(POST)).toEqual({ value: '57507', tooLong: false })
  })

  it('без кода — само название, если помещается в 32 знака', () => {
    expect(departureOfficeValue('КПП Хоргос')).toEqual({ value: 'КПП Хоргос', tooLong: false })
    const exactly32 = 'Я'.repeat(DEPARTURE_OFFICE_MAX)
    expect(departureOfficeValue(exactly32)).toEqual({ value: exactly32, tooLong: false })
  })

  it('без кода и длиннее 32 знаков — ошибка', () => {
    const long = 'ТАМОЖЕННЫЙ ПОСТ «БЕЗ КОДА» ОЧЕНЬ ДЛИННОЕ НАЗВАНИЕ'
    expect(long.length).toBeGreaterThan(DEPARTURE_OFFICE_MAX)
    expect(departureOfficeValue(long)).toEqual({ value: long, tooLong: true })
    expect(departureOfficeTooLong(long)).toBe(true)
    expect(departureOfficeTooLong('57507')).toBe(false)
    expect(departureOfficeTooLong(null)).toBe(false)
    expect(departureOfficeTooLong('')).toBe(false)
  })
})

const cls = (code: string, nameRu: string): ClassifierItem => ({ id: code, classifierCode: 'x', code, nameRu, sortOrder: 0, isActive: true })

describe('справочники страницы', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.listStations.mockResolvedValue([{ id: 's1', name: 'Сарыагаш', isActive: true }])
    api.listCustomsPosts.mockResolvedValue([
      { id: 'p1', name: POST, isActive: true },
      { id: 'p2', name: 'КПП Хоргос', isActive: true },
    ])
    api.listCountries.mockResolvedValue([{ id: 'c1', code: '398', name: 'Казахстан', isActive: true }])
    api.listForeignCustomsOffices.mockResolvedValue([{ id: 'f1', code: '10001', name: 'Хоргос', countryCode: 'CN', isActive: true }])
    api.listOkeiUnits.mockResolvedValue([{ id: 'o1', code: '796', name: 'шт', isActive: true }])
    api.listClassifiers.mockImplementation(async (code: string) => [cls('06', `name ${code}`), cls('2', 'two')])
  })

  it('варианты: пост — по названию, таможня отправления — по коду, страна — «398 — Казахстан»', async () => {
    const refs = createRecordRefs()
    await refs.ensure('posts', 'stations', 'countries', 'foreignOffices', 'okei')
    expect(refs.postOptions.value).toEqual([{ value: POST, label: POST }, { value: 'КПП Хоргос', label: 'КПП Хоргос' }])
    expect(refs.departureOfficeOptions.value).toEqual([{ value: '57507', label: POST }, { value: 'КПП Хоргос', label: 'КПП Хоргос' }])
    expect(refs.stationOptions.value).toEqual([{ value: 'Сарыагаш', label: 'Сарыагаш' }])
    expect(refs.countryOptions.value).toEqual([{ value: '398', label: '398 — Казахстан' }])
    expect(refs.foreignOfficeOptions.value).toEqual([{ value: '10001', label: '10001 — Хоргос (CN)' }])
    expect(refs.okeiOptions.value).toEqual([{ value: '796', label: '796 — шт' }])
    expect(refs.okeiName('796')).toBe('шт')
    expect(refs.okeiName('999')).toBeNull()
    expect(refs.okeiName(null)).toBeNull()
  })

  it('справочники запрашиваются тихо (без тоста при сбое)', async () => {
    const refs = createRecordRefs()
    await refs.ensure('posts', 'stations', 'countries', 'foreignOffices', 'okei')
    for (const f of [api.listStations, api.listCustomsPosts, api.listCountries, api.listForeignCustomsOffices, api.listOkeiUnits]) {
      expect(f).toHaveBeenCalledWith({ silent: true })
    }
  })

  it('каждый справочник грузится один раз на страницу, сколько бы разделов его ни просили', async () => {
    const Section = defineComponent({
      setup() {
        const refs = useRecordRefs()
        void refs.ensure('posts', 'stations', 'countries')
        void refs.ensureClassifiers(['entry-method', 'transport-mode'])
        return () => h('div')
      },
    })
    const Page = defineComponent({
      setup() {
        provideRecordRefs()
        return () => h('div', [h(Section), h(Section)])
      },
    })
    mount(Page)
    await vi.waitFor(() => expect(api.listClassifiers).toHaveBeenCalledTimes(2))
    expect(api.listStations).toHaveBeenCalledTimes(1)
    expect(api.listCustomsPosts).toHaveBeenCalledTimes(1)
    expect(api.listCountries).toHaveBeenCalledTimes(1)
    expect(api.listForeignCustomsOffices).not.toHaveBeenCalled()
    expect(api.listOkeiUnits).not.toHaveBeenCalled()
  })

  it('классификаторы: «код — название», по числовому коду; через общий кэш (повторный запрос не уходит)', async () => {
    const refs = createRecordRefs()
    await refs.ensureClassifiers(['entry-method'])
    await refs.ensureClassifiers(['entry-method'])
    expect(api.listClassifiers).toHaveBeenCalledTimes(1)
    expect(refs.classifierOptions('entry-method')).toEqual([
      { value: '2', label: '2 — two' },
      { value: '06', label: '06 — name entry-method' },
    ])
  })

  it('ошибка справочника не ломает раздел: варианты пустые, остальные справочники живы, повторный запрос возможен', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.listCustomsPosts.mockRejectedValueOnce(new Error('boom'))
    api.listClassifiers.mockRejectedValue(new Error('boom'))
    const refs = createRecordRefs()
    await expect(refs.ensure('posts', 'stations')).resolves.toBeUndefined()
    await expect(refs.ensureClassifiers(['entry-method'])).resolves.toBeUndefined()
    expect(refs.postOptions.value).toEqual([])
    expect(refs.departureOfficeOptions.value).toEqual([])
    expect(refs.classifierOptions('entry-method')).toEqual([])
    expect(refs.stationOptions.value).toHaveLength(1)
    await refs.ensure('posts')
    expect(api.listCustomsPosts).toHaveBeenCalledTimes(2)
    expect(refs.postOptions.value).toHaveLength(2)
  })
})
