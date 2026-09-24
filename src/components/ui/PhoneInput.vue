<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { formatPhone } from '@/utils/phone'

const props = withDefaults(
  defineProps<{
    value?: string | null
    disabled?: boolean
    size?: 'small' | 'middle' | 'large'
    placeholder?: string
    allowClear?: boolean
  }>(),
  { value: '', placeholder: '+7 700 000 00 00' },
)

const emit = defineEmits<{
  (e: 'update:value', v: string): void
  (e: 'change', v: string): void
}>()

const inner = ref(formatPhone(props.value))

watch(
  () => props.value,
  (v) => {
    const formatted = formatPhone(v)
    if (formatted !== inner.value) inner.value = formatted
  },
)

const onInput = async (raw: string) => {
  const formatted = formatPhone(raw, inner.value)
  // Если после чистки строка не изменилась (набрали букву), принудительно
  // пересинхронизируем поле — иначе в DOM останется лишний символ.
  if (formatted === inner.value && raw !== formatted) {
    inner.value = `${formatted} `
    await nextTick()
  }
  inner.value = formatted
  emit('update:value', formatted)
  emit('change', formatted)
}
</script>

<template>
  <a-input
    :value="inner"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :size="props.size"
    :allow-clear="props.allowClear"
    :maxlength="18"
    inputmode="tel"
    autocomplete="tel"
    @update:value="onInput"
  >
    <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
  </a-input>
</template>
