<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZTag from '@/components/z/ZTag.vue'
import PlateTag from './PlateTag.vue'
import StageBar from './StageBar.vue'
import type { TruckListItem } from '@/api/autoTransit'
import { STAGES, rowTitle, sinceText, stageBar, stageKey, stateTag } from './autoTransit'
import { pluralForm } from '@/views/broker/list'
import { formatNumberIn } from '@/ui/number'

// Строка списка машин (макет 1): номер и прицеп · получатель и сводка · полоса этапов · метка и время на этапе.
// Вся строка — ссылка на карточку машины (средняя кнопка и ⌘-клик открывают новую вкладку).
// До 768 px — карточка: номер и метка, получатель, полоса, «Этап N из 7 · название · время».
const props = defineProps<{ item: TruckListItem; now: Date }>()
const { t, locale } = useI18n()
const tr = (key: string, params?: Record<string, unknown>) => t(key, params ?? {})

const released = computed(() => props.item.status === 'released' || props.item.currentStage == null)
const steps = computed(() => stageBar(props.item))
const tag = computed(() => stateTag(props.item))
const title = computed(() => rowTitle(props.item, tr))
const stageText = computed(() => {
  if (released.value) return t('broker.autoTransit.list.allDone')
  const n = props.item.currentStage!
  return t('broker.autoTransit.list.stageOf', { n, total: STAGES.length, name: t(stageKey(n)) })
})
// Время на этапе — только у машины в работе (у выпущенной и архивной оно ничего не говорит).
const since = computed(() => (released.value || props.item.status === 'archived' ? '' : sinceText(props.item.stageSinceUtc, props.now, tr)))

const num = (n: number, digits = 0) => formatNumberIn(locale.value, n, digits)
const counted = (key: 'parties' | 'places', n: number) => t(`broker.autoTransit.list.${key}.${pluralForm(n, locale.value)}`, { n: num(n) })
const meta = computed(() => {
  const i = props.item
  return [
    i.partiesCount > 0 && counted('parties', i.partiesCount),
    i.placesTotal > 0 && counted('places', i.placesTotal),
    i.grossKgTotal > 0 && t('broker.autoTransit.list.kg', { n: num(i.grossKgTotal, 1) }),
    i.driverName?.trim() && t('broker.autoTransit.list.driver', { name: i.driverName.trim() }),
  ].filter(Boolean).join(' · ')
})
const problemNote = computed(() => (props.item.status === 'problem' && props.item.problemNote?.trim() ? props.item.problemNote.trim() : undefined))
</script>

<template>
  <RouterLink
    :to="{ name: 'auto-transit-truck', params: { id: item.id } }"
    class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 text-ink no-underline outline-hidden transition-colors duration-150 ease-out hover:bg-canvas focus-visible:relative focus-visible:z-10 focus-visible:rounded-row focus-visible:shadow-focus motion-reduce:transition-none md:grid-cols-[minmax(120px,150px)_minmax(0,1fr)_minmax(160px,250px)_minmax(130px,180px)] md:items-center md:gap-x-4 md:gap-y-0"
    data-truck-row
  >
    <div class="order-1 min-w-0 md:order-none">
      <PlateTag :plate="item.plate" />
      <div v-if="item.trailerPlate?.trim()" class="mt-1 truncate text-xs text-muted max-md:hidden">{{ t('broker.autoTransit.list.trailer', { plate: item.trailerPlate.trim() }) }}</div>
    </div>

    <div class="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
      <div class="truncate text-sm font-medium text-ink" :title="title">{{ title }}</div>
      <div v-if="meta" class="mt-0.5 truncate text-xs text-muted max-md:hidden" :title="meta" data-truck-meta>{{ meta }}</div>
    </div>

    <div class="order-4 col-span-2 min-w-0 md:order-none md:col-span-1" data-truck-stage>
      <StageBar :steps="steps" :label="stageText" />
      <div class="mt-1.5 truncate text-xs text-muted" aria-hidden="true">
        {{ stageText }}<span v-if="since" class="md:hidden"> · {{ since }}</span>
      </div>
    </div>

    <div class="order-2 flex min-w-0 flex-col items-end gap-1 text-right md:order-none" data-truck-state>
      <div class="flex max-w-full flex-wrap justify-end gap-1">
        <ZTag :tone="tag.tone" :title="problemNote" class="max-w-full truncate">{{ t(tag.key) }}</ZTag>
        <ZTag v-if="item.stalled" tone="wait" size="sm" class="mt-0.5" data-truck-stalled>{{ t('broker.autoTransit.list.stalled') }}</ZTag>
      </div>
      <div v-if="since" class="text-xs tabular-nums text-muted max-md:hidden" data-truck-since>{{ since }}</div>
    </div>
  </RouterLink>
</template>
