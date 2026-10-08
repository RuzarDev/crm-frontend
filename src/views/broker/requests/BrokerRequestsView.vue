<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCaretDown, PhDownloadSimple, PhFlag, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown from '@/components/z/ZDropdown.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTabs from '@/components/z/ZTabs.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import PeriodChip from '@/components/broker/PeriodChip.vue'
import SelectionBar from '@/components/broker/SelectionBar.vue'
import CreateRequestModal from './CreateRequestModal.vue'
import { import40BoardApi, type Import40BoardRow } from '@/api/import40Board'
import { import40Api, IMPORT40_STATUSES } from '@/api/import40'
import { manageApi, type StaffMember } from '@/api/manage'
import { useAuthStore } from '@/stores/auth'
import { useImport40Status } from '@/composables/useImport40Status'
import { TOTAL_STEPS } from '@/utils/import40Steps'
import { useBlock } from '@/views/home/useBlock'
import { exportXlsx, formatUpdated } from '@/views/broker/list'
import { message } from '@/ui/message'
import { formatMoney } from '@/ui/number'
import { formatDateText } from '@/ui/date'
import type { ZColumn, ZKey } from '@/ui/table'
import {
  REQUEST_TABS, clientOptions as buildClientOptions, emptyFilters, executorInfo, executorOptions as buildExecutorOptions,
  executorText, filterRows, formatTnved, hasFilters, inTab, parseTab, stageTone, tabCounts,
  type RequestFilters, type RequestTab,
} from './requests'

// «Заявки» сотрудника (редизайн, волна 3а, доска Requests): вкладки, фильтры, таблица, назначение нескольких.
// Один запрос «все» (вкладки «В работе», «Ждут клиента», «Черновики», «Завершённые» считаются на клиенте)
// и один «мои» (view=my — какие заявки ждут именно вас, решает сервер); уходят параллельно.
// Вкладка живёт в адресе (?tab=, replace — «Назад» не листает вкладки). ?new=1 открывает окно создания.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { statusLabel } = useImport40Status()

const board = useBlock(true, () => import40BoardApi.list('all', { silent: true }))
const mine = useBlock(true, () => import40BoardApi.list('my', { silent: true }))
const reload = () => Promise.all([board.load(), mine.load()])
onMounted(() => { void reload() })
// «Обновить» крутится только поверх уже показанных данных (первую загрузку видно по скелетону).
const refreshing = computed(() => (board.loading || mine.loading) && !!(board.data || mine.data))

// ---- Права ----
const canCreate = computed(() => auth.canCreateImport40 || (auth.role ?? '').trim().toLowerCase() === 'administrator')
const canAssign = computed(() => auth.hasPermission('import40.assign'))

// ---- Вкладка ----
// Бухгалтеру и продажам «Мои» всегда пусты (у них нет шага в заявке) — открываем им «В работе».
const defaultTab = computed<RequestTab>(() => (auth.hasBusinessRole('accountant') || auth.hasBusinessRole('sales') ? 'active' : 'my'))
const tab = computed<RequestTab>(() => parseTab(route.query.tab) ?? defaultTab.value)
const setTab = (k: string) => { void router.replace({ query: { ...route.query, tab: k } }) }

// ---- Окно создания: ?new=1 открывает (только тем, кто вправе создавать) и убирает параметр из адреса ----
const createOpen = ref(false)
watch(() => route.query.new, (v) => {
  if (v !== '1') return
  void router.replace({ query: { ...route.query, new: undefined } })
  if (canCreate.value) createOpen.value = true
}, { immediate: true })

// ---- Фильтры (общие для вкладок) ----
const filters = ref<RequestFilters>(emptyFilters())
const patch = (p: Partial<RequestFilters>) => { filters.value = { ...filters.value, ...p } }
const filtered = computed(() => hasFilters(filters.value))
const resetFilters = () => { filters.value = emptyFilters() }

const allRows = computed<Import40BoardRow[]>(() => board.data?.items ?? [])
const myRows = computed<Import40BoardRow[]>(() => mine.data?.items ?? [])
const tabRows = computed(() => (tab.value === 'my' ? myRows.value : allRows.value.filter((r) => inTab(r, tab.value))))
const rows = computed(() => filterRows(tabRows.value, filters.value))

