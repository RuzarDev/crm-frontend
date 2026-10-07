<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { formatPhone } from '@/utils/phone'
import ZInput from './ZInput.vue'

// Телефон «+7 700 000 00 00» (замена ui/PhoneInput): ZInput, у которого ввод проходит через formatPhone.
// Контракт Z-полей — через сам ZInput: внутри ZField он берёт id/aria-* поля и сообщает о change/blur;
// атрибуты (class, aria-*, data-*, слушатели blur/focus/pressEnter) уходят в ZInput как есть.
// update:value и change — с уже отформатированной строкой.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  value?: string | null
  placeholder?: string
  /** lg — только страницы входа/регистрации. */
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  allowClear?: boolean
  id?: string
  name?: string
}>(), { value: '', placeholder: '+7 700 000 00 00', size: 'md' })

const emit = defineEmits<{
  'update:value': [value: string]
  change: [value: string]
}>()

const input = ref<InstanceType<typeof ZInput>>()
defineExpose({ focus: () => input.value?.focus(), blur: () => input.value?.blur() })

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
  // Строка после чистки не изменилась (набрали букву) — значение то же, и Vue не перерисует <input>:
  // в DOM остался бы лишний символ. Сдвигаем значение и возвращаем — поле пересинхронизируется.
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
  <ZInput
    v-bind="$attrs"
    :id="id"
    ref="input"
    :value="inner"
    type="tel"
    :name="name"
    :placeholder="placeholder"
    :size="size"
    :disabled="disabled"
    :readonly="readonly"
    :invalid="invalid"
    :allow-clear="allowClear"
    :maxlength="18"
    inputmode="tel"
    autocomplete="tel"
    @update:value="onInput"
  />
</template>
