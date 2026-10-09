import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { PartyAddress } from '@/types/api'
import PartyModal from '../PartyModal.vue'
import PartyCard from '../PartyCard.vue'
import { SelectStub } from '@/views/broker/transit/record/sections/__tests__/harness'

const ModalStub = {
  props: ['open', 'title', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title" :data-ok-disabled="okButtonProps?.disabled ? \'true\' : \'false\'"><slot /><button data-ok type="button" @click="$emit(\'ok\')" /><button data-cancel type="button" @click="$emit(\'update:open\', false)" /></div>',
}
const party = (o: Partial<PartyAddress> = {}): PartyAddress => ({ name: 'Lenovo Ltd', countryCode: 'CN', region: 'Guangdong', city: 'Shenzhen', street: 'Nanshan 1', ...o })
const countries = [{ value: '398', label: '398 — Казахстан' }, { value: '156', label: '156 — Китай' }]

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const mount = (p: PartyAddress | null) => {
  w = mountWithI18n(PartyModal, {
    props: { open: true, title: 'Отправитель', party: p, countryOptions: countries },
    global: { stubs: { ZModal: ModalStub, ZSelect: SelectStub } },
  })
  return w
}
const input = (k: string) => w.get(`[data-party-f="${k}"]`)
const type = async (k: string, text: string) => {
  ;(input(k).element as HTMLInputElement).value = text
  await input(k).trigger('input')
}

describe('PartyModal', () => {
  it('поля стороны заполнены из партии; старый код страны, которого нет в справочнике, виден как вариант', () => {
    mount(party())
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Отправитель')
    expect((input('name').element as HTMLInputElement).value).toBe('Lenovo Ltd')
    expect(input('countryCode').attributes('data-value')).toBe('CN')
    expect(input('countryCode').findAll('[data-option]').map((o) => o.attributes('data-option'))).toEqual(['CN', '398', '156'])
    expect((input('street').element as HTMLInputElement).value).toBe('Nanshan 1')
  })

  it('«Применить» отдаёт сторону целиком (пустое — null) и закрывает окно', async () => {
    mount(party())
    await type('city', 'Алматы')
    await type('region', '')
    await input('countryCode').get('[data-option="398"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    expect(w.emitted('apply')![0][0]).toEqual({ name: 'Lenovo Ltd', countryCode: '398', region: null, city: 'Алматы', street: 'Nanshan 1' })
    expect(w.emitted('update:open')![0]).toEqual([false])
  })

  it('«Отмена» ничего не отдаёт; при новом открытии — снова значения партии', async () => {
    mount(party())
    await type('city', 'Алматы')
    await w.get('[data-cancel]').trigger('click')
    expect(w.emitted('apply')).toBeUndefined()
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    await nextTick()
    expect((input('city').element as HTMLInputElement).value).toBe('Shenzhen')
  })

  it('слишком длинное поле (из старых данных) — ошибка у поля, «Применить» недоступно', async () => {
    mount(party({ street: 'x'.repeat(301) }))
    await nextTick()
    expect(w.text()).toContain('Не длиннее 300 знаков')
    expect(w.get('[data-modal]').attributes('data-ok-disabled')).toBe('true')
    await w.get('[data-ok]').trigger('click')
    expect(w.emitted('apply')).toBeUndefined()
  })
})

describe('PartyCard', () => {
  it('название и «страна · регион, город, улица»; нажатие — правка', async () => {
    w = mountWithI18n(PartyCard, { props: { label: 'Получатель', party: party(), readonly: false } })
    expect(w.element.tagName).toBe('BUTTON')
    expect(w.attributes('type')).toBe('button')
    expect(w.attributes('aria-label')).toBe('Получатель: изменить')
    expect(w.get('[data-party-name]').text()).toBe('Lenovo Ltd')
    expect(w.get('[data-party-address]').text()).toBe('CN · Guangdong, Shenzhen, Nanshan 1')
    await w.trigger('click')
    expect(w.emitted('edit')).toHaveLength(1)
  })

  it('пустая сторона — «Не заполнено»; в чтении — не кнопка и без правки', async () => {
    w = mountWithI18n(PartyCard, { props: { label: 'Отправитель', party: party({ name: null, countryCode: null, region: null, city: null, street: ' ' }), readonly: true } })
    expect(w.element.tagName).toBe('DIV')
    expect(w.get('[data-party-empty]').text()).toBe('Не заполнено')
    await w.trigger('click')
    expect(w.emitted('edit')).toBeUndefined()
  })
})