// Варианты фильтров — из всех известных строк (не только текущей вкладки): выбранное значение всегда имеет подпись.
const known = computed(() => [...allRows.value, ...myRows.value])
const clientOptions = computed(() => buildClientOptions(known.value))
const executorOptions = computed(() => buildExecutorOptions(known.value, t))
const stageOptions = computed(() => IMPORT40_STATUSES.map((s) => ({ value: String(s.id), label: statusLabel(s.id) })))

// Шапка — число заявок «В работе» без фильтров; счётчики вкладок — по найденному (видно, где совпадения).
const headCount = computed(() => tabCounts(allRows.value).active)
const counts = computed(() => tabCounts(filterRows(allRows.value, filters.value)))
const tabItems = computed(() => REQUEST_TABS.map((k) => ({
  key: k,
  label: t(`broker.requests.tab.${k}`),
  count: k === 'my'
    ? (mine.loading || mine.error ? undefined : filterRows(myRows.value, filters.value).length)
    : (board.loading || board.error ? undefined : counts.value[k]),
})))

// Ошибка и загрузка — источника текущей вкладки.
const source = computed(() => (tab.value === 'my' ? mine : board))
const retry = () => { void source.value.load() }

// ---- Выбор и назначение ----
const selected = ref<string[]>([])
const page = ref(1)
watch([tab, filters], () => { selected.value = []; page.value = 1 }, { deep: true })
const rowSelection = computed(() => (canAssign.value && tab.value !== 'done'
  ? { selectedRowKeys: selected.value as ZKey[], onChange: (keys: ZKey[]) => { selected.value = keys.map(String) } }
  : undefined))

// Сотрудники для назначения: заранее — при первом выборе строки; при открытии меню — снова, если прошлая
// загрузка упала или ещё не завершилась (ответ прежнего запроса отбрасывается). Тост ошибки показал перехватчик.
const staff = ref<StaffMember[]>([])
const staffState = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
let staffSeq = 0
const loadStaff = async () => {
  if (!canAssign.value) return
  const my = ++staffSeq
  staffState.value = 'loading'
  try {
    const list = await manageApi.staff()
    if (my !== staffSeq) return
    staff.value = list
    staffState.value = 'ok'
  } catch {
    if (my === staffSeq) staffState.value = 'error'
  }
}
watch(() => selected.value.length > 0, (any) => { if (any && staffState.value === 'idle') void loadStaff() })
const onAssignMenu = (open: boolean) => { if (open && staffState.value !== 'ok') void loadStaff() }
const staffItems = (role: string) => {
  if (staffState.value === 'error') return [{ key: '', label: t('broker.requests.staffError'), disabled: true }]
  if (staffState.value !== 'ok') return [{ key: '', label: t('common.loading'), disabled: true }]
  const list = staff.value.filter((u) => u.roles.includes(role)).map((u) => ({ key: u.id, label: u.displayName || u.username }))
  return list.length ? list : [{ key: '', label: t('broker.requests.noStaff'), disabled: true }]
}
const declarantItems = computed(() => staffItems('declarant'))
const kppItems = computed(() => staffItems('kpp'))

const assigning = ref(false)
const assign = async (field: 'assignedDeclarantId' | 'assignedKppId', staffId: string) => {
  if (!staffId || assigning.value) return
  assigning.value = true
  let ok = 0
  let fail = 0
  try {
    // По одной, последовательно: сервер проверяет права на каждую заявку отдельно; итог — одним тостом.
    for (const id of [...selected.value]) {
      try {
        await import40Api.update(id, { [field]: staffId }, { silent: true })
        ok++
      } catch {
        fail++
      }
    }
    if (fail) message.warning(t('broker.requests.assignedFailed', { ok, fail }))
    else message.success(t('broker.requests.assigned', { ok }))
    selected.value = []
    await reload()
  } finally {
    assigning.value = false
  }
}

