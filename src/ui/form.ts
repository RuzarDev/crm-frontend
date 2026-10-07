import { computed, defineComponent, inject, onBeforeUnmount, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { ZRule, ZRuleTrigger } from './validation'

// Контексты ZForm → ZField → Z-поле. Поле (ZInput, ZSelect…) не знает о правилах: внутри ZField оно берёт
// из контекста id / aria-describedby / aria-invalid / aria-required и сообщает о change/blur — а ZField
// решает, проверять ли сейчас. ZForm собирает зарегистрированные ZField для отправки, validate, reset.

/** Контрол, занявший поле: первый Z-контрол внутри ZField (второй — например, кнопка-выбор рядом — без связи). */
export interface ZFieldControl {
  /** Свой id контрола (prop/атрибут) — тогда подпись ссылается на него, а не на сгенерированный. */
  id: () => string | undefined
  /** Фокус для «перейти к первой ошибке» после неудачной отправки. */
  focus: () => void
  /** Текущее значение — для проверки поля без :model формы (ZField с rules сам по себе). */
  value: () => unknown
  /** Группа (радио, сегменты): подпись связывается через aria-labelledby — <label for> на группу не работает. */
  group?: boolean
}

export interface ZFieldContext {
  /** id контрола: свой, если задан, иначе сгенерированный полем. */
  controlId: ComputedRef<string>
  /** id подписи (если подпись есть) — для aria-labelledby у групп. */
  labelId: ComputedRef<string | undefined>
  /** id видимых ошибки/помощи и extra. */
  describedBy: ComputedRef<string | undefined>
  invalid: ComputedRef<boolean>
  required: ComputedRef<boolean>
  claim: (control: ZFieldControl) => { active: ComputedRef<boolean>; release: () => void }
  onChange: () => void
  onBlur: () => void
}
export const zFieldKey: InjectionKey<ZFieldContext> = Symbol('zField')

export interface ZFormField {
  name: () => string | undefined
  el: () => HTMLElement | undefined
  /** Проверка правил (без trigger — всех); ответ — текст ошибки или null. */
  validate: (trigger?: ZRuleTrigger) => Promise<string | null>
  reset: () => void
  clear: () => void
  focus: () => void
}

export interface ZFormContext {
  model: () => Record<string, unknown> | undefined
  rules: () => Record<string, ZRule[]> | undefined
  layout: () => 'vertical' | 'grid'
  /** Была попытка отправки: с этого момента поля проверяются на каждом change. */
  submitted: Ref<boolean>
  register: (field: ZFormField) => () => void
}
export const zFormKey: InjectionKey<ZFormContext> = Symbol('zForm')

/** Значение по имени поля: 'bin' или вложенное 'declarant.bin', как name у a-form-item. */
export const getPath = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o === null || o === undefined ? undefined : (o as Record<string, unknown>)[k]), obj)

export const setPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const keys = path.split('.')
  const last = keys.pop() as string
  let o: Record<string, unknown> | undefined = obj
  for (const k of keys) {
    o = o?.[k] as Record<string, unknown> | undefined
    if (o === null || typeof o !== 'object') return
  }
  if (o) o[last] = value
}

/** Копия для «вернуть исходное» (resetFields): массивы и простые объекты — вглубь, прочее — как есть. */
export const cloneValue = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map(cloneValue) as T
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneValue(x)])) as T
  }
  return v
}

type Booleanish = boolean | 'true' | 'false'

const joinIds = (...ids: unknown[]): string | undefined => {
  const list = ids.flatMap((s) => (typeof s === 'string' ? s.split(/\s+/) : [])).filter(Boolean)
  return list.length ? [...new Set(list)].join(' ') : undefined
}

/**
 * Связь Z-поля с ZField. Свои id/aria-* поля (prop или атрибут) важнее контекста; aria-describedby
 * объединяется (своя подсказка + ошибка поля). Вне ZField и у второго контрола в поле — только свои.
 */
export function useFieldControl(o: {
  attrs: Record<string, unknown>
  id?: () => string | undefined
  focus: () => void
  value: () => unknown
  /** Своё «ошибка» контрола (prop invalid, status, черновик ZDate) — для aria-invalid вместе с ошибкой поля. */
  invalid?: () => boolean
  group?: boolean
}) {
  const field = inject(zFieldKey, null)
  const ownId = () => o.id?.() ?? (o.attrs.id as string | undefined)
  const claim = field?.claim({ id: ownId, focus: o.focus, value: o.value, group: o.group })
  onBeforeUnmount(() => claim?.release())
  const bound = () => !!claim?.active.value
  return {
    fieldId: computed(() => ownId() ?? (bound() && !o.group ? field!.controlId.value : undefined)),
    fieldDescribedBy: computed(() => joinIds(o.attrs['aria-describedby'], bound() ? field!.describedBy.value : undefined)),
    /** id подписи поля (если поле занято этим контролом и подпись есть) — для составных контролов с aria-labelledby. */
    fieldLabelId: computed(() => (bound() ? field!.labelId.value : undefined)),
    fieldLabelledBy: computed(() => (o.attrs['aria-labelledby'] as string | undefined) ?? (bound() && o.group ? field!.labelId.value : undefined)),
    /** Ошибка поля — для красной рамки. */
    fieldInvalid: computed(() => bound() && field!.invalid.value),
    /** aria-invalid: свой атрибут важнее; иначе 'true' при своей ошибке контрола или ошибке поля. */
    fieldAriaInvalid: computed<Booleanish | 'grammar' | 'spelling' | undefined>(() =>
      (o.attrs['aria-invalid'] as Booleanish | undefined) ?? (o.invalid?.() || (bound() && field!.invalid.value) ? 'true' : undefined)),
    fieldRequired: computed<Booleanish | undefined>(() => (o.attrs['aria-required'] as Booleanish | undefined) ?? (bound() && field!.required.value ? 'true' : undefined)),
    notifyChange: () => { if (bound()) field!.onChange() },
    notifyBlur: () => { if (bound()) field!.onBlur() },
  }
}

/**
 * Граница контекста: содержимое окон и всплывающих панелей (ZModal, ZDrawer, ZPopover, ZPopconfirm,
 * ZDropdown) не связывается с ZField/ZForm, внутри которых стоит окно, — поле в окне не занимает внешнее
 * поле, не регистрируется во внешней форме и не получает фокус её ошибки. Триггеры окон остаются снаружи.
 */
export const isolateFieldContext = (): void => {
  provide(zFieldKey, null as unknown as ZFieldContext)
  provide(zFormKey, null as unknown as ZFormContext)
}
export const ZFieldBoundary = defineComponent({
  name: 'ZFieldBoundary',
  setup(_, { slots }) {
    isolateFieldContext()
    return () => slots.default?.()
  },
})
