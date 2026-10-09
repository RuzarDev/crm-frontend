import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { emptyDtForm, formToPayload, type DtFormState } from '../dtPayload'
import SectionNumber from '../sections/SectionNumber.vue'

const posts = [
  { value: '55302', label: '55302 — Т/П «Алматы-Центр»' },
  { value: '55304', label: '55304 — Т/П «Хоргос»' },
]
let w: VueWrapper
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
beforeEach(() => { form = reactive(emptyDtForm()) })

const mount = (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionNumber, { props: { form, readonly: false, postOptions: posts, ...props }, attachTo: document.body })
  return w
}
const tailInput = () => w.get('input[placeholder="0000000"]').element as HTMLInputElement
const type = async (el: HTMLInputElement, value: string) => {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
const result = () => w.find('[data-dt-number-result]').text()
const pickPost = async (label: string) => {
  await w.get('input[role="combobox"]').trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
  const opt = [...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes(label)) as HTMLElement
  opt.click()
  await nextTick()
}
const setDate = async (text: string) => {
  const input = w.get('input[placeholder="ДД.ММ.ГГГГ"]').element as HTMLInputElement
  input.focus()
  await type(input, text)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await nextTick()
}

describe('SectionNumber — гр. А', () => {
  it('номер собирается из поста, даты и 7 цифр', async () => {
    mount({ submissionDate: '2026-10-09' })
    expect(form.declarationNumber).toBe('')
    expect(result()).toBe('—')
    await pickPost('Алматы-Центр')
    expect(form.submissionCustomsOfficeCode).toBe('55302')
    expect(form.declarationNumber).toBe('')
    await type(tailInput(), '0001234')
    expect(form.declarationNumber).toBe('55302/091026/0001234')
    expect(result()).toBe('55302/091026/0001234')
  })

  it('пересобирается при смене поста, даты и цифр; неполные цифры — номер пуст', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: '55302/091026/0001234' })
    await pickPost('Хоргос')
    expect(form.declarationNumber).toBe('55304/091026/0001234')
    await setDate('10.10.2026')
    expect(form.submissionDate).toBe('2026-10-10')
    expect(form.declarationNumber).toBe('55304/101026/0001234')
    await type(tailInput(), '0007777')
    expect(form.declarationNumber).toBe('55304/101026/0007777')
    await type(tailInput(), '000777')
    expect(form.declarationNumber).toBe('')
    expect(tailInput().value).toBe('000777') // набранные цифры не стираются
    await type(tailInput(), '0007778')
    expect(form.declarationNumber).toBe('55304/101026/0007778')
  })

  it('в поле цифр остаются только цифры, не больше 7', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302' })
    await type(tailInput(), '12ab34-5678 9')
    expect(tailInput().value).toBe('1234567')
    expect(form.declarationNumber).toBe('55302/091026/1234567')
  })

  it('номер с сервера при открытии не пересобирается; хвост берётся из него', () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: '55304/010126/0000042' })
    expect(form.declarationNumber).toBe('55304/010126/0000042')
    expect(tailInput().value).toBe('0000042')
    expect(w.find('[data-dt-number-manual]').exists()).toBe(false)
  })

  it('номер другого формата — сразу ручной режим, части его не меняют', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: 'KEDEN/2026/77' })
    const manual = w.get('[data-dt-number-manual]')
    expect((manual.element as HTMLInputElement).value).toBe('KEDEN/2026/77')
    expect(tailInput().disabled).toBe(true)
    await pickPost('Хоргос')
    expect(form.submissionCustomsOfficeCode).toBe('55304')
    expect(form.declarationNumber).toBe('KEDEN/2026/77')
    await type(manual.element as HTMLInputElement, 'KEDEN/2026/78')
    expect(form.declarationNumber).toBe('KEDEN/2026/78')
  })

  it('«Ввести номер целиком» включает ручной режим: свободная строка', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: '55302/091026/0001234' })
    await w.get('[data-dt-number-toggle]').trigger('click')
    await type(w.get('[data-dt-number-manual]').element as HTMLInputElement, 'ABC-1')
    expect(form.declarationNumber).toBe('ABC-1')
  })

  it('«Собрать из частей»: частей не хватает — прежний номер остаётся, пока не введут цифры', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: 'KEDEN/2026/77' })
    await w.get('[data-dt-number-toggle]').trigger('click')
    expect(w.find('[data-dt-number-manual]').exists()).toBe(false)
    expect(form.declarationNumber).toBe('KEDEN/2026/77')
    await type(tailInput(), '0000001')
    expect(form.declarationNumber).toBe('55302/091026/0000001')
  })

  it('возврат к сборке пересобирает номер, когда части полные', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: '55302/091026/0001234' })
    await w.get('[data-dt-number-toggle]').trigger('click')
    await pickPost('Хоргос') // в ручном режиме номер не трогается
    expect(form.declarationNumber).toBe('55302/091026/0001234')
    await w.get('[data-dt-number-toggle]').trigger('click')
    expect(form.declarationNumber).toBe('55304/091026/0001234')
  })

  it('очистка номера уходит в запрос как null (ручной режим и стирание цифр)', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: '55302/091026/0001234' })
    await type(tailInput(), '')
    expect(form.declarationNumber).toBe('')
    expect(formToPayload(form, null).declarationNumber).toBeNull()
    await type(tailInput(), '0001234')
    await w.get('[data-dt-number-toggle]').trigger('click')
    await type(w.get('[data-dt-number-manual]').element as HTMLInputElement, '')
    expect(form.declarationNumber).toBe('')
    expect(formToPayload(form, null).declarationNumber).toBeNull()
  })

  it('номер, пришедший извне (перезагрузка), подхватывается', async () => {
    mount({ submissionDate: '2026-10-09', submissionCustomsOfficeCode: '55302', declarationNumber: '55302/091026/0001234' })
    form.declarationNumber = '55302/091026/0009999'
    await flushPromises()
    expect(tailInput().value).toBe('0009999')
    form.declarationNumber = 'ИНОЙ/НОМЕР'
    await flushPromises()
    expect((w.get('[data-dt-number-manual]').element as HTMLInputElement).value).toBe('ИНОЙ/НОМЕР')
  })

  it('справочник постов не загрузился — код вводится вручную', async () => {
    mount({ submissionDate: '2026-10-09' }, { postOptions: [] })
    const post = w.get('input[placeholder="Код или название поста"]').element as HTMLInputElement
    await type(post, '55302')
    await type(tailInput(), '0000005')
    expect(form.declarationNumber).toBe('55302/091026/0000005')
  })

  it('просмотр: поля недоступны, переключателя нет; поле поста несёт data-graph="А"', () => {
    mount({ submissionDate: '2026-10-09', declarationNumber: '55302/091026/0001234' }, { readonly: true })
    expect(w.find('[data-dt-number-toggle]').exists()).toBe(false)
    expect(tailInput().disabled).toBe(true)
    expect(w.find('input[role="combobox"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-graph="А"]').exists()).toBe(true)
  })
})
