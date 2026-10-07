import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { mountInField } from '@/test/fieldContext'
import ZPhone from '../ZPhone.vue'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ZPhone', () => {
  it('ввод форматируется: update:value и change — с «+7 701 482 19 37»', async () => {
    w = mountWithI18n(ZPhone, { props: { value: '' } })
    await w.get('input').setValue('87014821937')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['+7 701 482 19 37'])
    expect(w.emitted('change')?.at(-1)).toEqual(['+7 701 482 19 37'])
    expect((w.get('input').element as HTMLInputElement).value).toBe('+7 701 482 19 37')
  })

  it('буква не добавляется — в поле остаётся прежний номер', async () => {
    w = mountWithI18n(ZPhone, { props: { value: '+7 701' } })
    const input = w.get('input')
    expect((input.element as HTMLInputElement).value).toBe('+7 701')
    await input.setValue('+7 701a')
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('+7 701')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['+7 701'])
  })

  it('значение извне форматируется', async () => {
    w = mountWithI18n(ZPhone, { props: { value: '77014821937' } })
    expect((w.get('input').element as HTMLInputElement).value).toBe('+7 701 482 19 37')
    await w.setProps({ value: '8 702 000 11 22' })
    expect((w.get('input').element as HTMLInputElement).value).toBe('+7 702 000 11 22')
  })

  it('атрибуты телефона: tel, inputmode, autocomplete, maxlength 18, плейсхолдер', () => {
    w = mountWithI18n(ZPhone, { props: { size: 'lg' }, attrs: { class: 'w-40', 'data-x': '1' } })
    const input = w.get('input')
    expect(input.attributes()).toMatchObject({
      type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '18', placeholder: '+7 700 000 00 00', 'data-x': '1',
    })
    // class — на обёртку ZInput (ширина в раскладке).
    expect(w.classes()).toContain('w-40')
  })

  it('внутри ZField: id/aria-* поля, change/blur полю, focus() в поле', async () => {
    const r = mountInField(ZPhone, { value: '' })
    w = r.w
    const input = w.get('input')
    expect(input.attributes()).toMatchObject({ id: 'f-1', 'aria-describedby': 'f-1-msg', 'aria-invalid': 'true', 'aria-required': 'true' })
    await input.setValue('7014821937')
    expect(r.ctx.onChange).toHaveBeenCalled()
    await input.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalled()
    r.claimed[0].focus()
    expect(document.activeElement).toBe(input.element)
  })

  it('focus()/blur() наружу', () => {
    w = mountWithI18n(ZPhone, { attachTo: document.body })
    const vm = w.vm as unknown as { focus: () => void; blur: () => void }
    vm.focus()
    expect(document.activeElement).toBe(w.get('input').element)
    vm.blur()
    expect(document.activeElement).not.toBe(w.get('input').element)
  })
})
