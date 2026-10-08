import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrGoodsItemInput } from '@/types/api'

const api = vi.hoisted(() => ({
  node: vi.fn(),
  rates: vi.fn(),
  listOkeiUnits: vi.fn(),
  listCountries: vi.fn(),
}))
vi.mock('@/api/tnved', () => ({ tnvedApi: { node: api.node, rates: api.rates } }))
vi.mock('@/api/references', () => ({ referencesApi: { listOkeiUnits: api.listOkeiUnits, listCountries: api.listCountries } }))

import ReestrGoodsSection from '../ReestrGoodsSection.vue'

// ReestrGoodsSection — на AntD (им пользуются ДТ Импорта 40 и разбор пакета); a-* заменены простыми элементами.
const Pass = defineComponent({ setup: (_p, { slots }) => () => h('div', slots.default?.()) })
const AButton = defineComponent({ emits: ['click'], setup: (_p, { slots, emit }) => () => h('button', { type: 'button', onClick: () => emit('click') }, slots.default?.()) })
const AInput = defineComponent({
  props: { value: { type: String, default: '' } },
  emits: ['update:value', 'change', 'blur'],
  setup: (props, { emit }) => () => h('input', {
    value: props.value,
    onInput: (e: Event) => { emit('update:value', (e.target as HTMLInputElement).value); emit('change', e) },
    onBlur: () => emit('blur'),
  }),
})
const Leaf = defineComponent({ setup: () => () => h('div') })
const stubs = {
  'a-space': Pass, 'a-upload': Pass, 'a-input-group': Pass, 'a-button': AButton, 'a-input': AInput, 'a-select': Leaf,
  TnvedPickerModal: Leaf, UploadOutlined: Leaf, CloseOutlined: Leaf, RightOutlined: Leaf,
}

const good = (o: Partial<ReestrGoodsItemInput> = {}): ReestrGoodsItemInput => ({
  description: null, tnvedCode: null, tnvedDescription: null, countryOfOrigin: null, quantity: null, unit: null, unitCode: null,
  grossWeightKg: null, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: null, currency: null, ...o,
})

let w: VueWrapper
// v-model как у родителей (DtSectionGoods, DocumentPackageWorkspaceView): эмит возвращается новым modelValue.
const mount = async (goods: ReestrGoodsItemInput[]) => {
  w = mountWithI18n(ReestrGoodsSection, {
    props: { modelValue: goods, 'onUpdate:modelValue': (v: ReestrGoodsItemInput[]) => w.setProps({ modelValue: v }) },
    global: { stubs },
  })
  await flushPromises()
}
const cards = () => w.findAll('.goods-card')
const title = (i: number) => cards()[i].get('.card-title').text()
const isCollapsed = (i: number) => (cards()[i].get('.zf-grid').element as HTMLElement).style.display === 'none'
const lastEmitted = () => (w.emitted('update:modelValue')!.at(-1)![0] as ReestrGoodsItemInput[])

beforeEach(() => {
  vi.clearAllMocks()
  api.listOkeiUnits.mockResolvedValue([])
  api.listCountries.mockResolvedValue([])
})
afterEach(() => w?.unmount())

describe('ReestrGoodsSection — свёрнутость карточек', () => {
  it('свёрнутая карточка остаётся свёрнутой после удаления соседа выше (ключ — не номер строки)', async () => {
    await mount([good({ description: 'A' }), good({ description: 'B' }), good({ description: 'C' })])
    await cards()[2].get('.collapse-btn').trigger('click')
    expect(isCollapsed(2)).toBe(true)

    await cards()[0].get('.del-btn').trigger('click')
    await flushPromises()

    expect(cards()).toHaveLength(2)
    expect(title(0)).toContain('B')
    expect(isCollapsed(0)).toBe(false)
    expect(title(1)).toContain('C')
    expect(isCollapsed(1)).toBe(true)
  })

  it('удаление первой карточки не сворачивает ту, что встала на место свёрнутой', async () => {
    await mount([good({ description: 'A' }), good({ description: 'B' }), good({ description: 'C' })])
    await cards()[1].get('.collapse-btn').trigger('click')
    await cards()[0].get('.del-btn').trigger('click')
    await flushPromises()

    expect(title(0)).toContain('B')
    expect(isCollapsed(0)).toBe(true)
    expect(title(1)).toContain('C')
    expect(isCollapsed(1)).toBe(false)
  })
})

describe('ReestrGoodsSection — проверка кода ТН ВЭД', () => {
  it('флаг «кода нет в справочнике» не уходит в данные товара, ошибка у поля остаётся', async () => {
    api.node.mockRejectedValue(new Error('404'))
    await mount([good({ tnvedCode: '1902303000', description: 'Макароны' })])
    expect(w.text()).toContain('Кода нет в справочнике ТН ВЭД')

    const description = cards()[0].findAll('input')[2]
    ;(description.element as HTMLInputElement).value = 'Макароны твёрдых сортов'
    await description.trigger('input')
    await flushPromises()

    const sent = lastEmitted()[0]
    expect(sent.description).toBe('Макароны твёрдых сортов')
    expect(Object.keys(sent)).not.toContain('tnvedInvalid')
    expect(Object.keys(sent)).not.toContain('tnvedLoading')
    expect(w.text()).toContain('Кода нет в справочнике ТН ВЭД')
  })

  it('верный код — без ошибки; справочник дёргается один раз на код', async () => {
    api.node.mockResolvedValue({ data: { is10: true, name: 'Ноутбуки' } })
    await mount([good({ tnvedCode: '8471300000' }), good({ tnvedCode: '8471300000' })])
    expect(w.text()).not.toContain('Кода нет в справочнике ТН ВЭД')
    expect(api.node).toHaveBeenCalledTimes(1)
  })
})
