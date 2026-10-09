<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import { clientStatusTone } from '@/views/broker/clients/clients'
import { formatDay } from '@/views/broker/list'
import type { ZColumn } from '@/ui/table'
import { clientRowName, type TeamClientRow } from './team'

// Вкладка «Клиенты»: только просмотр. Компания, логин, статус; клик ведёт в карточку клиента. Кнопки «Добавить клиента» нет:
// клиентов приглашают из раздела «Клиенты». Статус и компания известны, только если у пользователя есть право clients.read.
const props = defineProps<{
  rows: TeamClientRow[]
  loading: boolean
  error: boolean
  filtered: boolean
  /** Есть ли у строк статус (данные онбординга загрузились) — без него колонка не нужна. */
  withStatus: boolean
}>()
const emit = defineEmits<{ retry: []; reset: [] }>()

const { t } = useI18n()
const router = useRouter()

const columns = computed<ZColumn<TeamClientRow>[]>(() => [
  { key: 'client', title: t('broker.settings.team.col.client'), minWidth: 260 },
  ...(props.withStatus ? [{ key: 'status', title: t('broker.settings.team.col.status'), width: 150 } as ZColumn<TeamClientRow>] : []),
  { key: 'brokers', title: t('broker.settings.team.col.brokers'), minWidth: 200, className: 'max-sm:hidden' },
  { key: 'since', title: t('broker.settings.team.col.since'), width: 130, align: 'right', className: 'max-sm:hidden' },
])

const openCard = (c: TeamClientRow) => { void router.push(`/clients/${c.id}`) }
const customRow = (c: TeamClientRow) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    openCard(c)
  },
})
const emptyTitle = computed(() => (props.filtered ? t('broker.settings.team.nothing') : t('broker.settings.team.emptyClients')))
const people = (c: TeamClientRow) => [...c.brokers, ...c.expeditors].join(', ')
</script>

<template>
  <div v-if="error && !rows.length && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-team-error>
    <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.team.loadError') }}</p>
    <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-team-retry @click="emit('retry')">{{ t('broker.settings.team.retry') }}</ZButton>
  </div>
  <div v-else class="flex flex-col gap-3">
    <p class="m-0 text-sm text-muted" data-team-clients-hint>
      {{ t('broker.settings.team.clientsHint') }} ·
      <RouterLink to="/clients" class="rounded-field text-ink underline outline-hidden focus-visible:shadow-focus">{{ t('broker.settings.team.openClients') }}</RouterLink>
    </p>
    <ZTable
      :columns="columns"
      :data-source="rows"
      row-key="id"
      :loading="loading"
      :custom-row="customRow"
      :pagination="{ pageSize: 25 }"
      :scroll="{ x: 640 }"
      :aria-label="t('broker.settings.team.tableClients')"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-team-table="clients"
    >
      <template #bodyCell="{ column, record }">
        <button
          v-if="column.key === 'client'"
          type="button"
          class="flex min-w-0 max-w-full cursor-pointer items-center gap-2.5 rounded-field border-0 bg-transparent p-0 text-left font-sans outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
          data-client-open
          @click="openCard(record)"
        >
          <ZAvatar :name="clientRowName(record)" class="size-8" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-ink" data-client-name>{{ clientRowName(record) }}</span>
            <span class="block truncate font-mono text-xs text-muted" data-client-login>{{ record.username }}</span>
          </span>
        </button>
        <ZTag v-else-if="column.key === 'status'" :tone="record.status ? clientStatusTone(record.status) : 'neutral'" data-client-status>{{ record.status ? t(`broker.settings.team.status.${record.status}`) : '—' }}</ZTag>
        <span v-else-if="column.key === 'brokers'" class="text-sm text-ink-3">{{ people(record) || '—' }}</span>
        <span v-else-if="column.key === 'since'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ formatDay(record.createdAtUtc) }}</span>
      </template>
      <template #emptyText>
        <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.settings.team.nothingHint') : undefined">
          <template v-if="filtered" #action>
            <ZButton data-team-reset @click="emit('reset')">{{ t('broker.settings.team.resetFilters') }}</ZButton>
          </template>
        </ZEmpty>
      </template>
    </ZTable>
  </div>
</template>
