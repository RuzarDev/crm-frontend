<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhBuildings, PhDotsThree, PhFileText, PhTrain, PhTrash } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import type { ReestrEntry } from '@/types/api'
import { formatContainer, statusKey, statusTone } from '../transit'

// Шапка записи транзита (доска TransitRecord): крошки «Транзит / №» (из «Моих документов» — «Мои документы / №»),
// крупно контейнер моно + точка-статус; строка: клиент · «станция отправления → станция назначения» · «ТД №»;
// справа «Сменить статус» и «⋯» (удалить). Значения — сохранённой записи (entry), не черновика.
const props = defineProps<{
  entry: ReestrEntry | null
  clientName: string | null
  clientTo: string | null
  fromMyDocuments: boolean
  canChangeStatus: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{ status: []; delete: [] }>()
const { t } = useI18n()

const val = (key: string): string | null => {
  const v = props.entry?.data[key]
  return v && v.trim() ? v.trim() : null
}
const number = computed(() => val('№'))
const container = computed(() => {
  const v = val('Контейнер')
  return v ? formatContainer(v) : null
})
const title = computed(() => {
  if (container.value) return container.value
  if (number.value) return t('broker.transitRecord.page.recordNo', { n: number.value })
  return t('broker.transitRecord.page.newRecord')
})

const crumbs = computed(() => [
  props.fromMyDocuments
    ? { label: t('transit.moiDokumenty'), to: '/my-documents' }
    : { label: t('broker.transit.title'), to: '/reestr' },
  {
    label: number.value ?? container.value
      ?? (props.entry ? t('broker.transitRecord.page.record') : t('broker.transitRecord.page.newRecord')),
  },
])

const status = computed(() => (props.entry
  ? { tone: statusTone(props.entry.status), label: t(`enum.reestrStatus.${statusKey(props.entry.status)}`) }
  : null))

/** Станция отправления → станция назначения; только то, что есть. */
const route = computed(() => {
  const from = props.entry?.transit?.loadingRailStation?.trim() || null
  const to = props.entry?.transit?.unloadingRailStation?.trim() || val('Станция назначения')
  return [from, to].filter(Boolean).join(' → ') || null
})
const td = computed(() => val('ТД'))

const menu = computed<ZDropdownItem[]>(() =>
  props.canDelete ? [{ key: 'delete', label: t('broker.transitRecord.header.delete'), icon: PhTrash, danger: true }] : [])
const onMenu = (key: string) => {
  if (key === 'delete') emit('delete')
}

const metaItem = 'inline-flex min-w-0 items-center gap-1.5'
</script>

<template>
  <header class="flex flex-col gap-2.5" data-record-header>
    <ZBreadcrumbs :items="crumbs" />
    <div class="flex flex-wrap items-start gap-3.5">
      <div class="min-w-0 flex-1 basis-80">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1
            class="m-0 min-w-0 text-[22px] leading-[1.2] font-semibold text-ink [overflow-wrap:anywhere]"
            :class="container ? 'font-mono tracking-normal' : 'tracking-[-0.02em]'"
            data-record-title
          >{{ title }}</h1>
          <StatusDot v-if="status" :tone="status.tone" :label="status.label" data-record-status />
        </div>
        <div v-if="clientName || route || td" class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-3" data-record-meta>
          <span v-if="clientName" :class="metaItem">
            <PhBuildings :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="sr-only">{{ t('broker.transitRecord.header.client') }}:</span>
            <RouterLink
              v-if="clientTo"
              :to="clientTo"
              class="min-w-0 rounded-[4px] text-ink-2 no-underline outline-hidden hover:underline focus-visible:shadow-focus"
              data-record-client
            >{{ clientName }}</RouterLink>
            <span v-else class="min-w-0 text-ink-2" data-record-client>{{ clientName }}</span>
          </span>
          <span v-if="route" :class="metaItem" data-record-route>
            <PhTrain :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="sr-only">{{ t('broker.transitRecord.header.route') }}:</span>{{ route }}
          </span>
          <span v-if="td" :class="metaItem" data-record-td>
            <PhFileText :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            {{ t('broker.transitRecord.header.td') }} <span class="font-mono text-ink-2">{{ td }}</span>
          </span>
        </div>
      </div>
      <div v-if="canChangeStatus || menu.length" class="flex shrink-0 items-center gap-2">
        <ZButton
          v-if="canChangeStatus"
          class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11"
          data-record-change-status
          @click="emit('status')"
        >{{ t('transit.smenitStatus') }}</ZButton>
        <ZDropdown v-if="menu.length" :items="menu" @select="onMenu">
          <button
            type="button"
            :aria-label="t('broker.transitRecord.header.more')"
            :title="t('broker.transitRecord.header.more')"
            class="inline-flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11"
            data-record-more
          >
            <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </div>
    </div>
  </header>
</template>
