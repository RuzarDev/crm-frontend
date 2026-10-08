<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalendarBlank, PhX } from '@phosphor-icons/vue'
import ZDateRange from '@/components/z/ZDateRange.vue'
import ZPopover from '@/components/z/ZPopover.vue'
import { formatPeriod } from '@/views/broker/list'
import { chipClear, chipFrame, chipTrigger } from './chipStyles'

// Чип периода: «+ Период»; с выбранным — «Период: 01.10–08.10 ×». Внутри окна — ZDateRange.
// Наружу значение уходит, когда заданы обе даты (или обе стёрты → null): полупустой период не фильтрует.
const props = defineProps<{ label: string; value: [string, string] | null }>()
const emit = defineEmits<{ 'update:value': [value: [string, string] | null] }>()

type Pair = [string | null, string | null]
const { t } = useI18n()
const triggerId = `${useId()}-trigger`
const open = ref(false)
const draft = ref<Pair>(props.value ?? [null, null])
watch(() => props.value, (v) => { draft.value = v ?? [null, null] })

const active = computed(() => props.value != null)
const text = computed(() => (props.value ? `${props.label}: ${formatPeriod(props.value)}` : props.label))

const onRange = (v: Pair) => {
  draft.value = v
  if (v[0] && v[1]) emit('update:value', [v[0], v[1]])
  else if (!v[0] && !v[1]) emit('update:value', null)
}
</script>

<template>
  <span :class="chipFrame(active)">
    <ZPopover v-model:open="open" content-class="max-w-[calc(100vw-2rem)]" :width="400">
      <template #trigger>
        <button :id="triggerId" type="button" :class="chipTrigger">
          <PhCalendarBlank :size="14" aria-hidden="true" />
          <span class="truncate">{{ text }}</span>
        </button>
      </template>
      <ZDateRange :value="draft" :aria-label="label" allow-clear size="sm" @update:value="onRange" />
    </ZPopover>
    <button
      v-if="active"
      type="button"
      :class="chipClear"
      :aria-label="t('broker.list.clearFilter')"
      :aria-describedby="triggerId"
      @click="emit('update:value', null)"
    >
      <PhX :size="12" weight="bold" aria-hidden="true" />
    </button>
  </span>
</template>
