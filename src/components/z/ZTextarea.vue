<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useAttrs, watch } from 'vue'
import { cn } from '@/ui/cn'
import { useFieldControl } from '@/ui/form'

// Корень — сам <textarea>: все $attrs (class/style тоже) — на него; вручную, чтобы свой aria-describedby
// объединялся с ошибкой ZField, а не заменял её.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const props = withDefaults(defineProps<{
  value?: string | null
  rows?: number
  /** Растягивать по содержимому (до 12 строк). */
  autoGrow?: boolean
  placeholder?: string
  maxlength?: number
  disabled?: boolean
  invalid?: boolean
  id?: string
}>(), { value: '', rows: 3 })

const emit = defineEmits<{
  'update:value': [value: string]
  /** На каждый ввод (не на blur), как у a-textarea: старые экраны вешают автосейв на @change. */
  change: [e: Event]
  blur: [e: FocusEvent]
}>()
const el = ref<HTMLTextAreaElement>()
defineExpose({ focus: () => el.value?.focus(), blur: () => el.value?.blur() })
const { fieldId, fieldDescribedBy, fieldInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, id: () => props.id, focus: () => el.value?.focus(), value: () => props.value,
})
const isInvalid = computed(() => props.invalid || fieldInvalid.value)

const fit = () => {
  if (!props.autoGrow || !el.value) return
  const ta = el.value
  ta.style.height = 'auto'
  // box-sizing: border-box — style.height включает рамки, а scrollHeight их не считает: добавляем
  // offsetHeight − clientHeight, иначе поле на 2px ниже содержимого и появляется прокрутка.
  const borders = ta.offsetHeight - ta.clientHeight
  ta.style.height = `${Math.min(ta.scrollHeight, 12 * 20 + 16) + borders}px`
}
const onInput = (e: Event) => {
  emit('update:value', (e.target as HTMLTextAreaElement).value)
  emit('change', e)
  notifyChange()
}
const onBlur = (e: FocusEvent) => {
  emit('blur', e)
  notifyBlur()
}
watch(() => props.value, () => nextTick(fit))
onMounted(fit)
</script>

<template>
  <textarea
    v-bind="attrs"
    :id="fieldId"
    ref="el"
    :rows="rows"
    :value="value ?? ''"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :disabled="disabled"
    :aria-invalid="isInvalid || undefined"
    :aria-describedby="fieldDescribedBy"
    :aria-required="fieldRequired"
    :class="cn(
      'block w-full resize-y rounded-field border border-line-strong bg-surface px-3 py-2 font-sans text-sm text-ink outline-hidden',
      'transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted disabled:placeholder:text-ink-3 motion-reduce:transition-none',
      'focus:border-zircon focus:shadow-focus',
      // hover:not-focus — в собранном CSS hover идёт после focus и перебил бы рамку фокуса.
      !isInvalid && !disabled && 'hover:not-focus:border-faint',
      isInvalid && 'border-danger focus:border-danger',
      disabled && 'cursor-not-allowed bg-sunken text-ink-3',
      autoGrow && 'resize-none overflow-y-auto',
    )"
    @input="onInput"
    @blur="onBlur"
  />
</template>
