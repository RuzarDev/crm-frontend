import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrDoc44ItemInput } from '@/types/api'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import SectionDoc44 from '../SectionDoc44.vue'
import { SelectStub, emptyDraft, primeRefs, refsApi } from './harness'

const doc = (o: Partial<ReestrDoc44ItemInput> = {}): ReestrDoc44ItemInput => ({
  docTypeCode: null, docTypeName: null, docNumber: null, docDate: null, authorizedBody: null, authorizedBodyId: null, formBlankNumber: null, ...o,
})

let w: VueWrapper
const mount = async (docs: ReestrDoc44ItemInput[], o: { readonly?: boolean; stubSelect?: boolean; extended?: boolean } = {}) => {
  const draft = emptyDraft()
  draft.doc44.splice(0, draft.doc44.length, ...docs)
  w = mountWithI18n(SectionDoc44, {
    props: { draft, readonly: o.readonly ?? false, ...(o.extended === undefined ? {} : { extended: o.extended }) },
    attachTo: document.body,
    global: { stubs: o.stubSelect === false ? {} : { ZSelect: SelectStub } },
  })
  await flushPromises()
  return draft
}
const rows = () => w.findAll('[data-doc44-row]')
const f = (key: string, i = 0) => rows()[i].get(`[data-f="${key}"]`)
const type = async (key: string, text: string, i = 0) => {
  const el = f(key, i)
  ;(el.element as HTMLInputElement).value = text
  await el.trigger('input')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  primeRefs()
  refsApi.listClassifiers.mockImplementation(async (code: string) => code === '2009'
    ? [
        { id: '1', classifierCode: '2009', code: '04021', nameRu: 'Инвойс (счёт-фактура)', sortOrder: 0, isActive: true },
        { id: '2', classifierCode: '2009', code: '02015', nameRu: 'CMR', sortOrder: 0, isActive: true },
      ]
    : [])
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('SectionDoc44', () => {
  it('шапка «Документы гр. 44 n», колонки таблицы; пусто — текст', async () => {
    await mount([])
    expect(w.get('section#sec-doc44 h2').text()).toBe('Документы гр. 44')
    expect(w.get('[data-section-count]').text()).toBe('0')
    expect(w.get('[data-doc44-empty]').text()).toBe('Документов пока нет')
    await mount([doc()])
    expect(w.get('[data-doc44-head]').text()).toBe('КодВид документаНомерДата')
  })

  it('выбор кода по классификатору 2009 подставляет вид документа; вид, номер, дата правятся', async () => {
    const d = await mount([doc()])
    expect(f('docTypeCode').get('[data-option="04021"]').text()).toBe('04021')
    await f('docTypeCode').get('[data-option="04021"]').trigger('click')
    expect(d.doc44[0]).toMatchObject({ docTypeCode: '04021', docTypeName: 'Инвойс (счёт-фактура)' })
    await type('docTypeName', 'Инвойс № 1')
    await type('docNumber', 'LNV-2026-0912')
    expect(d.doc44[0]).toMatchObject({ docTypeName: 'Инвойс № 1', docNumber: 'LNV-2026-0912' })
    expect(f('docNumber').classes().join(' ') + f('docNumber').element.className).toContain('font-mono')
    await type('docDate', '12.09.2026')
    await f('docDate').trigger('keydown', { key: 'Enter' })
    expect(d.doc44[0].docDate).toBe('2026-09-12')
  })

  it('в поле кода — только код (вид рядом), в списке — «код — вид»; поиск по названию', async () => {
    await mount([doc({ docTypeCode: '04021', docTypeName: 'Инвойс (счёт-фактура)' })], { stubSelect: false })
    const input = f('docTypeCode').element as HTMLInputElement
    expect(input.value).toBe('04021')
    input.focus()
    await f('docTypeCode').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    const items = [...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())
    expect(items).toEqual(['02015 — CMR', '04021 — Инвойс (счёт-фактура)'])
    input.value = 'инвойс'
    await f('docTypeCode').trigger('input')
    await flushPromises()
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())).toEqual(['04021 — Инвойс (счёт-фактура)'])
  })

  it('у свёрнутого «Ещё» — число заполненных полей', async () => {
    await mount([doc({ authorizedBody: 'КГД', formBlankNumber: 'Б-7' }), doc()])
    expect(rows()[0].get('[data-doc44-more-count]').text()).toBe('2')
    expect(rows()[0].get('[data-doc44-more]').attributes('aria-label')).toBe('Ещё по документу 1, заполнено: 2')
    expect(rows()[1].find('[data-doc44-more-count]').exists()).toBe(false)
    expect(rows()[1].get('[data-doc44-more]').attributes('aria-label')).toBe('Ещё по документу 2')
  })

  it('«Ещё» раскрывает уполномоченный орган, ИД органа, номер бланка — и пишет их в строку', async () => {
    const d = await mount([doc({ docTypeCode: '02015' })])
    expect(rows()[0].find('[data-f="authorizedBody"]').exists()).toBe(false)
    const more = rows()[0].get('[data-doc44-more]')
    expect(more.attributes('aria-expanded')).toBe('false')
    await more.trigger('click')
    expect(more.attributes('aria-expanded')).toBe('true')
    await type('authorizedBody', 'КГД МФ РК')
    await type('authorizedBodyId', 'KGD-01')
    await type('formBlankNumber', 'A 0045871')
    expect(d.doc44[0]).toEqual(doc({ docTypeCode: '02015', authorizedBody: 'КГД МФ РК', authorizedBodyId: 'KGD-01', formBlankNumber: 'A 0045871' }))
    await type('authorizedBody', '')
    expect(d.doc44[0].authorizedBody).toBeNull()
  })

  it('«Действует с / по» и «Страна выдачи» не показываются (сервер их не хранит)', async () => {
    await mount([doc()])
    await rows()[0].get('[data-doc44-more]').trigger('click')
    expect(w.text()).not.toMatch(/Действует|Страна выдачи|Файл документа/)
    for (const k of ['docStartDate', 'docValidityDate', 'issueCountryCode']) expect(w.find(`[data-f="${k}"]`).exists()).toBe(false)
  })

  it('«Добавить документ» — пустая строка в конце (только поля, которые хранит сервер), фокус на коде', async () => {
    const d = await mount([doc({ docTypeCode: '04021' })], { stubSelect: false })
    await w.get('[data-section-add]').trigger('click')
    await flushPromises()
    expect(w.get('[data-section-add]').text()).toBe('Добавить документ')
    expect(d.doc44).toHaveLength(2)
    expect(d.doc44[1]).toEqual(doc())
    expect(document.activeElement).toBe(f('docTypeCode', 1).element)
  })

  it('удаление — по своей строке; «Ещё» остаётся раскрытым у своей строки', async () => {
    const d = await mount([doc({ docNumber: '1' }), doc({ docNumber: '2' }), doc({ docNumber: '3' })])
    await rows()[2].get('[data-doc44-more]').trigger('click')
    expect(rows()[0].get('[data-doc44-delete]').attributes('aria-label')).toBe('Удалить документ 1')
    await rows()[0].get('[data-doc44-delete]').trigger('click')
    expect(d.doc44.map((x) => x.docNumber)).toEqual(['2', '3'])
    expect(rows().map((r) => r.get('[data-doc44-more]').attributes('aria-expanded'))).toEqual(['false', 'true'])
  })

  it('только чтение: таблица текстом, без кнопок; доп. сведения — строкой, если есть', async () => {
    await mount([
      doc({ docTypeCode: '04021', docTypeName: 'Инвойс (счёт-фактура)', docNumber: 'LNV-2026-0912', docDate: '2026-09-12T00:00:00', formBlankNumber: 'Б-7' }),
      doc({ docTypeCode: '02015', docTypeName: 'CMR', docNumber: 'A 0045871', docDate: '2026-09-28' }),
    ], { readonly: true })
    expect(w.find('[data-section-actions]').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
    const r0 = rows()[0].text()
    expect(r0).toContain('04021')
    expect(r0).toContain('Инвойс (счёт-фактура)')
    expect(r0).toContain('LNV-2026-0912')
    expect(r0).toContain('12.09.2026')
    expect(r0).toContain('Номер бланка: Б-7')
    expect(rows()[1].text()).toContain('28.09.2026')
    expect(rows()[1].text()).not.toContain('Номер бланка')
  })

  it('extended=false (гр.44 партии): без «Ещё»; новая строка — только код, вид, номер, дата', async () => {
    const d = await mount([doc({ docNumber: '1' })], { extended: false })
    expect(w.find('[data-doc44-more]').exists()).toBe(false)
    expect(w.find('[data-doc44-delete]').exists()).toBe(true)
    await w.get('[data-section-add]').trigger('click')
    await flushPromises()
    expect(d.doc44[1]).toEqual({ docTypeCode: null, docTypeName: null, docNumber: null, docDate: null })
  })

  it('extended=false, только чтение: доп. сведения не выводятся', async () => {
    await mount([doc({ docNumber: '1', formBlankNumber: 'Б-7' })], { extended: false, readonly: true })
    expect(w.find('[data-doc44-extras]').exists()).toBe(false)
  })
})
