import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Component } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import SectionCarriers from '../SectionCarriers.vue'
import SectionGuarantees from '../SectionGuarantees.vue'
import SectionMain from '../SectionMain.vue'
import SectionMisc from '../SectionMisc.vue'
import SectionOrganizations from '../SectionOrganizations.vue'
import SectionPackaging from '../SectionPackaging.vue'
import SectionPreceding from '../SectionPreceding.vue'
import SectionRow from '../SectionRow.vue'
import SectionSeals from '../SectionSeals.vue'
import SectionTransport from '../SectionTransport.vue'
import { ph } from '../ui'
import { emptyDraft, newDraft, primeRefs } from './harness'

// Режим чтения (клиент, без reestr.write): поля без подсказок «Выберите», «Код или название поста», «ДД.ММ.ГГГГ» —
// запись не должна выглядеть пустой формой. Настоящие Z-поля (не заглушки): проверяется атрибут placeholder у input.
const SECTIONS: [string, Component][] = [
  ['SectionMain', SectionMain], ['SectionRow', SectionRow], ['SectionOrganizations', SectionOrganizations],
  ['SectionCarriers', SectionCarriers], ['SectionTransport', SectionTransport], ['SectionSeals', SectionSeals],
  ['SectionPackaging', SectionPackaging], ['SectionPreceding', SectionPreceding], ['SectionGuarantees', SectionGuarantees],
  ['SectionMisc', SectionMisc],
]

let w: VueWrapper
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); primeRefs() })
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const placeholders = () => w.findAll('input, textarea').map((i) => i.attributes('placeholder') ?? '').filter(Boolean)

describe('режим чтения — без подсказок в полях', () => {
  it('ph(): в чтении пустая строка (ZDate не подставит свою), иначе текст', () => {
    expect(ph(true, 'Выберите')).toBe('')
    expect(ph(true)).toBe('')
    expect(ph(false, 'Выберите')).toBe('Выберите')
    expect(ph(false)).toBeUndefined()
  })

  it.each(SECTIONS)('%s: readonly — ни одной подсказки', async (_name, cmp) => {
    // Пустая запись: у пустых полей подсказка видна сильнее всего. Повторяющиеся разделы — с одной строкой.
    const draft = emptyDraft()
    const full = newDraft()
    Object.assign(draft, {
      organizations: full.organizations, carriers: full.carriers, transportMeans: full.transportMeans,
      identificationMeans: full.identificationMeans, packages: full.packages, precedingDocs: full.precedingDocs,
      guarantees: full.guarantees, cargoOperations: full.cargoOperations,
    })
    draft.transit = { ...draft.transit, purposeCode: null, transportDocDate: null }
    w = mountWithI18n(cmp, { props: { draft, readonly: true }, attachTo: document.body })
    await flushPromises()
    expect(w.findAll('input').length).toBeGreaterThan(0)
    expect(placeholders()).toEqual([])
  })

  it('в правке подсказки на месте («Выберите», «ДД.ММ.ГГГГ»)', async () => {
    const draft = emptyDraft()
    draft.transit = { ...draft.transit, purposeCode: null, transportDocDate: null }
    w = mountWithI18n(SectionMain, { props: { draft, readonly: false }, attachTo: document.body })
    await flushPromises()
    expect(placeholders()).toEqual(expect.arrayContaining(['Выберите', 'ДД.ММ.ГГГГ']))
  })
})
