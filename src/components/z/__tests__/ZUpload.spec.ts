import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZUpload from '../ZUpload.vue'
import ZField from '../ZField.vue'
import ZForm from '../ZForm.vue'

const err = vi.hoisted(() => vi.fn())
vi.mock('@/ui/message', () => ({ message: { error: err, success: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

const file = (name: string, size = 10, type = '') => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const pick = async (w: ReturnType<typeof mountWithI18n>, files: File[]) => {
  const input = w.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  await flushPromises()
}
const drop = async (zone: ReturnType<ReturnType<typeof mountWithI18n>['find']>, files: File[]) => {
  await zone.trigger('drop', { dataTransfer: { files } })
  await flushPromises()
}

afterEach(() => err.mockClear())

describe('ZUpload — кнопка', () => {
  it('скрытый input с accept; кнопка по умолчанию с подписью «Выбрать файл»; клик открывает выбор', async () => {
    const w = mountWithI18n(ZUpload, { props: { accept: '.xlsx,.xls', multiple: true } })
    const input = w.find('input[type="file"]')
    expect(input.attributes('accept')).toBe('.xlsx,.xls')
    expect(input.attributes('multiple')).toBeDefined()
    expect(input.classes()).toContain('hidden')
    expect(w.find('button').text()).toBe('Выбрать файл')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click')
    await w.find('button').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)
  })
  it('слот — подпись кнопки, иконка по умолчанию, buttonVariant/Size/loading уходят в ZButton', () => {
    const w = mountWithI18n(ZUpload, {
      props: { buttonVariant: 'primary', buttonSize: 'sm', loading: true },
      slots: { default: 'Загрузить счёт' },
    })
    const b = w.find('button')
    expect(b.text()).toContain('Загрузить счёт')
    expect(b.classes()).toContain('bg-navy')
    expect(b.classes()).toContain('h-7')
    expect(b.attributes('aria-busy')).toBe('true')
    const w2 = mountWithI18n(ZUpload, { slots: { default: 'x' } })
    expect(w2.find('button svg').exists()).toBe(true)
  })
  it('выбор файла: beforeUpload получает File, затем customRequest и select', async () => {
    const f = file('a.xlsx')
    const beforeUpload = vi.fn(() => true)
    const customRequest = vi.fn()
    const w = mountWithI18n(ZUpload, { props: { beforeUpload, customRequest } })
    await pick(w, [f])
    expect(beforeUpload).toHaveBeenCalledWith(f)
    expect(customRequest).toHaveBeenCalledTimes(1)
    const arg = customRequest.mock.calls[0][0]
    expect(arg.file).toBe(f)
    expect(typeof arg.onSuccess).toBe('function')
    expect(typeof arg.onError).toBe('function')
    expect(w.emitted('select')![0]).toEqual([[f]])
  })
  it('beforeUpload=false не вызывает customRequest; select всё равно сообщает о выбранном', async () => {
    const customRequest = vi.fn()
    const w = mountWithI18n(ZUpload, { props: { beforeUpload: () => false, customRequest } })
    await pick(w, [file('a.xlsx')])
    expect(customRequest).not.toHaveBeenCalled()
    expect(w.emitted('select')).toHaveLength(1)
  })
  it('async beforeUpload: false/reject — без customRequest, true/undefined — с ним; файлы по очереди', async () => {
    const order: string[] = []
    const customRequest = vi.fn(({ file: f }: { file: File }) => order.push(`req:${f.name}`))
    const beforeUpload = vi.fn(async (f: File) => {
      order.push(`before:${f.name}`)
      if (f.name === 'no.xlsx') return false
      if (f.name === 'boom.xlsx') throw new Error('x')
      if (f.name === 'void.xlsx') return undefined
      return true
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountWithI18n(ZUpload, { props: { multiple: true, beforeUpload, customRequest } })
    await pick(w, [file('no.xlsx'), file('boom.xlsx'), file('void.xlsx'), file('ok.xlsx')])
    expect(order).toEqual(['before:no.xlsx', 'before:boom.xlsx', 'before:void.xlsx', 'req:void.xlsx', 'before:ok.xlsx', 'req:ok.xlsx'])
    spy.mockRestore()
  })
  it('без customRequest и beforeUpload — только select', async () => {
    const w = mountWithI18n(ZUpload)
    await pick(w, [file('a.xlsx')])
    expect(w.emitted('select')).toHaveLength(1)
  })
  it('accept отклоняет .pdf при .xlsx,.xls: ошибка, файл не передаётся ни в beforeUpload, ни в select', async () => {
    const beforeUpload = vi.fn()
    const w = mountWithI18n(ZUpload, { props: { accept: '.xlsx,.xls', beforeUpload } })
    await pick(w, [file('report.PDF')])
    expect(beforeUpload).not.toHaveBeenCalled()
    expect(w.emitted('select')).toBeUndefined()
    expect(err).toHaveBeenCalledWith('Этот тип файла не подходит: report.PDF')
  })
  it('accept: расширение без учёта регистра, MIME и image/*', async () => {
    const beforeUpload = vi.fn(() => false)
    const w = mountWithI18n(ZUpload, { props: { accept: '.xlsx,image/*,application/pdf', multiple: true, beforeUpload } })
    await pick(w, [file('A.XLSX'), file('p.png', 1, 'image/png'), file('d', 1, 'application/pdf'), file('t.txt', 1, 'text/plain')])
    expect(beforeUpload).toHaveBeenCalledTimes(3)
    expect(err).toHaveBeenCalledTimes(1)
    expect((w.emitted('select')![0][0] as File[]).map((f) => f.name)).toEqual(['A.XLSX', 'p.png', 'd'])
  })
  it('maxSizeMb: слишком большой отклоняется, остальные проходят', async () => {
    const beforeUpload = vi.fn(() => false)
    const w = mountWithI18n(ZUpload, { props: { maxSizeMb: 10, multiple: true, beforeUpload } })
    await pick(w, [file('big.xlsx', 10 * 1024 * 1024 + 1), file('ok.xlsx', 10 * 1024 * 1024)])
    expect(beforeUpload).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalledWith('Файл больше 10 МБ: big.xlsx')
  })
  it('без multiple берётся только первый файл', async () => {
    const beforeUpload = vi.fn(() => false)
    const w = mountWithI18n(ZUpload, { props: { beforeUpload } })
    await pick(w, [file('a.xlsx'), file('b.xlsx')])
    expect(beforeUpload).toHaveBeenCalledTimes(1)
  })
  it('повторный выбор того же файла: input.value сбрасывается и событие срабатывает снова', async () => {
    const beforeUpload = vi.fn(() => false)
    const w = mountWithI18n(ZUpload, { props: { beforeUpload } })
    const input = w.find('input[type="file"]').element as HTMLInputElement
    const sets: string[] = []
    Object.defineProperty(input, 'value', { configurable: true, get: () => 'C:\\fakepath\\a.xlsx', set: (v: string) => { sets.push(v) } })
    await pick(w, [file('a.xlsx')])
    await pick(w, [file('a.xlsx')])
    expect(sets).toEqual(['', ''])
    expect(beforeUpload).toHaveBeenCalledTimes(2)
  })
  it('disabled: кнопка выключена, выбор ничего не делает', async () => {
    const beforeUpload = vi.fn()
    const w = mountWithI18n(ZUpload, { props: { disabled: true, beforeUpload } })
    expect(w.find('button').attributes('disabled')).toBeDefined()
    expect(w.find('input[type="file"]').attributes('disabled')).toBeDefined()
    await pick(w, [file('a.xlsx')])
    expect(beforeUpload).not.toHaveBeenCalled()
    expect(w.emitted('select')).toBeUndefined()
  })
  it('class/style на корень, остальные attrs — на кнопку; focus() фокусирует кнопку', () => {
    const w = mountWithI18n(ZUpload, { attrs: { class: 'mine', style: 'margin:1px', 'aria-label': 'Загрузить', 'data-x': '1' }, attachTo: document.body })
    expect(w.classes()).toContain('mine')
    expect(w.attributes('style')).toContain('margin')
    const b = w.find('button')
    expect(b.attributes('aria-label')).toBe('Загрузить')
    expect(b.attributes('data-x')).toBe('1')
    expect(w.find('input').attributes('aria-label')).toBeUndefined()
    ;(w.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(b.element)
    w.unmount()
  })
})

describe('ZUpload — зона перетаскивания', () => {
  const mk = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
    mountWithI18n(ZUpload, { props: { type: 'drag', ...props }, slots, attachTo: document.body })

  it('role=button, tabindex, подсказка по умолчанию, штриховая рамка', () => {
    const w = mk()
    const zone = w.find('[role="button"]')
    expect(zone.attributes('tabindex')).toBe('0')
    expect(zone.text()).toContain('Перетащите файл или нажмите, чтобы выбрать')
    for (const c of ['rounded-panel', 'border', 'border-dashed', 'border-line-strong', 'bg-canvas', 'p-6', 'text-center']) expect(zone.classes()).toContain(c)
    expect(w.find('button').exists()).toBe(false)
    w.unmount()
  })
  it('слот заменяет подсказку', () => {
    const w = mk({}, { default: 'Бросьте счёт сюда' })
    expect(w.find('[role="button"]').text()).toContain('Бросьте счёт сюда')
    expect(w.text()).not.toContain('Перетащите')
    w.unmount()
  })
  it('dragenter/dragover подсвечивают, dragleave и drop снимают', async () => {
    const w = mk()
    const zone = w.find('[role="button"]')
    await zone.trigger('dragenter')
    expect(zone.classes()).toContain('border-zircon')
    expect(zone.classes()).toContain('bg-zircon-soft')
    expect(zone.classes()).not.toContain('border-line-strong')
    await zone.trigger('dragleave')
    expect(zone.classes()).toContain('border-line-strong')
    await zone.trigger('dragover')
    expect(zone.classes()).toContain('border-zircon')
    await drop(zone, [file('a.xlsx')])
    expect(zone.classes()).not.toContain('border-zircon')
    w.unmount()
  })
  it('dragover отменяет действие по умолчанию (иначе drop не сработает)', async () => {
    const w = mk()
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    w.find('[role="button"]').element.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    w.unmount()
  })
  it('drop передаёт файлы: проверка типа/размера, beforeUpload, customRequest, select', async () => {
    const beforeUpload = vi.fn(() => true)
    const customRequest = vi.fn()
    const w = mk({ accept: '.xlsx', multiple: true, beforeUpload, customRequest })
    const a = file('a.xlsx')
    await drop(w.find('[role="button"]'), [a, file('b.pdf')])
    expect(beforeUpload).toHaveBeenCalledTimes(1)
    expect(customRequest).toHaveBeenCalledTimes(1)
    expect(w.emitted('select')![0]).toEqual([[a]])
    expect(err).toHaveBeenCalledWith('Этот тип файла не подходит: b.pdf')
    w.unmount()
  })
  it('drop без файлов (текст) ничего не делает', async () => {
    const w = mk()
    await drop(w.find('[role="button"]'), [])
    expect(w.emitted('select')).toBeUndefined()
    w.unmount()
  })
  it('Enter и Space открывают выбор (click по input), клик по зоне — тоже', async () => {
    const w = mk()
    const input = w.find('input[type="file"]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    const zone = w.find('[role="button"]')
    await zone.trigger('keydown', { key: 'Enter' })
    await zone.trigger('keydown', { key: ' ' })
    await zone.trigger('click')
    expect(click).toHaveBeenCalledTimes(3)
    await zone.trigger('keydown', { key: 'a' })
    expect(click).toHaveBeenCalledTimes(3)
    w.unmount()
  })
  it('click по input внутри корня не зацикливается (input вне зоны)', async () => {
    const w = mk()
    const input = w.find('input[type="file"]')
    expect(w.find('[role="button"]').element.contains(input.element)).toBe(false)
    w.unmount()
  })
  it('disabled: aria-disabled, tabindex -1, нет подсветки, drop/Enter не работают', async () => {
    const beforeUpload = vi.fn()
    const w = mk({ disabled: true, beforeUpload })
    const zone = w.find('[role="button"]')
    expect(zone.attributes('aria-disabled')).toBe('true')
    expect(zone.attributes('tabindex')).toBe('-1')
    const click = vi.spyOn(w.find('input').element as HTMLInputElement, 'click')
    await zone.trigger('dragenter')
    expect(zone.classes()).not.toContain('border-zircon')
    await zone.trigger('keydown', { key: 'Enter' })
    await zone.trigger('click')
    expect(click).not.toHaveBeenCalled()
    await drop(zone, [file('a.xlsx')])
    expect(beforeUpload).not.toHaveBeenCalled()
    await nextTick()
    w.unmount()
  })
  it('attrs на зоне, class на корне, focus() фокусирует зону', () => {
    const w = mountWithI18n(ZUpload, { props: { type: 'drag' }, attrs: { class: 'dz', 'aria-label': 'Документы' }, attachTo: document.body })
    expect(w.classes()).toContain('dz')
    const zone = w.find('[role="button"]')
    expect(zone.attributes('aria-label')).toBe('Документы')
    ;(w.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(zone.element)
    w.unmount()
  })
})

describe('ZUpload — внутри ZField', () => {
  const inField = (uploadProps: Record<string, unknown> = {}, uploadAttrs: Record<string, unknown> = {}) => defineComponent({
    render: () => h(ZField, { label: 'Счёт-фактура', required: true, error: 'Нужен файл' }, () => h(ZUpload, { ...uploadProps, ...uploadAttrs })),
  })
  for (const type of ['button', 'drag'] as const) {
    it(`${type}: подпись → контрол, aria-describedby → ошибка, aria-invalid и aria-required на контроле`, async () => {
      const w = mountWithI18n(inField({ type }), { attachTo: document.body })
      await nextTick()
      const ctl = w.get(type === 'button' ? 'button' : '[role="button"]')
      const id = ctl.attributes('id')
      expect(id).toBeTruthy()
      expect(w.get('label').attributes('for')).toBe(id)
      const desc = ctl.attributes('aria-describedby')!
      expect(document.getElementById(desc)?.textContent).toBe('Нужен файл')
      expect(ctl.attributes('aria-invalid')).toBe('true')
      expect(ctl.attributes('aria-required')).toBe('true')
      expect(w.find('input[type="file"]').attributes('id')).toBeUndefined()
      w.unmount()
    })
  }
  it('drag: имя зоны — подпись поля и подсказка (label for на div не работает)', async () => {
    const w = mountWithI18n(inField({ type: 'drag' }), { attachTo: document.body })
    await nextTick()
    const ids = w.get('[role="button"]').attributes('aria-labelledby')!.split(' ')
    expect(ids.map((i) => document.getElementById(i)?.textContent?.trim())).toEqual(['Счёт-фактура*', 'Перетащите файл или нажмите, чтобы выбрать'])
    w.unmount()
  })
  it('свои атрибуты главнее: id, aria-invalid; своя подсказка объединяется с ошибкой', async () => {
    const w = mountWithI18n(inField({}, { id: 'own', 'aria-invalid': 'false', 'aria-describedby': 'hint' }), { attachTo: document.body })
    await nextTick()
    const b = w.get('button')
    expect(b.attributes('id')).toBe('own')
    expect(w.get('label').attributes('for')).toBe('own')
    expect(b.attributes('aria-invalid')).toBe('false')
    expect(b.attributes('aria-describedby')!.split(' ')[0]).toBe('hint')
    expect(b.attributes('aria-describedby')!.split(' ')).toHaveLength(2)
    w.unmount()
  })
  it('выбор файла сообщает полю: обязательное поле после попытки отправки перестаёт быть ошибкой', async () => {
    const onFailed = vi.fn()
    const Host = defineComponent({
      render: () => h(ZForm, { onFinishFailed: onFailed }, () => [
        h(ZField, { label: 'Файл', rules: [{ required: true }] }, () => h(ZUpload)),
        h('button', { type: 'submit', class: 'go' }, 'OK'),
      ]),
    })
    const w = mountWithI18n(Host, { attachTo: document.body })
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(w.get('button').attributes('aria-invalid')).toBe('true')
    await pick(w, [file('a.pdf')])
    await flushPromises()
    expect(w.get('button').attributes('aria-invalid')).toBeUndefined()
    w.unmount()
  })
})

describe('ZUpload — перетаскивание: выключенная зона и подсветка', () => {
  const mk = (props: Record<string, unknown> = {}) =>
    mountWithI18n(ZUpload, { props: { type: 'drag', ...props }, attachTo: document.body, slots: { default: '<b class="child">Счёт</b>' } })
  const fire = (el: Element, type: string, init: { dataTransfer?: unknown; relatedTarget?: Element | null } = {}) => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(ev, { dataTransfer: init.dataTransfer ?? { files: [], dropEffect: 'copy' }, relatedTarget: init.relatedTarget ?? null })
    el.dispatchEvent(ev)
    return ev
  }
  for (const state of [{ disabled: true }, { loading: true }]) {
    it(`${Object.keys(state)[0]}: dragover/drop отменяются (браузер не открывает файл), dropEffect none, файлы игнорируются`, async () => {
      const beforeUpload = vi.fn()
      const w = mk({ ...state, beforeUpload })
      const zone = w.get('[role="button"]').element
      const dt = { files: [file('a.xlsx')], dropEffect: 'copy' }
      expect(fire(zone, 'dragenter', { dataTransfer: dt }).defaultPrevented).toBe(true)
      const over = fire(zone, 'dragover', { dataTransfer: dt })
      expect(over.defaultPrevented).toBe(true)
      expect(dt.dropEffect).toBe('none')
      await nextTick()
      expect(w.get('[role="button"]').classes()).not.toContain('border-zircon')
      expect(fire(zone, 'drop', { dataTransfer: dt }).defaultPrevented).toBe(true)
      await flushPromises()
      expect(beforeUpload).not.toHaveBeenCalled()
      expect(w.emitted('select')).toBeUndefined()
      w.unmount()
    })
  }
  it('подсветка не мигает над дочерними элементами: счётчик входов/выходов', async () => {
    const w = mk()
    const zone = w.get('[role="button"]')
    const child = w.get('.child').element
    fire(zone.element, 'dragenter')
    fire(child, 'dragenter')
    fire(zone.element, 'dragleave', { relatedTarget: null })
    await nextTick()
    expect(zone.classes()).toContain('border-zircon')
    fire(child, 'dragleave', { relatedTarget: null })
    await nextTick()
    expect(zone.classes()).not.toContain('border-zircon')
    w.unmount()
  })
  it('beforeUpload бросает — console.error, файл пропускается, следующий обрабатывается', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('boom')
    const beforeUpload = vi.fn((f: File) => { if (f.name === 'a.xlsx') throw boom; return true })
    const customRequest = vi.fn()
    const w = mountWithI18n(ZUpload, { props: { multiple: true, beforeUpload, customRequest } })
    await pick(w, [file('a.xlsx'), file('b.xlsx')])
    expect(spy).toHaveBeenCalledWith(boom)
    expect(customRequest).toHaveBeenCalledTimes(1)
    expect(customRequest.mock.calls[0][0].file.name).toBe('b.xlsx')
    spy.mockRestore()
  })
  it('async beforeUpload отклонён — тоже console.error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mountWithI18n(ZUpload, { props: { beforeUpload: () => Promise.reject(new Error('net')) } })
    await pick(w, [file('a.xlsx')])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
