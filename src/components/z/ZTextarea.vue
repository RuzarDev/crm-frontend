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

const emit = defineEmits<{ 'update:value': [value: string]; blur: [e: FocusEvent] }>()
const el = ref<HTMLTextAreaElement>()
defineExpose({ focus: () => el.value?.focus() })

const fit = () => {
  if (!props.autoGrow || !el.value) return
  el.value.style.height = 'auto'
  el.value.style.height = `${Math.min(el.value.scrollHeight, 12 * 20 + 16)}px`
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
      'block w-full resize-y rounded-field border border-line-strong bg-surface px-3 py-2 font-sans text-sm text-ink outline-none',
      'transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted motion-reduce:transition-none',
      'hover:border-faint focus:border-zircon focus:shadow-focus',
      invalid && 'border-danger hover:border-danger focus:border-danger',
      disabled && 'cursor-not-allowed bg-sunken text-muted',
      autoGrow && 'resize-none overflow-y-auto',
    )"
    @input="emit('update:value', ($event.target as HTMLTextAreaElement).value)"
    @blur="emit('blur', $event)"
  />
</template>
