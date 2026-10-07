<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { cn } from '@/ui/cn'
import { focusFirstTabbable } from '@/ui/surfaces'
import { cloneValue, getPath, setPath, zFieldKey, zFormKey, type ZFieldControl, type ZFormField } from '@/ui/form'
import { isEmptyValue, rulesForTrigger, validateValue, type ZRule, type ZRuleKey, type ZRuleTrigger } from '@/ui/validation'

// Замена a-form-item (220 мест) и старого ui/ZField (надмножество его API: label, graph, span, help, error,
// required, title). Подпись (с «Гр.31» при graph, звёздочкой при обязательности), контрол в слоте, ошибка
// или помощь, extra. Связь с контролом — через контекст (src/ui/form.ts): Z-поле берёт id, aria-describedby,
// aria-invalid, aria-required и сообщает о change/blur. Внутри ZForm с name — правила формы + свои, проверка
// по событиям; без ZForm — показывает error/help (и проверяет свои rules, если заданы).
// Когда проверять: blur — всегда, кроме нетронутого пустого поля (прошли Tab-ом — не ругаемся); change —
// после первой проверки поля или попытки отправки формы (исправление сразу снимает ошибку).

const props = withDefaults(defineProps<{
  label?: string
  /** Путь в :model формы: 'bin' или 'declarant.bin'. */
  name?: string
  /** Правила поля — дополняют правила формы для этого name. */
  rules?: ZRule[]
  /** Звёздочка и aria-required; при проверке — ещё и правило «обязательно». */
  required?: boolean
  help?: string
  extra?: string
  /** Ошибка извне (сервер, своя логика) — важнее результата правил. */
  error?: string
  /** Как у a-form-item: 'error' + help — ошибка; 'warning' + help — предупреждение (без aria-invalid). */
  validateStatus?: 'error' | 'warning' | 'success' | 'validating' | ''
  /** Номер графы ДТ: 31 → «Гр.31» перед подписью. */
  graph?: string | number
  /** Ширина в 12-колоночной сетке (layout="grid" у ZForm); на телефоне — во всю строку. */
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  /** Всплывающий полный текст подписи (по умолчанию — сама подпись: длинная обрезается). */
  title?: string
}>(), { required: false, validateStatus: '' })
const slots = defineSlots<{ default?: () => unknown; label?: () => unknown; extra?: () => unknown }>()

// Статический словарь: Tailwind видит полные имена классов.
const SPAN: Record<number, string> = {
  2: 'col-span-2 max-sm:col-span-12',
  3: 'col-span-3 max-sm:col-span-12',
  4: 'col-span-4 max-sm:col-span-12',
  5: 'col-span-5 max-sm:col-span-12',
  6: 'col-span-6 max-sm:col-span-12',
  7: 'col-span-7 max-sm:col-span-12',
  8: 'col-span-8 max-sm:col-span-12',
  9: 'col-span-9 max-sm:col-span-12',
  10: 'col-span-10 max-sm:col-span-12',
  11: 'col-span-11 max-sm:col-span-12',
  12: 'col-span-12',
}
const RULE_KEY: Record<ZRuleKey, string> = {
  required: 'z.ruleRequired', min: 'z.ruleMin', max: 'z.ruleMax', len: 'z.ruleLen',
  pattern: 'z.rulePattern', email: 'z.ruleEmail', number: 'z.ruleNumber', integer: 'z.ruleInteger',
}

const { t } = useI18n()
const form = inject(zFormKey, null)
const uid = `z-field-${useId()}`
const labelId = `${uid}-label`
const messageId = `${uid}-msg`
const extraId = `${uid}-extra`
const root = ref<HTMLElement>()

// Контрол, занявший поле: первый Z-контрол в слоте.
const controls = shallowRef<ZFieldControl[]>([])
const primary = computed(() => controls.value[0])
const claim = (c: ZFieldControl) => {
  controls.value = [...controls.value, c]
  return {
    active: computed(() => controls.value[0] === c),
    release: () => { controls.value = controls.value.filter((x) => x !== c) },
  }
}
const controlId = computed(() => primary.value?.id() ?? `${uid}-control`)

const hasModelPath = () => !!form?.model() && !!props.name
const getValue = () => (hasModelPath() ? getPath(form!.model(), props.name!) : primary.value?.value())

const rules = computed<ZRule[]>(() => {
  const fromForm = form && props.name ? form.rules()?.[props.name] ?? [] : []
  const list = [...fromForm, ...(props.rules ?? [])]
  if (props.required && !list.some((r) => r.required)) list.push({ required: true })
  return list
})
const isRequired = computed(() => props.required || rules.value.some((r) => r.required))
// Проверяется поле формы с name или поле со своими rules.
const validatable = computed(() => (!!form && !!props.name) || !!props.rules?.length)

