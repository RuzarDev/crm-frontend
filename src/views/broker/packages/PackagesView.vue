<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import CreatePackageModal from './CreatePackageModal.vue'
import PackageDrawer from './PackageDrawer.vue'
import { documentPackagesApi } from '@/api/documentPackages'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { formatUpdated } from '@/views/broker/list'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import type { DocumentPackageDto } from '@/types/api'
import { PACKAGE_STATUSES, filterPackages, formatStamp, statusCounts, statusLabelKey, statusTone, type PackageSegment } from './packages'

// «Пакеты документов» (редизайн, волна 3а, доска Packages): экспедиторы загружают пакеты по поездам, брокеры их проверяют.
// Один запрос без фильтров — сервер отдаёт до 200 последних; поиск (номер поезда, комментарий) и статус считаются на клиенте.
// Строка открывает боковую панель пакета; смена статуса, файлы и «Открыть пакет» — в ней.
const { t } = useI18n()
const auth = useAuthStore()

const role = computed(() => (auth.role ?? '').trim().toLowerCase())
const isExpeditor = computed(() => role.value === 'expeditor')
const canCreate = computed(() => role.value === 'expeditor' || role.value === 'administrator')
// Аудит §4.2: разбор пакетов — по праву packages.manage, а не по системной роли.
const canReview = computed(() => auth.hasPermission('packages.manage'))

const board = useBlock(true, () => documentPackagesApi.list(undefined, { silent: true }))
// Клиенты экспедитора — справочная строка; ошибка не мешает работе (тост показал перехватчик).
const clients = useBlock(isExpeditor.value, () => reestrApi.listPortfolioClients())
onMounted(() => { void Promise.all([board.load(), clients.load()]) })

const items = computed<DocumentPackageDto[]>(() => board.data?.items ?? [])
const truncated = computed(() => (board.data ? board.data.totalCount > board.data.items.length : false))

// ---- Поиск и статус ----
const query = ref('')
const segment = ref<PackageSegment>('all')
const filtered = computed(() => !!query.value.trim() || segment.value !== 'all')
const rows = computed(() => filterPackages(items.value, query.value, segment.value))
const counts = computed(() => statusCounts(items.value, query.value))
const ready = computed(() => !board.loading && !board.error)
const segmentOptions = computed(() => (['all', ...PACKAGE_STATUSES] as PackageSegment[]).map((k) => ({
  value: k,
  label: t(`broker.packages.segment.${k}`),
  count: ready.value ? counts.value[k] : undefined,
})))
const resetFilters = () => { query.value = ''; segment.value = 'all' }

// ---- Таблица ----
const columns = computed<ZColumn<DocumentPackageDto>[]>(() => [
  { key: 'package', title: t('broker.packages.col.package'), width: 220 },
  ...(canReview.value ? [{ key: 'expeditor', title: t('broker.packages.col.expeditor'), width: 200 }] : []),
  { key: 'containers', title: t('broker.packages.col.containers'), width: 110, align: 'right' as const, className: 'max-sm:hidden' },
  { key: 'files', title: t('broker.packages.col.files'), width: 80, align: 'right' as const, className: 'max-sm:hidden' },
  { key: 'status', title: t('broker.packages.col.status'), width: 160 },
  { key: 'created', title: t('broker.packages.col.created'), width: 96, align: 'right' as const },
])

const pagination = computed(() => ({
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.packages.range', { from, to, total }),
}))

const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))

// ---- Панель пакета ----
const drawerOpen = ref(false)
const openId = ref<string | null>(null)
// Строку для панели берём из свежего списка; пока её там нет (создали только что, поиск скрыл) — та, с которой открыли.
const lastRow = ref<DocumentPackageDto | null>(null)
const drawerRow = computed(() => items.value.find((p) => p.id === openId.value) ?? lastRow.value)
const openPackage = (p: DocumentPackageDto) => {
  lastRow.value = p
  openId.value = p.id
  drawerOpen.value = true
}
const customRow = (p: DocumentPackageDto) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    openPackage(p)
  },
})
const rowClassName = (p: DocumentPackageDto) =>
  (drawerOpen.value && p.id === openId.value ? 'bg-zircon-soft hover:bg-zircon-soft shadow-[inset_3px_0_0_var(--color-zircon)]' : '')

