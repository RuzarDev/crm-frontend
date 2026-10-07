<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { cn } from '@/ui/cn'

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
defineExpose({ focus: () => el.value?.focus() })

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
}
watch(() => props.value, () => nextTick(fit))
onMounted(fit)
</script>

<template>
  <textarea
    :id="id"
    ref="el"
    :rows="rows"
    :value="value ?? ''"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    :class="cn(
      'block w-full resize-y rounded-field border border-line-strong bg-surface px-3 py-2 font-sans text-sm text-ink outline-hidden',
      'transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted disabled:placeholder:text-ink-3 motion-reduce:transition-none',
      'focus:border-zircon focus:shadow-focus',
      // hover:not-focus — в собранном CSS hover идёт после focus и перебил бы рамку фокуса.
      !invalid && !disabled && 'hover:not-focus:border-faint',
      invalid && 'border-danger focus:border-danger',
      disabled && 'cursor-not-allowed bg-sunken text-ink-3',
      autoGrow && 'resize-none overflow-y-auto',
    )"
    @input="onInput"
    @blur="emit('blur', $event)"
  />
</template>
