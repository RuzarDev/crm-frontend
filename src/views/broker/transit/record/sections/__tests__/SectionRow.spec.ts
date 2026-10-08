import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { REESTR_COLUMN_KEYS } from '@/types/api'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import SectionRow from '../SectionRow.vue'
import { ComboStub, SelectStub, newDraft, primeRefs, refsApi } from './harness'

let w: VueWrapper
const mount = async (o: { readonly?: boolean; draft?: ReturnType<typeof newDraft> } = {}) => {
  const draft = o.draft ?? newDraft()
  w = mountWithI18n(SectionRow, {
    props: { draft, readonly: o.readonly ?? false },
    attachTo: document.body,
    global: { stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } },
  })
  await flushPromises()
  return draft
}
const f = (key: string) => w.get(`[data-f="${key}"]`)
const input = (key: string) => (f(key).element.tagName === 'INPUT' ? f(key) : f(key).get('input'))
const type = async (key: string, text: string) => {
  ;(input(key).element as HTMLInputElement).value = text
  await input(key).trigger('input')
}

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); primeRefs() })
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('SectionRow', () => {
  it('15 колонок реестра и группа «ЖДН»; подписи из i18n, каркас sec-row', async () => {
    await mount()
    expect(w.get('section#sec-row').exists()).toBe(true)
    expect(w.get('h2').text()).toBe('Строка реестра')
    for (const key of REESTR_COLUMN_KEYS) expect(w.find(`[data-f="${key}"]`).exists(), key).toBe(true)
    expect(w.findAll('[data-row-grid] [data-f]')).toHaveLength(15)
    const labels = w.findAll('[data-row-grid] label').map((l) => l.text())
    expect(labels).toEqual([
      '№', 'Дата', 'Контейнер', 'Получатель', 'Станция назначения', 'Отправитель', 'Отправка', 'Груз', 'Подкод', 'Код ТН ВЭД',
      'Количество мест', 'Вес', 'ТД', 'Кол-во ТД', 'Количество доп. листов',
    ])
    expect(w.get('[data-row-group="zhdn"] h3').text()).toBe('ЖДН')
    expect(w.get('[data-f="sealNumber"]').exists()).toBe(true)
    expect(w.get('[data-f="packagingType"]').exists()).toBe(true)
  })

  it('текстовые колонки пишут в свой ключ data; пустой ввод — null', async () => {
    const d = await mount()
    for (const key of ['№', 'Контейнер', 'Получатель', 'Отправитель', 'Отправка', 'Груз', 'Подкод', 'ТД']) {
      await type(key, `v-${key}`)
      expect(d.fields[key], key).toBe(`v-${key}`)
    }
    await type('Груз', '')
    expect(d.fields['Груз']).toBeNull()
  })

  it('«Станция назначения» — выбор из справочника и свободный ввод (значение — название)', async () => {
    const d = await mount()
    await f('Станция назначения').get('[data-option="Алтынколь"]').trigger('click')
    expect(d.fields['Станция назначения']).toBe('Алтынколь')
    await type('Станция назначения', 'Нурлы жол')
    expect(d.fields['Станция назначения']).toBe('Нурлы жол')
    expect(refsApi.listStations).toHaveBeenCalledTimes(1)
    expect(refsApi.listStations).toHaveBeenCalledWith({ silent: true })
  })

  it('числовые колонки: запятая и точка, в data — строка с точкой; пусто — null', async () => {
    const d = await mount()
    expect((input('Количество мест').element as HTMLInputElement).value).toBe('36')
    for (const [key, typed, stored] of [['Количество мест', '40', '40'], ['Вес', '1 234,5', '1234.5'], ['Кол-во ТД', '2', '2'], ['Количество доп.листов', '0.5', '0.5']]) {
      await type(key, typed)
      await input(key).trigger('blur')
      expect(d.fields[key], key).toBe(stored)
    }
    await type('Вес', '')
    await input('Вес').trigger('blur')
    expect(d.fields['Вес']).toBeNull()
  })

  it('число из старой таблицы, не разобранное как число («12 шт»), показывается текстом и не пропадает', async () => {
    const draft = newDraft()
    draft.fields['Вес'] = '12 шт'
    const d = await mount({ draft })
    expect((input('Вес').element as HTMLInputElement).value).toBe('12 шт')
    expect(d.fields['Вес']).toBe('12 шт')
    await type('Вес', '12')
    expect(d.fields['Вес']).toBe('12')
  })

  it('«Дата»: ДД.ММ.ГГГГ на экране, ISO в черновике', async () => {
    const d = await mount()
    expect((input('Дата').element as HTMLInputElement).value).toBe('28.09.2026')
    await type('Дата', '05.10.2026')
    await input('Дата').trigger('keydown', { key: 'Enter' })
    expect(d.fields['Дата']).toBe('2026-10-05')
  })

  it('«Код ТН ВЭД»: 10 цифр — без ошибки; иначе ошибка формата у поля, значение при этом сохраняется', async () => {
    const d = await mount()
    expect(w.text()).not.toContain('Код ТН ВЭД — 10 цифр.')
    await type('Код ТНВЭД', '123')
    expect(d.fields['Код ТНВЭД']).toBe('123')
    expect(w.text()).toContain('Код ТН ВЭД — 10 цифр.')
    await type('Код ТНВЭД', '8471300000')
    expect(d.fields['Код ТНВЭД']).toBe('8471300000')
    expect(w.text()).not.toContain('Код ТН ВЭД — 10 цифр.')
    await type('Код ТНВЭД', '')
    expect(w.text()).not.toContain('Код ТН ВЭД — 10 цифр.')
  })

  it('ЖДН: пломба и вид упаковки пишут в sealNumber и packagingType', async () => {
    const d = await mount()
    await type('sealNumber', 'SL-999')
    await type('packagingType', 'Паллеты')
    expect(d.sealNumber).toBe('SL-999')
    expect(d.packagingType).toBe('Паллеты')
    await type('sealNumber', '')
    expect(d.sealNumber).toBeNull()
  })

  it('«Пост» в этом разделе не показывается (он в «Основном»)', async () => {
    await mount()
    expect(w.find('[data-f="Пост"]').exists()).toBe(false)
  })

  it('только чтение: все поля выключены, кнопок нет', async () => {
    await mount({ readonly: true })
    expect(w.find('[data-section-actions]').exists()).toBe(false)
    for (const el of w.findAll('input')) expect(el.attributes('disabled'), el.html()).toBeDefined()
    expect(w.get('[data-combo-stub]').attributes('data-disabled')).toBe('true')
  })

  it('телефон: поля ≥ 44px, одна колонка', async () => {
    await mount()
    expect(f('№').element.parentElement!.className).toContain('max-sm:h-11')
    expect(f('Вес').element.parentElement!.className).toContain('max-sm:h-11')
    expect(w.get('[data-row-grid]').classes()).toContain('grid-cols-1')
  })

  it('«12 шт» → «12»: поле остаётся текстовым, пока его правят (тот же узл, фокус на месте); новое значение извне — снова решается', async () => {
    const draft = newDraft()
    draft.fields['Вес'] = '12 шт'
    const d = await mount({ draft })
    const el = input('Вес').element as HTMLInputElement
    el.focus()
    await type('Вес', '12')
    expect(d.fields['Вес']).toBe('12')
    expect(input('Вес').element).toBe(el)
    expect(el.isConnected).toBe(true)
    expect(document.activeElement).toBe(el)
    await type('Вес', '12,5 кг')
    expect(d.fields['Вес']).toBe('12,5 кг')
    expect(input('Вес').element).toBe(el)
    // Значение пришло извне («Отменить», перечитывание, другая запись) — число: поле числовое.
    d.fields['Вес'] = '570.5'
    await flushPromises()
    expect(input('Вес').element).not.toBe(el)
    await type('Вес', '1 234,5')
    await input('Вес').trigger('blur')
    expect(d.fields['Вес']).toBe('1234.5')
    // И наоборот: извне не число — текстом, значение не пропадает.
    d.fields['Вес'] = '3 вагона'
    await flushPromises()
    expect((input('Вес').element as HTMLInputElement).value).toBe('3 вагона')
  })
})
