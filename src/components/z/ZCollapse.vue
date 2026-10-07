<script setup lang="ts">
import { AccordionRoot } from 'reka-ui'

// Замена a-collapse (ghost): несколько открытых пунктов, v-model:active-key = string[].
// Не undefined: Reka решает «управляемый ли» по modelValue === undefined и остаётся пассивным.
const props = defineProps<{ activeKey?: string[] | null }>()
const emit = defineEmits<{
  'update:activeKey': [keys: string[]]
  change: [keys: string[]]
}>()

const onUpdate = (v: unknown) => {
  const keys = Array.isArray(v) ? (v as string[]) : []
  emit('update:activeKey', keys)
  emit('change', keys)
}
</script>

<template>
  <AccordionRoot type="multiple" :model-value="props.activeKey ?? []" @update:model-value="onUpdate">
    <slot />
  </AccordionRoot>
</template>
