import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZNumber from '../ZNumber.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

const inputEl = () => w.get('input').element as HTMLInputElement

describe('ZNumber', () => {
  it('показывает значение и эмитит число при вводе (как a-input-number)', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 10 } })
    const input = w.get('input')
    expect(inputEl().value).toBe('10')
    await input.trigger('focus')
    await input.setValue('1 234,5')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1234.5])
    expect(w.emitted('change')?.at(-1)).toEqual([1234.5])
    await input.trigger('blur')
    // коммит не меняет уже отправленное значение — повторного эмита нет
    expect(w.emitted('update:value')).toHaveLength(1)
    expect(w.emitted('change')).toHaveLength(1)
  })
  it('эмит на каждом нажатии: только разобранное и в пределах [min,max], без округления', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 5, min: 0, max: 100, precision: 2 } })
    const input = w.get('input')
    await input.trigger('focus')
    await input.setValue('1')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1])
    await input.setValue('1.')            // неполное — не эмитим
    await input.setValue('-')             // неполное
    await input.setValue('abc')           // мусор
    await input.setValue('150')           // вне пределов
    expect(w.emitted('update:value')).toHaveLength(1)
    await input.setValue('12.345')        // сырое значение, без округления
    expect(w.emitted('update:value')?.at(-1)).toEqual([12.345])
    expect(w.emitted('change')?.at(-1)).toEqual([12.345])
    await input.setValue('12.345')        // то же значение — повторно не эмитим
    expect(w.emitted('update:value')).toHaveLength(2)
    // коммит нормализует и эмитит, только если результат отличается
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([12.35])
    expect(w.emitted('update:value')).toHaveLength(3)
  })
  it('пустое поле → null', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 3 } })
    await w.get('input').trigger('focus')
    await w.get('input').setValue('')
    await w.get('input').trigger('blur')
    expect(w.emitted('update:value')?.at(-1)).toEqual([null])
  })
  it('min/max/precision применяются при коммите, мусор откатывается к прежнему значению', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 2, min: 0, max: 100, precision: 2 } })
    const input = w.get('input')
    await input.trigger('focus')
    await input.setValue('150.129')
    expect(w.emitted('update:value')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([100])
    await w.setProps({ value: 100 })
    await input.setValue('abc')
    await input.trigger('blur')
    // без фокуса при заданной precision — фиксированное число знаков (по языку интерфейса)
    expect(inputEl().value).toBe('100,00')
  })
  it('blur без правок — ничего не эмитит и не нормализует значение с сервера', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 2.135, min: 0, max: 1, precision: 2 } })
    const input = w.get('input')
    await input.trigger('focus')
    await input.trigger('blur')
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('blur')
    expect(w.emitted('update:value')).toBeUndefined()
    expect(w.emitted('change')).toBeUndefined()
  })
  it('правка после фокуса — blur нормализует', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 0.5, min: 0, max: 1, precision: 2 } })
    const input = w.get('input')
    await input.trigger('focus')
    await input.setValue('0.555')
    expect(w.emitted('update:value')?.at(-1)).toEqual([0.555])
    await input.trigger('blur')
    expect(w.emitted('update:value')?.at(-1)).toEqual([0.56])
    expect(inputEl().value).toBe('0,56')
  })
  it('кнопки шага и стрелки клавиатуры эмитят сразу (с ограничением и округлением)', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 1, step: 0.5, max: 2, controls: true } })
    await w.get('button[aria-label="Увеличить"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1.5])
    // поле уже показывает 1.5 (родитель v-model не подключил) — шаг считается от показанного значения
    await w.get('input').trigger('keydown', { key: 'ArrowDown' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([1])
    await w.get('input').trigger('keydown', { key: 'ArrowUp' })
    await w.get('input').trigger('keydown', { key: 'ArrowUp' })
    await w.get('input').trigger('keydown', { key: 'ArrowUp' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([2])
    expect(w.emitted('change')?.at(-1)).toEqual([2])
  })
  it('кнопки шага не уводят фокус (mousedown.prevent)', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 1, controls: true } })
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    w.get('button[aria-label="Уменьшить"]').element.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
  it('v-model: обновление props во время ввода не переписывает текст («1.», «1,5»)', async () => {
    const Host = defineComponent({
      setup() {
        const v = ref<number | null>(5)
        return () => h(ZNumber, { value: v.value, 'onUpdate:value': (x: number | null) => { v.value = x } })
      },
    })
    w = mountWithI18n(Host, { attachTo: document.body })
    const input = w.get('input')
    await input.trigger('focus')
    await input.setValue('1')
    await input.setValue('1.')
    expect(inputEl().value).toBe('1.')
    await input.setValue('1,5')
    expect(inputEl().value).toBe('1,5')
    expect(w.findComponent(ZNumber).emitted('update:value')?.at(-1)).toEqual([1.5])
  })
  it('внешнее изменение value без фокуса переписывает текст', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 1 } })
    await w.setProps({ value: 7 })
    expect(inputEl().value).toBe('7')
  })
  it('precision: без фокуса — ровно precision знаков по языку, в фокусе — сырой текст и то, что вводят', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 12.5, precision: 2 } })
    const input = w.get('input')
    expect(inputEl().value).toBe('12,50')
    await input.trigger('focus')
    expect(inputEl().value).toBe('12.50')
    await input.setValue('12,7')
    expect(inputEl().value).toBe('12,7')
    await input.trigger('blur')
    expect(inputEl().value).toBe('12,70')
    await w.setProps({ value: 3 })
    expect(inputEl().value).toBe('3,00')
  })
  it('без фокуса — число по языку интерфейса (тысячи, десятичный знак); в фокусе — сырой текст', async () => {
    const shown = async (lang: string) => {
      w?.unmount()
      w = mountWithI18n(ZNumber, { props: { value: 1061.28 } })
      ;(w.vm.$i18n as unknown as { locale: string }).locale = lang
      await w.vm.$nextTick()
      return inputEl().value.replace(/\u00a0/g, ' ')
    }
    expect(await shown('ru')).toBe('1 061,28')
    expect(await shown('kk')).toBe('1 061,28')
    expect(await shown('en')).toBe('1,061.28')
    // en: «1,061.28» в поле — шаг и blur без правок считают от значения, а не от показа
    const input = w.get('input')
    await input.trigger('focus')
    expect(inputEl().value).toBe('1061.28')
    await input.trigger('blur')
    expect(w.emitted('update:value')).toBeUndefined()
    expect(inputEl().value).toBe('1,061.28')
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([1062.28])
  })
  it('ввод «12,5» в ru — 12.5; после blur — «12,5»; большие дробные не теряют знаков', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 295301.76 } })
    expect(inputEl().value.replace(/\u00a0/g, ' ')).toBe('295 301,76')
    const input = w.get('input')
    await input.trigger('focus')
    expect(inputEl().value).toBe('295301.76')
    await input.setValue('12,5')
    await input.trigger('blur')
    expect(w.emitted('update:value')?.at(-1)).toEqual([12.5])
    expect(inputEl().value).toBe('12,5')
    await w.setProps({ value: 0.123456 })
    expect(inputEl().value).toBe('0,123456')
  })
  it('grouping=false — без разделителя тысяч (годы, номера)', () => {
    w = mountWithI18n(ZNumber, { props: { value: 2026, precision: 0, grouping: false } })
    expect(inputEl().value).toBe('2026')
  })
  it('вставка «1,234.56» и «−5» разбирается', async () => {
    w = mountWithI18n(ZNumber, { props: { value: null } })
    const input = w.get('input')
    await input.trigger('focus')
    await input.setValue('1,234.56')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1234.56])
    await input.setValue('−5')
    expect(w.emitted('update:value')?.at(-1)).toEqual([-5])
  })
  it('focus/blur: expose и событие focus', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 1 }, attachTo: document.body })
    const vm = w.vm as unknown as { focus: () => void; blur: () => void }
    vm.focus()
    expect(document.activeElement).toBe(inputEl())
    expect(w.emitted('focus')).toHaveLength(1)
    vm.blur()
    expect(document.activeElement).not.toBe(inputEl())
    expect(w.emitted('blur')).toHaveLength(1)
  })
  it('атрибуты — на input, inputmode=decimal', () => {
    w = mountWithI18n(ZNumber, { props: { value: null }, attrs: { 'aria-label': 'Вес нетто', class: 'w-40' } })
    expect(w.get('input').attributes('aria-label')).toBe('Вес нетто')
    expect(w.get('input').attributes('inputmode')).toBe('decimal')
    expect(w.classes()).toContain('w-40')
  })
})
