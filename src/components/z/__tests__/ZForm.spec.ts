import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ZRule } from '@/ui/validation'
import ru from '@/i18n/locales/ru'
import en from '@/i18n/locales/en'
import ZForm from '../ZForm.vue'
import ZField from '../ZField.vue'
import ZInput from '../ZInput.vue'
import ZTextarea from '../ZTextarea.vue'
import ZButton from '../ZButton.vue'
import ZModal from '../ZModal.vue'
import ZPopover from '../ZPopover.vue'

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

type FieldSpec = { name: string; label: string; rules?: ZRule[]; required?: boolean; control?: Component }
type FormApi = { validate: (names?: string[]) => Promise<boolean>; resetFields: () => void; clearValidate: (names?: string[]) => void }

const mountForm = async (o: {
  model?: Record<string, unknown>
  rules?: Record<string, ZRule[]>
  fields: FieldSpec[]
  layout?: 'vertical' | 'grid'
}) => {
  const model = o.model ? reactive(o.model) : undefined
  const local = reactive<Record<string, unknown>>({}) // значения без :model формы (TnvedTreeView)
  const store = model ?? local
  const onFinish = vi.fn()
  const onFinishFailed = vi.fn()
  const form = ref<FormApi>()
  const Host = defineComponent({
    setup: () => () => h(ZForm, { ref: form, model, rules: o.rules, layout: o.layout, onFinish, onFinishFailed }, () => [
      ...o.fields.map((f) => h(ZField, { key: f.name, name: f.name, label: f.label, rules: f.rules, required: f.required }, () =>
        h(f.control ?? ZInput, { value: store[f.name] as string, 'onUpdate:value': (v: unknown) => { store[f.name] = v } }))),
      h(ZButton, { htmlType: 'submit' }, () => 'Отправить'),
    ]),
  })
  w = mountWithI18n(Host, { attachTo: document.body })
  await nextTick() // контролы занимают поля при монтировании — подпись получает for на следующем кадре
  return { model, store, onFinish, onFinishFailed, form }
}

// Поле по подписи: label[for] → контрол.
const control = (label: string) => {
  const l = [...document.querySelectorAll('label')].find((x) => x.textContent?.includes(label))!
  return document.getElementById(l.getAttribute('for')!) as HTMLInputElement
}
const fieldOf = (label: string) => control(label).closest('[data-z-field]') as HTMLElement
const describedText = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '')
  .split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent?.trim()).join(' | ')
