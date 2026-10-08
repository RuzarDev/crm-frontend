<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZTag from '@/components/z/ZTag.vue'
import ClientStepBar from '@/components/client/ClientStepBar.vue'
import type { ClientShipment } from '@/api/clientShipments'
import { askFor, segments, shipmentHref, shipmentTag } from '@/views/client/shipment'
import { useShipmentText } from '@/views/client/useShipmentText'
import { cn } from '@/ui/cn'

// Строка поставки в списке клиента (доска Main): груз и номер · этап · тег и дата.
// На телефоне — стопкой: груз, тег с датой, полоса этапов.
const props = defineProps<{ shipment: ClientShipment }>()
const { t } = useI18n()
const text = useShipmentText()

const s = computed(() => props.shipment)
const ask = computed(() => askFor(s.value))
const tag = computed(() => shipmentTag(s.value))
</script>

<template>
  <RouterLink
    :to="shipmentHref(s)"
    data-client-row
    :data-ask="ask ?? undefined"
    :class="cn(
      'flex flex-col gap-3 rounded-panel border px-5 py-4 text-ink no-underline outline-hidden',
      'md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-5',
      'transition-[border-color,box-shadow] duration-150 ease-out hover:shadow-raised focus-visible:shadow-focus motion-reduce:transition-none',
      ask ? 'border-gold-line bg-gold-soft' : 'border-line bg-surface hover:border-line-strong',
    )"
  >
    <span class="block min-w-0">
      <span :class="cn('block truncate text-[15.5px] leading-6 font-semibold', !s.cargo && 'text-ink-3')">
        {{ s.cargo || t('client.row.noCargo') }}
      </span>
      <span class="mt-[3px] block truncate text-sm text-ink-3">
        <span class="font-mono">{{ s.number }}</span><template v-if="s.post"> · {{ s.post }}</template>
      </span>
    </span>

    <span class="flex min-w-0 flex-col gap-[7px] max-md:order-2">
      <ClientStepBar :segments="segments(s)" :label="text.stepLabel(s)" />
      <span class="text-sm text-ink-2 md:truncate" data-row-caption>{{ text.caption(s) }}</span>
    </span>

    <span class="flex items-center justify-between gap-3.5 max-md:order-1 md:justify-self-end">
      <ZTag :tone="tag.tone">{{ text.tagText(s) }}</ZTag>
      <span class="shrink-0 text-right text-[13px] tabular-nums text-muted md:w-[52px]">{{ text.when(s) }}</span>
    </span>
  </RouterLink>
</template>