const ruleError = ref<string | null>(null)
// Пользователь менял значение / поле уже проверялось (показан результат) — дальше проверяем на change.
let dirty = false
const validated = ref(false)
// Последовательность проверок: ответ устаревшей (асинхронной) проверки не записывается.
let seq = 0
let pending: Promise<string | null> = Promise.resolve(null)
const fallback = (key: ZRuleKey, n?: number) => t(RULE_KEY[key], { n })
const run = (list: ZRule[]): Promise<string | null> => {
  const my = ++seq
  pending = validateValue(getValue(), list, fallback).then((err) => {
    if (my !== seq) return pending // уже идёт более свежая проверка — её ответ и есть ответ
    ruleError.value = err
    validated.value = true
    return err
  })
  return pending
}
const validate = (trigger?: ZRuleTrigger): Promise<string | null> => {
  if (!validatable.value) return Promise.resolve(null)
  const list = trigger ? rulesForTrigger(rules.value, trigger) : rules.value
  if (trigger && !list.length) return pending
  return run(list)
}
const clear = () => {
  seq++
  pending = Promise.resolve(null)
  ruleError.value = null
  validated.value = false
}

const onChange = () => {
  dirty = true
  if (!validatable.value || !(form?.submitted.value || validated.value)) return
  // nextTick: v-model родителя обновит значение (и props контрола) после emit.
  nextTick(() => validate('change'))
}
const onBlur = () => {
  if (!validatable.value) return
  nextTick(() => {
    // Прошли мимо пустого поля, ничего не вводя, — до отправки не ругаемся.
    if (!dirty && !validated.value && !form?.submitted.value && isEmptyValue(getValue())) return
    validate('blur')
  })
}

// Ошибка: error извне → validateStatus=error + help → правила.
const externalError = computed(() => props.error || (props.validateStatus === 'error' ? props.help : '') || '')
const errorText = computed(() => externalError.value || ruleError.value || '')
const invalid = computed(() => !!errorText.value || props.validateStatus === 'error')
const message = computed(() => errorText.value || props.help || '')
const messageTone = computed(() => (errorText.value ? 'text-danger' : props.validateStatus === 'warning' ? 'text-gold-ink' : 'text-muted'))
const hasLabel = computed(() => !!props.label || !!slots.label || (props.graph !== undefined && props.graph !== ''))
const hasExtra = computed(() => !!props.extra || !!slots.extra)
const describedBy = computed(() => [message.value && messageId, hasExtra.value && extraId].filter(Boolean).join(' ') || undefined)
const spanClass = computed(() => (props.span ? SPAN[props.span] : form?.layout() === 'grid' ? 'col-span-12' : ''))

provide(zFieldKey, {
  controlId,
  labelId: computed(() => (hasLabel.value ? labelId : undefined)),
  describedBy,
  invalid,
  required: isRequired,
  claim,
  onChange,
  onBlur,
})

// Фокус на поле с ошибкой: контрол сам (focus() Z-поля), иначе первый доступный элемент; прокрутка — по центру.
const focus = () => {
  const el = root.value
  primary.value?.focus()
  if (el && !el.contains(document.activeElement)) focusFirstTabbable(el)
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' })
}

let initial: unknown
let unregister: (() => void) | undefined
const api: ZFormField = {
  name: () => props.name,
  el: () => root.value,
  validate,
  clear,
  focus,
  reset: () => {
    if (hasModelPath()) setPath(form!.model()!, props.name!, cloneValue(initial))
    dirty = false
    clear()
  },
}
onMounted(() => {
  if (!form) return
  if (hasModelPath()) initial = cloneValue(getValue())
  unregister = form.register(api)
})
onBeforeUnmount(() => unregister?.())
</script>

<template>
  <div ref="root" data-z-field :class="cn('flex min-w-0 flex-col gap-1', spanClass)">
    <label
      v-if="hasLabel"
      :id="labelId"
      :for="primary && !primary.group ? controlId : undefined"
      :title="title ?? label"
      class="flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-ink-2"
    >
      <span v-if="graph !== undefined && graph !== ''" class="shrink-0 font-normal tabular-nums text-muted">{{ t('common.graphShort', { n: graph }) }}</span>
      <span class="min-w-0 truncate"><slot name="label">{{ label }}</slot></span>
      <span v-if="isRequired" aria-hidden="true" class="shrink-0 text-danger">*</span>
    </label>
    <slot />
    <div v-if="message" :id="messageId" :class="cn('text-xs', messageTone)">{{ message }}</div>
    <div v-if="hasExtra" :id="extraId" class="text-xs text-muted"><slot name="extra">{{ extra }}</slot></div>
  </div>
</template>