const type = async (el: HTMLInputElement, text: string) => {
  el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
const blur = async (el: HTMLElement) => {
  el.dispatchEvent(new FocusEvent('blur'))
  await flushPromises()
}
const submit = async () => {
  w.get('form').element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

const companyForm = () => mountForm({
  model: { company: 'ТОО «Ақжол»', bin: '', email: '' },
  rules: {
    company: [{ required: true }],
    bin: [{ required: true }, { pattern: /^\d{12}$/ }],
    email: [{ required: true, message: 'Укажите e-mail' }, { type: 'email' }],
  },
  fields: [
    { name: 'company', label: 'Компания' },
    { name: 'bin', label: 'БИН' },
    { name: 'email', label: 'E-mail' },
  ],
})

describe('ZForm', () => {
  it('<form novalidate>; отправка с пустыми обязательными: нет finish, есть finishFailed, ошибки видны, фокус на первом', async () => {
    const { onFinish, onFinishFailed } = await companyForm()
    expect(w.get('form').attributes('novalidate')).toBeDefined()
    await submit()
    expect(onFinish).not.toHaveBeenCalled()
    expect(onFinishFailed).toHaveBeenCalledTimes(1)
    expect(onFinishFailed.mock.calls[0][0].errors).toEqual([
      { name: 'bin', message: 'Заполните поле' },
      { name: 'email', message: 'Укажите e-mail' },
    ])
    const bin = control('БИН')
    expect(bin.getAttribute('aria-invalid')).toBe('true')
    expect(describedText(bin)).toBe('Заполните поле')
    expect(describedText(control('E-mail'))).toBe('Укажите e-mail')
    expect(control('Компания').getAttribute('aria-invalid')).toBeNull()
    expect(document.activeElement).toBe(bin)
  })

  it('после неудачной отправки поле перепроверяется на change: ошибка меняется и исчезает', async () => {
    await companyForm()
    await submit()
    const bin = control('БИН')
    await type(bin, '123')
    expect(describedText(bin)).toBe('Неверный формат')
    await type(bin, '123456789012')
    expect(bin.getAttribute('aria-invalid')).toBeNull()
    expect(fieldOf('БИН').textContent).not.toContain('Неверный формат')
  })

  it('заполненная форма: finish(model) один раз, даже при двойной отправке', async () => {
    const { model, onFinish, onFinishFailed } = await companyForm()
    await type(control('БИН'), '123456789012')
    await type(control('E-mail'), 'user@mail.kz')
    w.get('form').element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    w.get('form').element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(onFinishFailed).not.toHaveBeenCalled()
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish.mock.calls[0][0]).toBe(model)
    expect(onFinish.mock.calls[0][0]).toMatchObject({ bin: '123456789012', email: 'user@mail.kz' })
  })

  it('кнопка type=submit отправляет форму (Enter в поле браузер превращает в её click)', async () => {
    const { onFinishFailed } = await companyForm()
    w.get('button[type="submit"]').element.click()
    await flushPromises()
    expect(onFinishFailed).toHaveBeenCalledTimes(1)
  })

  it('validate([\'bin\']) проверяет только одно поле', async () => {
    const { form } = await companyForm()
    expect(await form.value!.validate(['bin'])).toBe(false)
    await flushPromises()
    expect(control('БИН').getAttribute('aria-invalid')).toBe('true')
    expect(control('E-mail').getAttribute('aria-invalid')).toBeNull()
    expect(fieldOf('E-mail').textContent).not.toContain('Укажите e-mail')
    expect(await form.value!.validate(['company'])).toBe(true)
    expect(await form.value!.validate()).toBe(false)
  })

  it('resetFields возвращает исходные значения и снимает ошибки; clearValidate — только ошибки', async () => {
    const { model, form } = await companyForm()
    await type(control('Компания'), 'ИП Сейткали')
    await submit()
    expect(control('БИН').getAttribute('aria-invalid')).toBe('true')
    form.value!.clearValidate(['bin'])
    await nextTick()
    expect(control('БИН').getAttribute('aria-invalid')).toBeNull()
    expect(control('E-mail').getAttribute('aria-invalid')).toBe('true')
    form.value!.resetFields()
    await flushPromises()
    expect(model).toEqual({ company: 'ТОО «Ақжол»', bin: '', email: '' })
    expect(control('Компания').value).toBe('ТОО «Ақжол»')
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    // попытка отправки сброшена: новый ввод снова молчит до blur
    await type(control('БИН'), '1')
    expect(control('БИН').getAttribute('aria-invalid')).toBeNull()
  })

  it('до взаимодействия и отправки «Заполните поле» не показывается; blur после ввода проверяет, затем — каждый change', async () => {
    await companyForm()
    const bin = control('БИН')
    bin.focus()
    await blur(bin) // прошли Tab-ом мимо пустого поля
    expect(bin.getAttribute('aria-invalid')).toBeNull()
    await type(bin, '1') // набирает — ещё не ругаемся
    expect(bin.getAttribute('aria-invalid')).toBeNull()
    await blur(bin)
    expect(describedText(bin)).toBe('Неверный формат')
    await type(bin, '')
    expect(describedText(bin)).toBe('Заполните поле')
  })

  it('асинхронная проверка: устаревший ответ не перетирает свежий', async () => {
    const pending: ((msg?: string) => void)[] = []
    const slow: ZRule = { validator: () => new Promise<string | void>((resolve) => { pending.push(resolve) }) }
    const { onFinish } = await mountForm({ model: { bin: '' }, fields: [{ name: 'bin', label: 'БИН', rules: [slow] }] })
    const bin = control('БИН')
    w.get('form').element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    await type(bin, '123456789012') // после отправки — перепроверка на change
    expect(pending).toHaveLength(2)
    pending[1]() // свежая проверка — без ошибки
    await flushPromises()
    pending[0]('Старая ошибка')
    await flushPromises()
    expect(bin.getAttribute('aria-invalid')).toBeNull()
    expect(document.body.textContent).not.toContain('Старая ошибка')
    expect(onFinish).toHaveBeenCalledTimes(1) // отправка дождалась свежего ответа
  })

  it('прокрутка к первой ошибке — по центру', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    await companyForm()
    await submit()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    expect(spy.mock.contexts.at(-1)).toBe(fieldOf('БИН'))
    spy.mockRestore()
  })

  it('фокус без Z-контрола: первый доступный элемент поля', async () => {
    const onFinishFailed = vi.fn()
    const model = reactive({ code: '' })
    w = mountWithI18n({
      render: () => h(ZForm, { model, rules: { code: [{ required: true }] }, onFinishFailed }, () =>
        h(ZField, { name: 'code', label: 'Код' }, () => h('input', { id: 'native', value: model.code }))),
    }, { attachTo: document.body })
    await submit()
    expect(onFinishFailed).toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('native')
  })

  it('правила формы с message-функцией (LoginView) и правила поля (ResetPasswordView) дополняют друг друга', async () => {
    const { onFinishFailed } = await mountForm({
      model: { username: '', password: '1234' },
      rules: { username: [{ required: true, message: () => 'Введите логин' }] },
      fields: [
        { name: 'username', label: 'Логин' },
        { name: 'password', label: 'Пароль', rules: [{ required: true }, { min: 8 }] },
      ],
    })
    await submit()
    expect(onFinishFailed.mock.calls[0][0].errors).toEqual([
      { name: 'username', message: 'Введите логин' },
      { name: 'password', message: 'Не меньше 8 символов' },
    ])
  })

  it('форма без :model (TnvedTreeView): значение поля берётся у контрола', async () => {
    const { onFinish, onFinishFailed } = await mountForm({
      fields: [{ name: 'description', label: 'Описание товара', rules: [{ required: true, message: 'Введите описание' }], control: ZTextarea }],
    })
    await submit()
    expect(onFinishFailed).toHaveBeenCalledTimes(1)
    expect(describedText(control('Описание товара'))).toBe('Введите описание')
    await type(control('Описание товара'), 'Рубашка хлопковая')
    expect(control('Описание товара').getAttribute('aria-invalid')).toBeNull()
    await submit()
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('layout=grid — 12 колонок; по умолчанию — колонка полей', async () => {
    await mountForm({ model: {}, fields: [], layout: 'grid' })
    expect(w.get('form').classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-12', 'gap-x-4', 'gap-y-3']))
    w.unmount()
    await mountForm({ model: {}, fields: [] })
    expect(w.get('form').classes()).not.toContain('grid-cols-12')
  })
})

describe('ZField', () => {
  const mountField = async (props: Record<string, unknown>, inputProps: Record<string, unknown> = {}) => {
    w = mountWithI18n({ render: () => h(ZField, props, () => h(ZInput, inputProps)) }, { attachTo: document.body })
    await nextTick()
    return w.get('input').element as HTMLInputElement
  }

  it('подпись связана с полем: label[for] = id инпута; свой id инпута тоже', async () => {
    const input = await mountField({ label: 'БИН' })
    expect(input.id).toBeTruthy()
    expect(w.get('label').attributes('for')).toBe(input.id)
    w.unmount()
    const own = await mountField({ label: 'БИН' }, { id: 'bin-own' })
    expect(own.id).toBe('bin-own')
    expect(w.get('label').attributes('for')).toBe('bin-own')
  })

  it('error — ошибка: текст, aria-invalid, aria-describedby на существующий элемент', async () => {
    const input = await mountField({ label: 'БИН', error: 'БИН из 12 цифр' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(describedText(input)).toBe('БИН из 12 цифр')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.classList).toContain('text-danger')
  })

  it('validateStatus=error + help — ошибка (как у a-form-item); warning + help — подсказка без aria-invalid', async () => {
    const input = await mountField({ label: 'Дом', validateStatus: 'error', help: 'Длиннее 20 знаков' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(describedText(input)).toBe('Длиннее 20 знаков')
    // статус сообщения — атрибутом (переход «к недостающему» ищет подсвеченное поле не по цвету)
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.getAttribute('data-z-status')).toBe('error')
    w.unmount()
    const warn = await mountField({ label: 'Номер СВХ', validateStatus: 'warning', help: 'Проверьте контрольную цифру' })
    expect(warn.getAttribute('aria-invalid')).toBeNull()
    expect(describedText(warn)).toBe('Проверьте контрольную цифру')
    expect(document.getElementById(warn.getAttribute('aria-describedby')!)?.getAttribute('data-z-status')).toBe('warning')
    w.unmount()
    const hint = await mountField({ label: 'Дом', help: 'Только номер' })
    expect(document.getElementById(hint.getAttribute('aria-describedby')!)?.hasAttribute('data-z-status')).toBe(false)
  })

  it('help и extra — в aria-describedby; ошибка вместо help', async () => {
    const input = await mountField({ label: 'Дом', help: 'Только номер', extra: 'До 20 знаков' })
    expect(describedText(input)).toBe('Только номер | До 20 знаков')
    w.unmount()
    const err = await mountField({ label: 'Дом', help: 'Только номер', extra: 'До 20 знаков', error: 'Слишком длинно' })
    expect(describedText(err)).toBe('Слишком длинно | До 20 знаков')
  })

  it('обязательное: звёздочка text-danger с aria-hidden, aria-required на поле; графа «Гр.31»', async () => {
    const input = await mountField({ label: 'Описание', required: true, graph: 31 })
    const star = w.get('label [aria-hidden="true"]')
    expect(star.text()).toBe('*')
    expect(star.classes()).toContain('text-danger')
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(w.get('label').text()).toContain('Гр.31')
    w.unmount()
    // required из правил тоже даёт звёздочку
    const ruled = await mountField({ label: 'БИН', rules: [{ required: true }] })
    expect(ruled.getAttribute('aria-required')).toBe('true')
    expect(w.find('label [aria-hidden="true"]').exists()).toBe(true)
  })

  it('span=6 → col-span-6 (на телефоне — col-span-12); title — подсказка у подписи', async () => {
    await mountField({ label: 'Очень длинная подпись графы', span: 6 })
    expect(w.get('[data-z-field]').classes()).toEqual(expect.arrayContaining(['col-span-6', 'max-sm:col-span-12']))
    expect(w.get('label').attributes('title')).toBe('Очень длинная подпись графы')
  })

  it('автономно с rules: проверяется на blur после ввода, без ZForm', async () => {
    const value = ref('')
    w = mountWithI18n({
      render: () => h(ZField, { label: 'ИИН', rules: [{ len: 12 }] }, () =>
        h(ZInput, { value: value.value, 'onUpdate:value': (v: string) => { value.value = v } })),
    }, { attachTo: document.body })
    const input = w.get('input').element as HTMLInputElement
    await type(input, '123')
    await blur(input)
    expect(describedText(input)).toBe('Ровно 12 символов')
  })

  it('второй контрол в поле не получает id и aria-* поля', async () => {
    w = mountWithI18n({
      render: () => h(ZField, { label: 'Код', error: 'Ошибка' }, () => [h(ZInput, { 'data-n': '1' }), h(ZInput, { 'data-n': '2' })]),
    }, { attachTo: document.body })
    await nextTick()
    const [a, b] = w.findAll('input')
    expect(w.get('label').attributes('for')).toBe(a.attributes('id'))
    expect(a.attributes('aria-invalid')).toBe('true')
    expect(b.attributes('id')).toBeUndefined()
    expect(b.attributes('aria-describedby')).toBeUndefined()
    expect(b.attributes('aria-invalid')).toBeUndefined()
  })
})

describe('ZForm — доработки', () => {
  const formEl = () => w.get('form').element as HTMLFormElement
  const submitEl = async (el: HTMLElement) => {
    el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }

  it('порядок фокуса — по документу, а не по регистрации (поле появилось выше позже)', async () => {
    const show = ref(false)
    const model = reactive({ top: '', bottom: '' })
    w = mountWithI18n({
      render: () => h(ZForm, { model, rules: { top: [{ required: true }], bottom: [{ required: true }] } }, () => [
        show.value ? h(ZField, { key: 'top', name: 'top', label: 'Верх' }, () => h(ZInput, { value: model.top })) : null,
        h(ZField, { key: 'bottom', name: 'bottom', label: 'Низ' }, () => h(ZInput, { value: model.bottom })),
      ]),
    }, { attachTo: document.body })
    show.value = true
    await nextTick()
    await nextTick()
    await submitEl(formEl())
    expect(document.activeElement).toBe(control('Верх'))
  })

  it('вложенная ZForm: отправка внутренней не отправляет внешнюю', async () => {
    const outerFinish = vi.fn()
    const outerFailed = vi.fn()
    const innerFailed = vi.fn()
    const inner = reactive({ code: '' })
    w = mountWithI18n({
      render: () => h(ZForm, { model: {}, onFinish: outerFinish, onFinishFailed: outerFailed }, () =>
        h(ZForm, { model: inner, rules: { code: [{ required: true }] }, onFinishFailed: innerFailed }, () =>
          h(ZField, { name: 'code', label: 'Код' }, () => h(ZInput, { value: inner.code })))),
    }, { attachTo: document.body })
    await nextTick()
    const [, innerForm] = w.findAll('form')
    await submitEl(innerForm.element as HTMLElement)
    expect(innerFailed).toHaveBeenCalledTimes(1)
    expect(outerFinish).not.toHaveBeenCalled()
    expect(outerFailed).not.toHaveBeenCalled()
  })

  it('правила сменились при показанной ошибке — перепроверка (условная обязательность)', async () => {
    const need = ref(true)
    const model = reactive({ inn: '' })
    w = mountWithI18n({
      render: () => h(ZForm, { model, rules: { inn: need.value ? [{ required: true }] : [] } }, () =>
        h(ZField, { name: 'inn', label: 'ИИН' }, () => h(ZInput, { value: model.inn }))),
    }, { attachTo: document.body })
    await nextTick()
    await submitEl(formEl())
    expect(describedText(control('ИИН'))).toBe('Заполните поле')
    need.value = false
    await flushPromises()
    expect(control('ИИН').getAttribute('aria-invalid')).toBeNull()
    expect(document.body.textContent).not.toContain('Заполните поле')
    need.value = true
    await flushPromises()
    expect(describedText(control('ИИН'))).toBe('Заполните поле')
  })

  it('стандартные сообщения переводятся при смене языка', async () => {
    const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, en } })
    const model = reactive({ bin: '12' })
    w = mount({
      render: () => h(ZForm, { model, rules: { bin: [{ required: true }, { len: 12 }] } }, () =>
        h(ZField, { name: 'bin', label: 'BIN' }, () => h(ZInput, { value: model.bin }))),
    }, { attachTo: document.body, global: { plugins: [i18n] } })
    await nextTick()
    await submitEl(formEl())
    expect(describedText(control('BIN'))).toBe('Ровно 12 символов')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(describedText(control('BIN'))).toBe('Exactly 12 characters')
  })

  it('resetFields/clearValidate во время асинхронной отправки отменяют её: ни finish, ни finishFailed', async () => {
    for (const action of ['resetFields', 'clearValidate'] as const) {
      const pending: ((msg?: string) => void)[] = []
      const slow: ZRule = { validator: () => new Promise<string | void>((resolve) => { pending.push(resolve) }) }
      const { form, onFinish, onFinishFailed } = await mountForm({ model: { bin: '' }, fields: [{ name: 'bin', label: 'БИН', rules: [slow] }] })
      formEl().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
      form.value![action]()
      pending[0]('Ошибка')
      await flushPromises()
      expect(onFinish).not.toHaveBeenCalled()
      expect(onFinishFailed).not.toHaveBeenCalled()
      w.unmount()
      document.body.innerHTML = ''
    }
  })

  it('layout=grid: прямые дети, кроме ZField, — на все 12 колонок; у ZField своя ширина', async () => {
    await mountForm({ model: {}, fields: [], layout: 'grid' })
    expect(w.get('form').classes()).toContain('*:not-data-[z-field]:col-span-12')
    expect(w.get('form').classes()).not.toContain('*:col-span-12')
  })
})

describe('контекст поля не проникает в окна', () => {
  it('ZField вокруг кнопки и открытое ZModal с полем: поле окна не занимает внешнее поле и не получает фокус ошибки', async () => {
    const model = reactive({ action: '' })
    const onFinishFailed = vi.fn()
    w = mountWithI18n({
      render: () => h(ZForm, { model, rules: { action: [{ required: true }] }, onFinishFailed }, () =>
        h(ZField, { name: 'action', label: 'Действие' }, () => [
          h(ZButton, () => 'Выбрать'),
          h(ZModal, { open: true, title: 'Выбор' }, () => h(ZInput, { 'data-dialog': '1' })),
        ])),
    }, { attachTo: document.body })
    await flushPromises()
    const dialogInput = document.querySelector('[data-dialog]') as HTMLInputElement
    expect(dialogInput).toBeTruthy()
    const label = w.get('label')
    expect(label.attributes('for')).toBeUndefined()
    expect(dialogInput.getAttribute('aria-required')).toBeNull()
    expect(dialogInput.id).toBe('')
    await submit()
    const spy = vi.spyOn(dialogInput, 'focus')
    await submit()
    expect(onFinishFailed).toHaveBeenCalled()
    expect(dialogInput.getAttribute('aria-invalid')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('ZField в ZModal без своей ZForm не регистрируется во внешней ZForm', async () => {
    const model = reactive({ inner: '' })
    const { onFinish, form } = { onFinish: vi.fn(), form: ref<FormApi>() }
    w = mountWithI18n({
      render: () => h(ZForm, { ref: form, model, rules: { inner: [{ required: true }] }, onFinish }, () =>
        h(ZModal, { open: true, title: 'Окно' }, () => h(ZField, { name: 'inner', label: 'Внутри' }, () => h(ZInput, { value: model.inner })))),
    }, { attachTo: document.body })
    await flushPromises()
    expect(await form.value!.validate()).toBe(true)
    await submit()
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('ZPopover: поле-триггер внутри ZField связано, поле в содержимом — нет', async () => {
    w = mountWithI18n({
      render: () => h(ZField, { label: 'Код', required: true }, () =>
        h(ZPopover, { open: true }, { trigger: () => h(ZInput, { 'data-trigger': '1' }), default: () => h(ZInput, { 'data-inside': '1' }) })),
    }, { attachTo: document.body })
    await flushPromises()
    const trigger = document.querySelector('[data-trigger]') as HTMLInputElement
    const inside = document.querySelector('[data-inside]') as HTMLInputElement
    expect(inside).toBeTruthy()
    expect(w.get('label').attributes('for')).toBe(trigger.id)
    expect(trigger.getAttribute('aria-required')).toBe('true')
    expect(inside.id).toBe('')
    expect(inside.getAttribute('aria-required')).toBeNull()
  })
})

describe('ZForm — отправка извне (submit(), кнопка OK окна)', () => {
  type SubmitApi = { submit: () => Promise<boolean> }
  it('submit(): верная форма — finish один раз и true', async () => {
    const { onFinish, onFinishFailed, form } = await mountForm({
      model: { company: 'ТОО «Ақжол»' }, rules: { company: [{ required: true }] }, fields: [{ name: 'company', label: 'Компания' }],
    })
    expect(await (form.value as unknown as SubmitApi).submit()).toBe(true)
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinishFailed).not.toHaveBeenCalled()
  })
  it('submit(): ошибка — finishFailed, фокус на первое поле с ошибкой, false; дальше проверка на каждом change', async () => {
    const { onFinish, onFinishFailed, form } = await companyForm()
    expect(await (form.value as unknown as SubmitApi).submit()).toBe(false)
    expect(onFinish).not.toHaveBeenCalled()
    expect(onFinishFailed).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(control('БИН'))
    expect(control('БИН').getAttribute('aria-invalid')).toBe('true')
    await type(control('БИН'), '123456789012')
    expect(control('БИН').getAttribute('aria-invalid')).toBeNull()
  })
  it('ZModal: okButtonProps { htmlType: submit, form } отправляет ZForm из окна (finish один раз)', async () => {
    const model = reactive({ name: 'Ақжол' })
    const onFinish = vi.fn()
    const onOk = vi.fn()
    w = mountWithI18n({
      render: () => h(ZModal, { open: true, title: 'Клиент', okButtonProps: { htmlType: 'submit', form: 'clientForm' }, onOk }, () =>
        h(ZForm, { id: 'clientForm', model, rules: { name: [{ required: true }] }, onFinish }, () =>
          h(ZField, { name: 'name', label: 'Имя' }, () => h(ZInput, { value: model.name })))),
    }, { attachTo: document.body })
    await flushPromises()
    const ok = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'OK' || b.getAttribute('type') === 'submit')!
    expect(ok.getAttribute('type')).toBe('submit')
    expect(ok.getAttribute('form')).toBe('clientForm')
    ok.click()
    await flushPromises()
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onOk).toHaveBeenCalledTimes(1)
  })
  it('ZModal по умолчанию: OK — type=button без form', async () => {
    w = mountWithI18n({ render: () => h(ZModal, { open: true, title: 'X' }, () => 'тело') }, { attachTo: document.body })
    await flushPromises()
    const buttons = [...document.querySelectorAll('button')]
    expect(buttons.some((b) => b.getAttribute('type') === 'submit')).toBe(false)
    expect(buttons.some((b) => b.hasAttribute('form'))).toBe(false)
  })
})

describe('ZField — сообщения min/max/len: символы у строк, число у чисел и массивов', () => {
  it.each<[string, unknown, ZRule[], string]>([
    ['строка min', 'ab', [{ min: 3 }], 'Не меньше 3 символов'],
    ['строка max', 'abcdef', [{ max: 5 }], 'Не больше 5 символов'],
    ['строка len', '123', [{ len: 12 }], 'Ровно 12 символов'],
    ['число min', 5, [{ min: 10 }], 'Не меньше 10'],
    ['строка-число с type number', '7', [{ type: 'number', min: 10 }], 'Не меньше 10'],
    ['массив max', ['a', 'b', 'c'], [{ max: 2 }], 'Не больше 2'],
  ])('%s', async (_n, value, rules, text) => {
    w = mountWithI18n({
      render: () => h(ZForm, { model: { v: value }, rules: { v: rules } }, () =>
        h(ZField, { name: 'v', label: 'Поле' }, () => h(ZInput, { value: String(value) }))),
    }, { attachTo: document.body })
    await nextTick()
    await submit()
    expect(describedText(control('Поле'))).toBe(text)
  })
  it('kk и en: «таңба» / «characters»', async () => {
    const kk = (await import('@/i18n/locales/kk')).default
    const i18n = createI18n({ legacy: false, locale: 'kk', messages: { ru, en, kk } })
    const model = reactive({ v: 'ab' })
    w = mount({
      render: () => h(ZForm, { model, rules: { v: [{ min: 3 }, { max: 1 }] } }, () =>
        h(ZField, { name: 'v', label: 'Поле' }, () => h(ZInput, { value: model.v }))),
    }, { attachTo: document.body, global: { plugins: [i18n] } })
    await nextTick()
    await submit()
    expect(describedText(control('Поле'))).toBe('Кемінде 3 таңба')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(describedText(control('Поле'))).toBe('At least 3 characters')
  })
})
