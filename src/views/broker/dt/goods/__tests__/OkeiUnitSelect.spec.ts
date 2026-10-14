import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { okeiLabel, okeiShort, ensureOkeiUnits, resetOkeiUnits } from '../editor/okei'

const refsApi = vi.hoisted(() => ({
  listOkeiUnits: vi.fn(async () => [
    { id: '1', code: '796', name: 'Штука', shortName: 'ШТ', isActive: true },
    { id: '2', code: '166', name: 'Килограмм', shortName: 'КГ', isActive: true },
    { id: '3', code: '055', name: 'Квадратный метр', shortName: 'М2', isActive: true },
    { id: '4', code: '112', name: 'Литр', shortName: null, isActive: true },
  ]),
}))
vi.mock('@/api/references', () => ({ referencesApi: refsApi }))

import OkeiUnitSelect from '../editor/OkeiUnitSelect.vue'

let w: VueWrapper
const mountSelect = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(OkeiUnitSelect, { props: { value: null, ...props }, attrs: { 'data-f': 'unit' }, attachTo: document.body })
  await flushPromises()
  await nextTick()
}
const input = () => w.get('input')
const open = async () => {
  await input().trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
}
const codes = () => [...document.body.querySelectorAll('[role="option"] [data-okei-option]')].map((e) => e.getAttribute('data-okei-option'))
const search = async (text: string) => {
  await input().setValue(text)
  await nextTick()
}

beforeEach(() => { resetOkeiUnits() })
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

describe('OkeiUnitSelect — выбор единицы ОКЕИ (окно «Единицы измерения» КЕДЕН)', () => {
  it('в списке код, кр. наименование и наименование — по коду; в поле «166 — КГ»; атрибуты на поле ввода', async () => {
    await mountSelect({ value: '166' })
    expect((input().element as HTMLInputElement).value).toBe('166 — КГ')
    expect(input().attributes('data-f')).toBe('unit')
    await open()
    expect(codes()).toEqual(['055', '112', '166', '796'])
    const row = document.body.querySelector('[data-okei-option="055"]')!
    expect(row.textContent).toContain('М2')
    expect(row.textContent).toContain('Квадратный метр')
  })

  it('поиск по коду, наименованию и краткому наименованию', async () => {
    await mountSelect()
    await open()
    await search('16')
    expect(codes()).toEqual(['166'])
    await search('кил')
    expect(codes()).toEqual(['166'])
    await search('м2')
    expect(codes()).toEqual(['055'])
    await search('шт')
    expect(codes()).toEqual(['796'])
    await search('zzz')
    expect(document.body.textContent).toContain('Единица не найдена')
  })

  it('выбор — код (update:value) и единица (change); очистка — null', async () => {
    await mountSelect()
    await open()
    ;(document.body.querySelector('[data-okei-option="796"]')!.closest('[role="option"]') as HTMLElement).click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual(['796'])
    expect(w.emitted('change')?.at(-1)).toEqual([{ code: '796', name: 'Штука', shortName: 'ШТ' }])
    await w.setProps({ value: '796' })
    await w.get('button[aria-label]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([null])
  })

  it('codes — только эти единицы; код не из справочника остаётся выбранным и виден', async () => {
    await mountSelect({ value: '999', codes: ['796', '166'] })
    expect((input().element as HTMLInputElement).value).toBe('999')
    await open()
    expect(codes()).toEqual(['999', '166', '796'])
  })

  it('подписи ДЕИ: код и кр. наименование, без краткого — наименование, без справочника — из товара', async () => {
    expect(okeiLabel('796', 'шт')).toBe('796 — шт')
    await ensureOkeiUnits()
    expect(okeiLabel('796', 'шт')).toBe('796 — ШТ')
    expect(okeiShort('055')).toBe('М2')
    expect(okeiLabel('112')).toBe('112 — Литр')
    expect(okeiLabel('')).toBe('')
  })
})
