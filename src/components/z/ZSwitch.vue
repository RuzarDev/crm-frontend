<script setup lang="ts">
import { computed, ref, useAttrs, type ComponentPublicInstance, type StyleValue } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import type { ClassValue } from 'clsx'
import { cn } from '@/ui/cn'
import { useFieldControl } from '@/ui/form'

// Замена a-switch: v-model:checked + change(checked), size sm|md, необязательный слот подписи.
// class/style — на обёртку, остальные $attrs (aria-*, data-*) — на кнопку role=switch.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const switchAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = withDefaults(defineProps<{
  checked?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
  id?: string
}>(), { size: 'md' })
const emit = defineEmits<{
  'update:checked': [checked: boolean]
  change: [checked: boolean]
}>()

// Внутри ZField: id/aria-* поля, change/blur — полю (см. src/ui/form.ts).
const rootCmp = ref<ComponentPublicInstance>()
const rootEl = () => rootCmp.value?.$el as HTMLElement | undefined
const { fieldId, fieldDescribedBy, fieldInvalid, fieldAriaInvalid, fieldRequired, notifyChange, notifyBlur } = useFieldControl({
  attrs, id: () => props.id, focus: () => rootEl()?.focus(), value: () => props.checked,
})
// aria-required Reka ставит сам из prop required (атрибут перебить нельзя).
const requiredFlag = computed(() => fieldRequired.value === true || fieldRequired.value === 'true')
defineExpose({ focus: () => rootEl()?.focus(), blur: () => rootEl()?.blur() })

const onUpdate = (v: boolean) => {
  if (v === !!props.checked) return
  emit('update:checked', v)
  emit('change', v)
  notifyChange()
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
    <SwitchRoot
      v-bind="switchAttrs"
      :id="fieldId"
      ref="rootCmp"
      :aria-describedby="fieldDescribedBy"
      :aria-invalid="fieldAriaInvalid"
      :required="requiredFlag"
      :model-value="!!checked"
      :disabled="disabled"
      :class="cn(
        'relative inline-flex shrink-0 items-center rounded-pill border-0 bg-control p-0.5 outline-hidden',
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        'focus-visible:shadow-focus data-[state=checked]:bg-navy',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
      )"
      @update:model-value="onUpdate"
      @blur="notifyBlur"
    >
      <SwitchThumb
        :class="cn(
          'pointer-events-none block rounded-pill bg-white shadow-raised',
          'transition-transform duration-150 ease-out motion-reduce:transition-none',
          size === 'sm'
            ? 'size-3 translate-x-0 data-[state=checked]:translate-x-3'
            : 'size-4 translate-x-0 data-[state=checked]:translate-x-4',
        )"
      />
    </SwitchRoot>
    <span v-if="$slots.default"><slot /></span>
  </label>
</template>
