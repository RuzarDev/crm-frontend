<script setup lang="ts">
import { computed, useAttrs, type StyleValue } from 'vue'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import { PhCheck, PhMinus } from '@phosphor-icons/vue'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'

// Замена a-checkbox: v-model:checked + change(checked), слот подписи (вся подпись кликабельна).
// class/style — на <label>, остальные $attrs (aria-*, data-*) — на кнопку role=checkbox.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const boxAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = defineProps<{
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
  id?: string
}>()
const emit = defineEmits<{
  'update:checked': [checked: boolean]
  change: [checked: boolean]
}>()

const model = computed<boolean | 'indeterminate'>(() => (props.indeterminate ? 'indeterminate' : !!props.checked))
const onUpdate = (v: boolean | 'indeterminate' | null) => {
  const next = v === true
  // Как у AntD: без изменения — без событий (у indeterminate любой клик — изменение).
  if (next === !!props.checked && !props.indeterminate) return
  emit('update:checked', next)
  emit('change', next)
}
</script>

<template>
  <label
    :style="attrs.style as StyleValue"
    :class="cn(
      'inline-flex items-center gap-2 text-sm text-ink',
      disabled ? 'cursor-not-allowed text-ink-3' : 'cursor-pointer',
      attrs.class as ClassValue,
    )"
  >
    <CheckboxRoot
      v-bind="boxAttrs"
      :id="id"
      :model-value="model"
      :disabled="disabled"
      :class="cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-surface text-white outline-hidden',
        'transition-[background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
        'focus-visible:shadow-focus',
        !disabled && 'hover:not-focus-visible:border-faint',
        'data-[state=checked]:border-navy data-[state=checked]:bg-navy data-[state=indeterminate]:border-navy data-[state=indeterminate]:bg-navy',
        'disabled:cursor-not-allowed disabled:opacity-45',
      )"
      @update:model-value="onUpdate"
    >
      <CheckboxIndicator class="flex items-center justify-center">
        <PhMinus v-if="indeterminate" :size="12" weight="bold" />
        <PhCheck v-else :size="12" weight="bold" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span v-if="$slots.default"><slot /></span>
  </label>
</template>
