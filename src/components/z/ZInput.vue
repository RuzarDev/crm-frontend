<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'

withDefaults(defineProps<{
  value?: string | null
  type?: 'text' | 'password' | 'search' | 'email' | 'tel'
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  allowClear?: boolean
  maxlength?: number
  /** Моноширинный ввод — коды ТН ВЭД, БИН, номера документов. */
  mono?: boolean
  id?: string
  name?: string
  autocomplete?: string
}>(), { value: '', type: 'text', size: 'md' })

const emit = defineEmits<{
  'update:value': [value: string]
  pressEnter: [e: KeyboardEvent]
  blur: [e: FocusEvent]
  focus: [e: FocusEvent]
}>()

const { t } = useI18n()
const el = ref<HTMLInputElement>()
defineExpose({ focus: () => el.value?.focus(), blur: () => el.value?.blur() })

const onInput = (e: Event) => emit('update:value', (e.target as HTMLInputElement).value)
const clear = () => {
  emit('update:value', '')
  el.value?.focus()
}
</script>

<template>
  <span
    :class="cn(
      'inline-flex w-full items-center gap-2 rounded-field border border-line-strong bg-surface px-3 text-ink',
      'transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
      'hover:border-faint focus-within:border-zircon focus-within:shadow-focus',
      size === 'sm' ? 'h-7 text-xs' : 'h-9 text-sm',
      invalid && 'border-danger hover:border-danger focus-within:border-danger',
      disabled && 'cursor-not-allowed bg-sunken text-muted hover:border-line-strong',
    )"
  >
    <span v-if="$slots.prefix" class="flex shrink-0 items-center text-muted"><slot name="prefix" /></span>
    <input
      :id="id"
      ref="el"
      :name="name"
      :type="type"
      :value="value ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :aria-invalid="invalid || undefined"
      :class="cn(
        'min-w-0 flex-1 border-0 bg-transparent p-0 [font-size:inherit] [line-height:inherit] [color:inherit] outline-none placeholder:text-muted disabled:cursor-not-allowed',
        mono ? 'font-mono tabular-nums' : 'font-sans',
      )"
      @input="onInput"
      @keydown.enter="emit('pressEnter', $event)"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    >
    <button
      v-if="allowClear && value && !disabled && !readonly"
      type="button"
      :aria-label="t('common.clear')"
      class="-mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted outline-none hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
      @click="clear"
    >
      <PhX :size="12" weight="bold" />
    </button>
    <span v-if="$slots.suffix" class="flex shrink-0 items-center text-muted"><slot name="suffix" /></span>
  </span>
</template>
