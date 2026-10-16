<script setup lang="ts">
import { computed } from 'vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ZOption, ZOptionValue } from '@/ui/options'

// СП строки гр. 47 в просмотре платежей: ДТ можно править — компактный выбор из «payment-features» (ИУ, ЗН, ОП…),
// иначе — код текстом. Полное название — во всплывающей подсказке. Правку пишет родитель (setPaymentField: без
// «Пересчитать», уходит автосейвом); пустой выбор — «ИУ», как у новой строки.
const props = defineProps<{ value: string | null | undefined; editable: boolean; label: string }>()
const emit = defineEmits<{ change: [code: string] }>()

const classifiers = useClassifiersStore()
const name = computed(() => (props.value ? classifiers.cache['payment-features']?.find((c) => c.code === props.value)?.nameRu ?? '' : ''))
const options = computed<ZOption[]>(() => {
  const opts = classifiers.options('payment-features')
  const v = props.value
  return !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v }, ...opts]
})
const onUpdate = (v: ZOptionValue | ZOptionValue[] | null) => {
  const code = v == null || Array.isArray(v) || v === '' ? 'ИУ' : String(v)
  if (code !== (props.value ?? null)) emit('change', code)
}
</script>

<template>
  <span v-if="editable" class="block min-w-0" :title="name || undefined" data-payment-feature-edit>
    <ZSelect
      :value="value || null"
      :options="options"
      size="sm"
      show-search
      :aria-label="label"
      popup-width="560px"
      class="w-full font-mono"
      data-f="payment-feature-inline"
      @update:value="onUpdate"
    />
  </span>
  <span v-else class="font-mono" :title="name || undefined" data-payment-feature>{{ value || '—' }}</span>
</template>