// ---- Создание ----
const createOpen = ref(false)
const onCreated = async (pkg: DocumentPackageDto, failedFiles: number) => {
  // Пакет уже есть — открываем его панель; недогруженные файлы добавляют там.
  openPackage(pkg)
  if (failedFiles) message.warning(t('broker.packages.someFilesFailed'))
  else message.success(t('transit.paketSozdan'))
  await board.load()
}

const now = () => new Date()
const emptyTitle = computed(() => (filtered.value ? t('broker.list.nothingFound') : t('broker.packages.empty')))
</script>

<template>
  <div class="flex flex-col gap-4" data-packages>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.packages.title') }}</h1>
        <span
          v-if="board.data"
          class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
          data-packages-count
        >{{ board.data.totalCount }}</span>
      </div>
      <div v-if="canCreate" class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="primary" class="max-sm:h-11 max-sm:flex-1" data-packages-new @click="createOpen = true">
          <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
          {{ t('broker.packages.newPackage') }}
        </ZButton>
      </div>
    </div>

    <p v-if="isExpeditor && clients.data" class="m-0 text-sm text-muted" data-packages-clients>
      <template v-if="clients.data.length">{{ t('transit.vashiKlienty') }}: {{ clients.data.map((c) => `${c.username} (${c.declarationCount})`).join(', ') }}</template>
      <template v-else>{{ t('transit.klientyPokaNePrivyazany') }}</template>
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.packages.search')" class="min-w-0 max-sm:basis-full sm:basis-60 sm:flex-1" @update:value="query = $event" />
      <ZSegmented
        :value="segment"
        :options="segmentOptions"
        :aria-label="t('broker.packages.segmentsLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-packages-segments
        @update:value="segment = $event as PackageSegment"
      />
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-packages-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-packages-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-packages-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-packages-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :loading="board.loading"
        :custom-row="customRow"
        :row-class-name="rowClassName"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.packages.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-packages-table
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'package'">
            <button
              type="button"
              class="block max-w-full cursor-pointer truncate rounded-field border-0 bg-transparent p-0 text-left font-sans max-sm:min-h-11 max-sm:text-right text-sm font-semibold text-ink outline-hidden hover:underline focus-visible:shadow-focus"
              :title="record.trainNumber"
              data-package-open
              @click="openPackage(record)"
            >{{ record.trainNumber }}</button>
            <span v-if="record.comment" class="block truncate text-xs text-muted" :title="record.comment">{{ record.comment }}</span>
          </template>
          <ClientCell v-else-if="column.key === 'expeditor'" :name="record.createdByExpeditorUsername" />
          <span v-else-if="column.key === 'containers'" class="tabular-nums">{{ record.containers.length }}</span>
          <span v-else-if="column.key === 'files'" class="tabular-nums text-ink-2">{{ record.files.length }}</span>
          <ZTag v-else-if="column.key === 'status'" :tone="statusTone(record.status)">{{ t(statusLabelKey(record.status)) }}</ZTag>
          <span v-else-if="column.key === 'created'" class="whitespace-nowrap text-sm tabular-nums text-ink-3" :title="formatStamp(record.createdAtUtc)">{{ formatUpdated(record.createdAtUtc, now(), t) }}</span>
        </template>
        <template #emptyText>
          <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.list.nothingFoundHint') : (canCreate ? undefined : t('broker.packages.emptyHint'))">
            <template v-if="filtered || canCreate" #action>
              <ZButton v-if="filtered" data-packages-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
              <ZButton v-else variant="primary" @click="createOpen = true">{{ t('broker.packages.newPackage') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>

      <p v-if="truncated" class="m-0 text-sm text-ink-3" data-packages-truncated>{{ t('broker.list.truncated', { n: items.length }) }}</p>
    </template>

    <PackageDrawer v-model:open="drawerOpen" :row="drawerRow" @changed="board.load()" />
    <CreatePackageModal v-if="canCreate" v-model:open="createOpen" @created="onCreated" />
  </div>
</template>
