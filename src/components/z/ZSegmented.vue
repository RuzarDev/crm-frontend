<script setup lang="ts">
import { computed } from 'vue'
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import { cn } from '@/ui/cn'
import { fromKey, toKey, type ZOption, type ZOptionValue } from '@/ui/options'

// Замена a-segmented: v-model:value + change(value). Выбор снять нельзя: Reka при повторном нажатии
// на выбранный пункт присылает пустое значение — игнорируем. class/style/aria-* — на корень.
const props = defineProps<{
  value?: ZOptionValue | null
  options: (string | ZOption)[]
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:value': [value: ZOptionValue]
  change: [value: ZOptionValue]
}>()

const items = computed<ZOption[]>(() => props.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)))
// Не undefined: Reka решает «управляемый ли» по modelValue === undefined при создании и остаётся пассивным.
const model = computed(() => (props.value === null || props.value === undefined ? null : toKey(props.value)))
const onUpdate = (k: unknown) => {
  if (k === undefined || k === null || Array.isArray(k)) return
  const next = fromKey(k)
  if (next === props.value) return
  emit('update:value', next)
  emit('change', next)
}
</script>

<template>
  <ToggleGroupRoot
    type="single"
    :model-value="model"
    :disabled="disabled"
    class="inline-flex rounded-field bg-sunken p-0.5"
    @update:model-value="onUpdate"
  >
    <ToggleGroupItem
      v-for="o in items"
      :key="String(o.value)"
      :value="toKey(o.value)"
      :disabled="o.disabled"
      :class="cn(
        'inline-flex h-7 cursor-pointer items-center rounded-[6px] border-0 bg-transparent px-3 font-sans text-sm outline-hidden',
        'transition-[background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
        'focus-visible:shadow-focus data-[state=on]:focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45',
        'data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-ink data-[state=on]:shadow-raised',
        'data-[state=off]:text-ink-3 data-[state=off]:hover:text-ink',
      )"
    >
      {{ o.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
