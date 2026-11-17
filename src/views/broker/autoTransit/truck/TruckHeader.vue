<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsThree, PhLink } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { TruckCard } from '@/api/autoTransit'
import { listPath } from '@/shell/listReturn'
import { pluralForm } from '@/views/broker/list'
import PlateTag from '../PlateTag.vue'
import { stateTag } from '../autoTransit'
import { ddmm, hhmm, lastMachineMark, type TruckRights } from './truckView'

// Шапка карточки (макет 2): крошка к списку (с его фильтром), номер тягача и прицеп, строка «водитель · перевозчик ·
// заехала · пост», метки (консолидация, состояние), «Ссылки получателям» и меню «…».
const props = defineProps<{ card: TruckCard; rights: TruckRights; busy?: boolean }>()
const emit = defineEmits<{ links: []; menu: [key: string] }>()
const { t, locale } = useI18n()
const T = 'broker.autoTransit.truck'

const crumbs = computed(() => [{ label: t('broker.autoTransit.list.title'), to: listPath('autoTransit', '/auto-transit') }, { label: props.card.plate }])
const facts = computed(() => {
  const c = props.card
  const out: string[] = []
  if (c.driverName.trim()) out.push(t(`${T}.driver`, { name: c.driverName.trim() }))
  if (c.carrierName.trim()) out.push(t(`${T}.carrier`, { name: c.carrierName.trim() }))
  if (c.arrivedAtUtc) out.push(t(`${T}.arrived`, { at: `${ddmm(c.arrivedAtUtc)} ${hhmm(c.arrivedAtUtc)}` }))
  if (c.customsPostCode.trim()) out.push(t(`${T}.post`, { code: c.customsPostCode.trim() }))
  return out.join(' · ')
})
const consolidation = computed(() => {
  const n = props.card.parties.length
  return n >= 2 ? t(`${T}.consolidation`, { parties: t(`broker.autoTransit.list.parties.${pluralForm(n, locale.value)}`, { n }) }) : ''
})
const state = computed(() => stateTag(props.card))

const items = computed<ZDropdownItem[]>(() => {
  const r = props.rights
  const out: ZDropdownItem[] = []
  if (r.editTruck) out.push({ key: 'edit', label: t(`${T}.edit`) })
  // Отменять нечего (нет отметки машины 2–4 или 7; этап 1 не отменяется) — пункта нет.
  if (r.undo && lastMachineMark(props.card) != null) out.push({ key: 'undo', label: t(`${T}.undoLast`) })
  if (r.problem) out.push({ key: 'problem', label: t(`${T}.problem`), divider: out.length > 0 })
  if (r.clearProblem) out.push({ key: 'clearProblem', label: t(`${T}.clearProblem`), divider: out.length > 0 })
  if (r.archive) out.push({ key: 'archive', label: t(`${T}.archive`), danger: true, divider: out.length > 0 })
  if (r.unarchive) out.push({ key: 'unarchive', label: t(`${T}.unarchive`) })
  return out
})
</script>

<template>
  <header class="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3" data-truck-header>
    <div class="min-w-0 flex-1 basis-72">
      <div class="mb-1 text-sm text-muted"><ZBreadcrumbs :items="crumbs" /></div>
      <h1 class="m-0 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xl font-semibold text-ink">
        <PlateTag :plate="card.plate" class="text-base" />
        <span v-if="card.trailerPlate.trim()" class="min-w-0 text-base font-normal text-muted" data-truck-trailer>
          {{ t(`${T}.trailer`) }} <span class="font-mono text-ink-2">{{ card.trailerPlate }}</span>
        </span>
      </h1>
      <p v-if="facts" class="m-0 mt-1 text-sm break-words text-ink-3" data-truck-facts>{{ facts }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <ZTag v-if="consolidation" tone="info" data-truck-consolidation>{{ consolidation }}</ZTag>
        <ZTag :tone="state.tone" data-truck-state>{{ t(state.key) }}</ZTag>
      </div>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <ZButton v-if="rights.links" class="max-sm:h-11" data-truck-links @click="emit('links')">
        <PhLink :size="16" aria-hidden="true" />{{ t(`${T}.links`) }}
      </ZButton>
      <ZDropdown v-if="items.length" :items="items" @select="emit('menu', $event)">
        <ZButton class="max-sm:h-11 max-sm:w-11 max-sm:px-0" :disabled="busy" :aria-label="t(`${T}.more`)" data-truck-more>
          <PhDotsThree :size="20" weight="bold" aria-hidden="true" />
        </ZButton>
      </ZDropdown>
    </div>
  </header>
</template>
