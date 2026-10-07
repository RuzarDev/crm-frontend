<script setup lang="ts">
import { provide, ref } from 'vue'
import { cn } from '@/ui/cn'
import { zFormKey, type ZFormField } from '@/ui/form'
import type { ZRule } from '@/ui/validation'

// Замена a-form (29 мест): :model, :rules (Record<name, ZRule[]>), @finish(model), @finish-failed({ errors, values }).
// Отправка (кнопка html-type="submit", Enter в поле — браузер жмёт эту кнопку) проверяет все зарегистрированные
// ZField; при ошибке — фокус на первое по порядку поле с ошибкой и прокрутка к нему. novalidate: проверки браузера
// (всплывающие подсказки required/type=email) не мешают нашим. layout="grid" — 12-колоночная сетка для ZField span;
// прочие прямые дети (кнопки, заголовки групп) — на всю ширину (*:not-data-[z-field] — без спора специфичности со span).

export interface ZFormError {
  name: string | undefined
  message: string
}

const props = withDefaults(defineProps<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: Record<string, any>
  rules?: Record<string, ZRule[]>
  layout?: 'vertical' | 'grid'
}>(), { layout: 'vertical' })

const emit = defineEmits<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finish: [values: Record<string, any>]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finishFailed: [info: { errors: ZFormError[]; values: Record<string, any> }]
}>()

const fields = new Set<ZFormField>()
const submitted = ref(false)
provide(zFormKey, {
  model: () => props.model,
  rules: () => props.rules,
  layout: () => props.layout,
  submitted,
  register: (f) => {
    fields.add(f)
    return () => fields.delete(f)
  },
})

// Порядок полей — как в документе (поля монтируются и регистрируются в любом порядке: v-if, вкладки).
const inDocumentOrder = (list: ZFormField[]) => list.sort((a, b) => {
  const ea = a.el()
  const eb = b.el()
  if (!ea || !eb) return 0
  return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
})
const matches = (f: ZFormField, names?: string[]) => !names || names.includes(f.name() ?? '')

const check = async (names?: string[]) => {
  const list = inDocumentOrder([...fields].filter((f) => matches(f, names)))
  const errors = await Promise.all(list.map((f) => f.validate()))
  return list.flatMap((field, i) => (errors[i] === null ? [] : [{ field, message: errors[i] as string }]))
}

// Повторная отправка, пока идёт асинхронная проверка, отменяет предыдущую: finish — один раз.
// resetFields/clearValidate во время проверки тоже отменяют отправку.
let submitSeq = 0
// Только своя форма: submit вложенной ZForm всплывает сюда, но это не наша отправка.
const onSubmit = async (e: Event) => {
  if (e.target !== e.currentTarget) return
  e.preventDefault()
  submitted.value = true
  const my = ++submitSeq
  const failed = await check()
  if (my !== submitSeq) return
  const values = props.model ?? {}
  if (!failed.length) {
    emit('finish', values)
    return
  }
  emit('finishFailed', { errors: failed.map((e) => ({ name: e.field.name(), message: e.message })), values })
  failed[0].field.focus()
}

const validate = async (names?: string[]): Promise<boolean> => (await check(names)).length === 0
const resetFields = (names?: string[]) => {
  submitSeq++
  if (!names) submitted.value = false
  for (const f of fields) if (matches(f, names)) f.reset()
}
const clearValidate = (names?: string[]) => {
  submitSeq++
  for (const f of fields) if (matches(f, names)) f.clear()
}
const onReset = (e: Event) => {
  if (e.target !== e.currentTarget) return
  e.preventDefault()
  resetFields()
}
defineExpose({ validate, resetFields, clearValidate })
</script>

<template>
  <form
    novalidate
    :class="cn(layout === 'grid' ? 'grid grid-cols-12 gap-x-4 gap-y-3 *:not-data-[z-field]:col-span-12' : 'flex flex-col gap-4')"
    @submit="onSubmit"
    @reset="onReset"
  >
    <slot />
  </form>
</template>
