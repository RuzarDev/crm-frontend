<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { systemApi } from '@/api/system'
import { useBlock } from '@/views/home/useBlock'
import type { EndpointRow } from '@/types/api'
import type { ZColumn } from '@/ui/table'

// «Система» раздела «Настройки» (волна 5б): каталог адресов REST API — метод, политики, анонимный доступ.
// Экран для разработчиков, доступ — право endpoints.read. Поиск по адресу и политике — на клиенте.
const { t } = useI18n()
const board = useBlock<EndpointRow[]>(true, async () => (await systemApi.getEndpoints({ silent: true })).data)
const query = ref('')

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = board.data ?? []
  if (!q) return all
  return all.filter((e) => e.route.toLowerCase().includes(q) || e.policies.some((p) => p?.toLowerCase().includes(q)))
})

// computed, а не константа: заголовки следуют за языком интерфейса.
const columns = computed<ZColumn<EndpointRow>[]>(() => [
  { key: 'route', title: t('broker.settings.system.col.route'), dataIndex: 'route', minWidth: 260 },
  { key: 'methods', title: t('broker.settings.system.col.methods'), width: 150 },
  { key: 'access', title: t('broker.settings.system.col.access'), width: 300 },
])

// Метод — цветной бейдж: чтение зелёный, создание синий, правка жёлтый/фиолетовый, удаление красный.
const METHOD_TONE: Record<string, ZTone> = { GET: 'done', POST: 'info', PUT: 'wait', PATCH: 'submitted', DELETE: 'danger' }
const methodTone = (m: string): ZTone => METHOD_TONE[m.toUpperCase()] ?? 'neutral'

const pagination = { pageSize: 30 }
const emptyTitle = computed(() => (query.value.trim()
  ? t('broker.settings.system.nothing', { q: query.value.trim() })
  : t('broker.settings.system.empty')))

onMounted(() => { void board.load() })
</script>

<template>
  <div class="flex flex-col gap-4" data-system>
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-3">
          <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.settings.system.title') }}</h1>
          <span
            v-if="board.data"
            class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
            :aria-label="t('broker.settings.system.count', { n: board.data.length })"
            data-system-count
          >{{ board.data.length }}</span>
        </div>
        <p class="m-0 mt-1 text-sm text-muted" data-system-hint>{{ t('broker.settings.system.hint') }}</p>
      </div>
      <ZButton variant="ghost" :loading="board.loading && !!board.data" class="ml-auto max-sm:h-11 max-sm:w-full" data-system-refresh @click="board.load()">
        <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
        {{ t('broker.list.refresh') }}
      </ZButton>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.settings.system.search')" @update:value="query = $event" />
    </div>

    <div v-if="board.error && !board.data" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-system-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.system.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-system-retry @click="board.load()">{{ t('broker.settings.system.retry') }}</ZButton>
    </div>
    <ZTable
      v-else
      :columns="columns"
      :data-source="rows"
      row-key="route"
      :loading="board.loading"
      :pagination="pagination"
      :scroll="{ x: 720 }"
      :aria-label="t('broker.settings.system.title')"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-system-table
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'route'" class="break-all font-mono text-[12.5px] text-ink" data-system-route>{{ record.route }}</span>
        <span v-else-if="column.key === 'methods'" class="flex flex-wrap gap-1" data-system-methods>
          <ZTag v-for="m in record.methods" :key="m" :tone="methodTone(m)" size="sm" class="font-mono" data-system-method>{{ m }}</ZTag>
        </span>
        <span v-else-if="column.key === 'access'" class="flex flex-wrap gap-1" data-system-access>
          <ZTag v-if="record.allowsAnonymous" tone="neutral" size="sm" data-system-anonymous>{{ t('broker.settings.system.anonymous') }}</ZTag>
          <template v-else>
            <ZTag v-for="p in record.policies" :key="p" tone="info" size="sm" data-system-policy>{{ p }}</ZTag>
            <ZTag v-if="!record.policies.length" tone="wait" size="sm" data-system-authorized>{{ t('broker.settings.system.authorized') }}</ZTag>
          </template>
        </span>
      </template>
      <template #emptyText>
        <ZEmpty :title="emptyTitle" :hint="query.trim() ? t('broker.settings.system.nothingHint') : undefined" />
      </template>
    </ZTable>
  </div>
</template>
