<script setup lang="ts">
import { computed } from 'vue'
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { cn } from '@/ui/cn'
import { fromKey, toKey, type ZOption, type ZOptionValue } from '@/ui/options'

// Замена a-radio-group с options: v-model:value + change(value). Значения '' и числа допустимы:
// Reka получает ключи (toKey), наружу уходят исходные значения. class/style/aria-* — на корень.
const props = withDefaults(defineProps<{
  value?: ZOptionValue | null
  options: ZOption[]
  disabled?: boolean
  orientation?: 'horizontal' | 'vertical'
}>(), { value: null, orientation: 'horizontal' })
const emit = defineEmits<{
  'update:value': [value: ZOptionValue]
  change: [value: ZOptionValue]
}>()

// Не undefined: Reka решает «управляемый ли» по modelValue === undefined при создании и остаётся пассивным.
const model = computed(() => (props.value === null || props.value === undefined ? null : toKey(props.value)))
const onUpdate = (k: unknown) => {
  if (k === undefined || k === null) return
  const next = fromKey(k)
  if (next === props.value) return
  emit('update:value', next)
  emit('change', next)
}
</script>

<template>
  <RadioGroupRoot
    :model-value="model"
    :disabled="disabled"
    :orientation="orientation"
    :class="cn('flex gap-x-5 gap-y-2', orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap')"
    @update:model-value="onUpdate"
  >
    <label
      v-for="o in options"
      :key="String(o.value)"
      :class="cn(
        'inline-flex items-center gap-2 text-sm text-ink',
        disabled || o.disabled ? 'cursor-not-allowed text-ink-3' : 'cursor-pointer',
      )"
    >
      <RadioGroupItem
        :value="toKey(o.value)"
        :disabled="o.disabled"
        :class="cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-pill border border-control bg-surface outline-hidden',
          'transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
          'focus-visible:shadow-focus data-[state=unchecked]:hover:not-focus-visible:border-ink-3',
          'data-[state=checked]:border-navy disabled:cursor-not-allowed disabled:opacity-45',
        )"
      >
        <RadioGroupIndicator class="block size-2 rounded-pill bg-navy" />
      </RadioGroupItem>
      <span>{{ o.label }}</span>
    </label>
  </RadioGroupRoot>
</template>
