import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'
import type { ReestrEntry, ReestrGoodsItemInput } from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import { useAuthStore } from '@/stores/auth'
import ReestrForm from '@/components/ReestrForm.vue'

// Поля и панели формы — заглушки: проверяется то, что ReestrForm кладёт в formState и отправляет в submit.
const passthrough = (name: string, emits: string[] = []) => defineComponent({
  name, emits, inheritAttrs: false,
  setup: (_p, { slots }) => () => h('div', [slots.default?.(), slots.footer?.()]),
})
const FieldsStub = defineComponent({
  name: 'ReestrFormFields',
  props: ['formState', 'isEdit', 'readonly', 'clientOptions', 'canPickStatus', 'statusOptions'],
  setup: () => () => h('div', { 'data-fields': '' }),
})
const DocsStub = defineComponent({ name: 'ReestrDocumentsPanel', emits: ['applied'], setup: () => () => h('div') })
const empty = defineComponent({ setup: () => () => h('div') })

const good = (o: Partial<ReestrGoodsItemInput> = {}): ReestrGoodsItemInput => ({
  description: null, tnvedCode: null, tnvedDescription: null, countryOfOrigin: null, quantity: null, unit: null, unitCode: null,
  grossWeightKg: null, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: null, currency: null, ...o,
})
const SAVED_TOTALS = { goodsQuantity: 7, cargoPlacesCount: 11, grossWeightKg: 9000, totalValue: 123456.78 }
const record = (o: Partial<ReestrEntry> = {}, data: Record<string, string | null> = {}): ReestrEntry => ({
  id: 'r1', createdAtUtc: '2026-10-01T08:00:00Z', status: 1, clientId: 'c1',
  data: {
    '№': '2026-0031', 'Дата': '2026-10-08', 'Контейнер': 'MRSU4885849', 'Получатель': 'ТОО «Альфа»', 'Станция назначения': 'Достык',
    'Пост': 'Т/П «Достык»', 'Отправитель': null, 'Отправка': null, 'Груз': 'Ноутбуки', 'Подкод': null, 'Код ТНВЭД': null,
    'Количество мест': '9', 'Вес': '8529', 'ТД': null, 'Кол-во ТД': null, 'Количество доп.листов': null,
    '№ Пломбы': 'ПЛ-1', 'Вид упаковки': 'паллеты', ...data,
  },
  goods: [good({ packagesCount: 2, grossWeightKg: 10, customsValue: 100 })],
  doc44: [],
  transit: { ...REESTR_TRANSIT_DEFAULTS, ...SAVED_TOTALS },
  organizations: [], carriers: [], transportMeans: [], identificationMeans: [], packages: [], containers: [], precedingDocs: [],
  cargoOperations: [], guarantees: [],
  ...o,
})

let w: VueWrapper
let pinia: Pinia
const mountForm = (locale: 'ru' | 'en' = 'ru') => {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'ru', messages: { ru, en } })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: empty }] })
  w = mount(ReestrForm, {
    props: { open: false, loading: false, entry: null },
    global: {
      plugins: [pinia, i18n, router],
      stubs: {
        'a-modal': passthrough('AModal', ['ok', 'cancel', 'update:open']),
        'a-tabs': passthrough('ATabs'),
        'a-tab-pane': passthrough('ATabPane'),
        'a-alert': empty,
        'a-button': passthrough('AButton'),
        ReestrFormFields: FieldsStub,
        ReestrDocumentsPanel: DocsStub,
        ReestrStatusHistoryPanel: empty,
        ReestrCommentsPanel: empty,
        TnvedDeprecationAlert: empty,
      },
    },
  })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state = () => w.findAllComponents(FieldsStub)[0].props('formState') as any
const submitPayload = () => w.emitted('submit')!.at(-1)![0] as { data: Record<string, string | null> }
const clickSave = async () => {
  w.findAllComponents({ name: 'AModal' })[0].vm.$emit('ok')
  await flushPromises()
}
const open = async (entry: ReestrEntry) => {
  await w.setProps({ open: true, entry })
  await flushPromises()
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = 'administrator'
  auth.permissions = ['reestr.read', 'reestr.write', 'status.change']
})
afterEach(() => w?.unmount())

describe('ReestrForm: правка записи не теряет данные', () => {
  it('сохранение отправляет «Пост» и другие непоказанные ключи исходной записи; пломба и упаковка — из формы', async () => {
    mountForm()
    await open(record())
    expect(state().fields['Пост']).toBeUndefined() // поля «Пост» в форме нет
    expect(state().sealNumber).toBe('ПЛ-1')
    expect(state().packagingType).toBe('паллеты')
    state().fields['Груз'] = 'Ноутбуки Lenovo'
    await clickSave()
    expect(submitPayload().data).toMatchObject({
      'Пост': 'Т/П «Достык»', 'Груз': 'Ноутбуки Lenovo', 'Дата': '2026-10-08', '№ Пломбы': 'ПЛ-1', 'Вид упаковки': 'паллеты',
    })
  })

  it('kk/en: дата показывается как ДД.ММ.ГГГГ и уходит как ISO', async () => {
    mountForm('en')
    await open(record())
    expect(state().fields['Дата']).toBe('08.10.2026')
    await clickSave()
    expect(submitPayload().data['Дата']).toBe('2026-10-08')
  })

  it('открытие записи не перезаписывает сохранённые итоги; пересчёт — только после правки товаров', async () => {
    mountForm()
    await open(record())
    expect(state().transit).toMatchObject(SAVED_TOTALS)
    state().goods = [good({ packagesCount: 2, grossWeightKg: 25, customsValue: 100 })]
    await flushPromises()
    expect(state().transit).toMatchObject({ ...SAVED_TOTALS, grossWeightKg: 25 })
  })

  it('запись без товаров: итоги не обнуляются', async () => {
    mountForm()
    await open(record({ goods: [] }))
    expect(state().transit).toMatchObject(SAVED_TOTALS)
    await clickSave()
    expect((w.emitted('submit')!.at(-1)![0] as { transit: object }).transit).toMatchObject(SAVED_TOTALS)
  })

  it('повторное открытие другой записи не переносит итоги и не пересчитывает их', async () => {
    mountForm()
    await open(record())
    await w.setProps({ open: false, entry: null })
    await flushPromises()
    const other = record({ id: 'r2', goods: [good({ grossWeightKg: 1 }), good({ grossWeightKg: 2 })], transit: { ...REESTR_TRANSIT_DEFAULTS, goodsQuantity: 5, grossWeightKg: 777 } })
    await open(other)
    expect(state().transit).toMatchObject({ goodsQuantity: 5, grossWeightKg: 777 })
  })

  it('запись заменили при открытом окне (после автозаполнения) — форма пересобирается, вкладка остаётся', async () => {
    mountForm()
    await w.setProps({ initialTab: 'documents' })
    await open(record())
    expect(state().fields['Получатель']).toBe('ТОО «Альфа»')
    await w.setProps({ entry: record({ goods: [good({ tnvedCode: '8471300000' })] }, { 'Получатель': 'ТОО «Бета»', 'Код ТНВЭД': '8471300000' }) })
    await flushPromises()
    expect(state().fields['Получатель']).toBe('ТОО «Бета»')
    expect(state().fields['Код ТНВЭД']).toBe('8471300000')
    expect(state().goods[0].tnvedCode).toBe('8471300000')
    expect(state().transit).toMatchObject(SAVED_TOTALS)
    // вкладка «Документы» не сбросилась: «Сохранить» без правок — просто закрыть
    await clickSave()
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.emitted('cancel')).toHaveLength(1)
  })
})