// ---- Таблица ----
const columns = computed<ZColumn<Import40BoardRow>[]>(() => [
  { key: 'request', title: t('broker.requests.col.request'), width: 160, sorter: (a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }) },
  { key: 'client', title: t('broker.requests.col.client'), width: 170 },
  { key: 'tnved', title: t('broker.requests.col.tnved'), width: 140 },
  { key: 'stage', title: t('broker.requests.col.stage'), width: 200, sorter: (a, b) => a.status - b.status },
  { key: 'executor', title: t('broker.requests.col.executor'), width: 130 },
  { key: 'payments', title: t('broker.requests.col.payments'), width: 110, align: 'right' },
  { key: 'updated', title: t('broker.requests.col.updated'), width: 96, align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => Date.parse(a.updatedAtUtc) - Date.parse(b.updatedAtUtc) },
])
// Ширина таблицы — сумма колонок (+40 под колонку выбора): иначе узкие колонки сжимаются и «+N» наезжает на «Этап».
const tableWidth = computed(() => columns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), rowSelection.value ? 40 : 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.requests.range', { from, to, total }),
}))

const caseLink = (r: Import40BoardRow) => `/import-40/${r.id}`
// Строка кликабельна целиком; ссылка-номер (ctrl/⌘-клик, новая вкладка) и кнопки внутри строки работают сами.
const customRow = (r: Import40BoardRow) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    void router.push(caseLink(r))
  },
})
const you = computed(() => auth.userId)
// В ячейке — «Имя Ф.», полный текст — в подсказке.
const executor = (r: Import40BoardRow) => executorInfo(r, you.value, t, true)
const now = () => new Date()
const stamp = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return Number.isNaN(d.getTime()) ? '' : `${formatDateText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---- Excel: отфильтрованные строки текущей вкладки ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const c = (k: string) => t(`broker.requests.col.${k}`)
    await exportXlsx(t('broker.requests.excelFile'), t('broker.requests.excelSheet'), rows.value.map((r) => ({
      [c('request')]: r.number,
      [t('broker.requests.create.cargo')]: r.cargo,
      [c('client')]: r.clientName,
      [t('broker.requests.create.post')]: r.post ?? '',
      [c('tnved')]: r.tnvedCodes.join(', '),
      [c('stage')]: statusLabel(r.status),
      [c('executor')]: executorText(r, you.value, t),
      [c('payments')]: r.customsPaymentsKzt,
      [c('updated')]: stamp(r.updatedAtUtc),
    })))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}

const emptyTitle = computed(() => (filtered.value ? t('broker.list.nothingFound') : t(tab.value === 'my' ? 'broker.requests.emptyMy' : 'broker.requests.emptyAll')))
</script>

<template>
  <div class="flex flex-col gap-4" data-broker-requests>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.requests.title') }}</h1>
        <span
          v-if="!board.loading && !board.error"
          class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
          data-requests-count
        >{{ headCount }}</span>
      </div>
      <div class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="refreshing" class="max-sm:h-11 max-sm:flex-1" data-requests-refresh @click="reload">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton :loading="exporting" :disabled="!rows.length" class="max-sm:h-11 max-sm:flex-1" data-requests-excel @click="exportExcel">
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
        <ZButton v-if="canCreate" variant="primary" class="max-sm:h-11 max-sm:flex-1" data-requests-new @click="createOpen = true">
          <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
          {{ t('broker.requests.newRequest') }}
        </ZButton>
      </div>
    </div>

    <ZTabs variant="line" :active-key="tab" :items="tabItems" data-requests-tabs @change="setTab" />

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="filters.q" :placeholder="t('broker.requests.search')" class="min-w-0 max-sm:basis-full sm:basis-60 sm:flex-1" @update:value="patch({ q: $event })" />
      <FilterChip :label="t('broker.requests.filter.client')" :options="clientOptions" :value="filters.client" @update:value="patch({ client: $event })" />
      <FilterChip :label="t('broker.requests.filter.executor')" :options="executorOptions" :value="filters.executor" @update:value="patch({ executor: $event })" />
      <FilterChip :label="t('broker.requests.filter.stage')" :options="stageOptions" :value="filters.stage" @update:value="patch({ stage: $event })" />
      <PeriodChip :label="t('broker.list.period')" :value="filters.period" @update:value="patch({ period: $event })" />
    </div>

    <div v-if="source.error && !source.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-requests-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-requests-retry @click="retry">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="source.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-requests-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-requests-retry @click="retry">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :loading="source.loading"
        :row-selection="rowSelection"
        :custom-row="customRow"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.requests.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-requests-table
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'request'">
            <RouterLink :to="caseLink(record)" class="block truncate rounded-field font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus" data-request-link>{{ record.number }}</RouterLink>
            <span class="block truncate text-xs text-muted" :title="record.cargo">{{ record.cargo }}</span>
          </template>
          <ClientCell v-else-if="column.key === 'client'" :name="record.clientName" />
          <template v-else-if="column.key === 'tnved'">
            <span v-if="!record.tnvedCodes.length" class="text-muted">—</span>
            <span v-else class="whitespace-nowrap font-mono text-sm text-ink-2" :title="record.tnvedCodes.length > 1 ? record.tnvedCodes.map(formatTnved).join('\n') : undefined">
              {{ formatTnved(record.tnvedCodes[0]) }}<span v-if="record.tnvedCodes.length > 1" class="ml-1.5 text-xs text-muted">+{{ record.tnvedCodes.length - 1 }}</span>
            </span>
          </template>
          <span v-else-if="column.key === 'stage'" class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <ZTag :tone="stageTone(record.status)">{{ statusLabel(record.status) }}</ZTag>
            <span v-if="record.status < 8" class="text-xs tabular-nums text-muted">{{ t('broker.requests.stepOf', { step: record.step, total: TOTAL_STEPS }) }}</span>
            <ZTag v-if="record.isProblem" tone="danger">
              <PhFlag :size="12" weight="fill" class="mr-1" aria-hidden="true" />{{ t('broker.requests.problem') }}
            </ZTag>
          </span>
          <template v-else-if="column.key === 'executor'">
            <span v-if="executor(record).text" class="text-sm text-ink-2" :title="executorText(record, you, t)">{{ executor(record).text }}<template v-if="executor(record).missing"> · </template></span>
            <span v-if="executor(record).missing" class="text-sm font-medium text-gold-ink">{{ t('broker.requests.unassigned') }}</span>
            <span v-else-if="!executor(record).text" class="text-muted">—</span>
          </template>
          <span v-else-if="column.key === 'payments'" class="whitespace-nowrap tabular-nums" :class="record.customsPaymentsKzt ? 'text-ink' : 'text-muted'">{{ record.customsPaymentsKzt ? formatMoney(record.customsPaymentsKzt) : '—' }}</span>
          <span v-else-if="column.key === 'updated'" class="whitespace-nowrap text-sm tabular-nums text-ink-3" :title="stamp(record.updatedAtUtc)">{{ formatUpdated(record.updatedAtUtc, now(), t) }}</span>
        </template>
        <template #emptyText>
          <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.list.nothingFoundHint') : undefined">
            <template v-if="filtered" #action>
              <ZButton data-requests-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>

      <p v-if="source.data?.truncated" class="m-0 text-sm text-ink-3" data-requests-truncated>{{ t('broker.list.truncated', { n: source.data.items.length }) }}</p>
    </template>

    <SelectionBar :count="selected.length" class="sticky bottom-3 z-10 self-start" data-requests-selection @clear="selected = []">
      <template #default="{ actionClass }">
        <ZDropdown :items="declarantItems" @open-change="onAssignMenu" @select="assign('assignedDeclarantId', $event)">
          <button type="button" :class="actionClass" :disabled="assigning" data-assign-declarant>
            {{ t('broker.requests.assignDeclarant') }}<PhCaretDown :size="12" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
        <ZDropdown :items="kppItems" @open-change="onAssignMenu" @select="assign('assignedKppId', $event)">
          <button type="button" :class="actionClass" :disabled="assigning" data-assign-kpp>
            {{ t('broker.requests.assignKpp') }}<PhCaretDown :size="12" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </template>
    </SelectionBar>

    <CreateRequestModal v-if="canCreate" v-model:open="createOpen" />
  </div>
</template>
