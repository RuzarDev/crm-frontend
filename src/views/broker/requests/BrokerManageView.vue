<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhFlag } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { manageApi, type ManageCase, type ManageOverview } from '@/api/manage'
import { import40Api } from '@/api/import40'
import { useImport40Status } from '@/composables/useImport40Status'
import { TOTAL_STEPS, stepForStatus } from '@/utils/import40Steps'
import { matchesQuery } from '@/views/broker/list'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import type { ZColumn } from '@/ui/table'
import { stageTone } from './requests'
import {
  HEAVY_LOAD, MANAGE_SEGMENTS, defaultSegment, isStale, lacksDeclarant, lacksKpp, loadPercent, segmentCounts, segmentOf,
  staffLoad, type ManageSegment,
} from './manage'

// «Распределение» (редизайн, волна 3а, доска Manage): кому назначить декларанта и КПП.
// Один запрос — заявки, сотрудники и счётчик черновиков клиентов. Назначение — выбором в самой строке,
// сохраняется сразу; строка и счётчики обновляются на месте, без перезагрузки.
const { t } = useI18n()
const { statusLabel } = useImport40Status()

// Guid.Empty на сервере = «снять назначение».
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000'

// ---- Загрузка ----
const overview = ref<ManageOverview | null>(null)
const loading = ref(true)
const error = ref(false)
const segment = ref<ManageSegment>('all')
let seq = 0
let first = true
const load = async () => {
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const res = await manageApi.overview({ silent: true })
    if (my !== seq) return
    overview.value = res
    // Сегмент по умолчанию выбираем один раз — дальше выбор за пользователем (после назначений он не прыгает).
    if (first) { first = false; segment.value = defaultSegment(res.cases) }
  } catch (e) {
    if (import.meta.env.DEV) console.error(e)
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
onMounted(() => { void load() })

const cases = computed<ManageCase[]>(() => overview.value?.cases ?? [])
const staff = computed(() => overview.value?.staff ?? [])

// ---- Сегменты и поиск ----
const search = ref('')
const counts = computed(() => segmentCounts(cases.value))
const segmentOptions = computed(() => MANAGE_SEGMENTS.map((k) => ({
  value: k,
  label: t(`broker.manage.segment.${k}`),
  count: overview.value ? counts.value[k] : undefined,
})))
const rows = computed(() => segmentOf(cases.value, segment.value)
  .filter((c) => matchesQuery(search.value, [c.number, c.clientName, c.cargo, c.post])))
const onSegment = (v: unknown) => { segment.value = v as ManageSegment; page.value = 1 }
const onSearch = (q: string) => { search.value = q; page.value = 1 }

// ---- Сотрудники ----
const staffLabel = (u: { displayName: string | null; username: string }) => u.displayName || u.username
const optionsFor = (role: string) => staff.value.filter((u) => u.roles.includes(role)).map((u) => ({ value: u.id, label: staffLabel(u) }))
const declarantOptions = computed(() => optionsFor('declarant'))
const kppOptions = computed(() => optionsFor('kpp'))

// ---- Назначение ----
type AssignField = 'assignedDeclarantId' | 'assignedKppId'
// После неудачи (текст ошибки показал перехватчик) поле нужно вернуть к прежнему значению: смена ключа пересоздаёт его.
const rev = ref(0)
const assign = async (id: string, field: AssignField, value: unknown) => {
  const v = value === null || value === undefined || value === '' ? null : String(value)
  const c = cases.value.find((x) => x.id === id)
  if (!c || c[field] === v) return
  try {
    await import40Api.update(id, { [field]: v ?? EMPTY_GUID })
    c[field] = v
    message.success(t('admin.naznachenieSohraneno'))
  } catch {
    rev.value++
  }
}

const clearing = ref<string | null>(null)
const clearProblem = async (id: string) => {
  if (clearing.value) return
  clearing.value = id
  try {
    await import40Api.action(id, 'clear-problem')
    message.success(t('admin.problemaSnyata'))
    await load()
  } catch {
    // Текст ошибки уже показал общий перехватчик.
  } finally {
    clearing.value = null
  }
}

// ---- Нагрузка ----
const loads = computed(() => staffLoad(staff.value, cases.value))
const loadMax = computed(() => Math.max(...loads.value.map((s) => s.count), 1))
// Короткая подпись роли («декларант», «КПП»): в панели узко, полные названия ролей не нужны.
const roleText = (roles: string[]) => roles.map((r) => t(`broker.manage.role.${r}`)).join(', ')

// ---- Таблица ----
const page = ref(1)
const columns = computed<ZColumn<ManageCase>[]>(() => [
  { key: 'request', title: t('broker.manage.col.request'), sorter: (a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }) },
  { key: 'stage', title: t('broker.manage.col.stage'), width: 176, sorter: (a, b) => a.status - b.status },
  { key: 'declarant', title: t('broker.manage.col.declarant'), width: 176 },
  { key: 'kpp', title: t('broker.manage.col.kpp'), width: 176 },
])
const pagination = computed(() => ({ current: page.value, onChange: (p: number) => { page.value = p } }))

// Пустое и нужное на этом шаге поле — золотая пунктирная рамка с «Назначить» (внутри рамка и подсказка ZSelect).
const needClass = '[&>div]:border-dashed [&>div]:border-gold [&>div]:bg-gold-soft [&_input]:font-medium [&_input]:placeholder:text-gold-ink'
const selectClass = (missing: boolean) => cn('w-full sm:w-[160px] max-sm:min-w-[210px] max-sm:[&>div]:h-11', missing && needClass)
const placeholder = (missing: boolean) => (missing ? t('broker.manage.assign') : '—')

const emptyTitle = computed(() => (search.value.trim() ? t('broker.list.nothingFound') : t(`broker.manage.empty.${segment.value}`)))
</script>

<template>
  <div class="flex flex-col gap-5" data-broker-manage>
    <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.manage.title') }}</h1>
        <p class="mt-1 mb-0 text-[13.5px] text-ink-3">{{ t('broker.manage.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:w-full">
        <span v-if="overview" class="text-sm text-muted" data-manage-drafts>{{ t('broker.manage.clientDrafts', { n: overview.clientDrafts }) }}</span>
        <ZButton variant="ghost" :loading="loading && !!overview" class="max-sm:h-11" data-manage-refresh @click="load">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
      </div>
    </div>

    <div v-if="error && !overview" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-manage-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('admin.neUdalosZagruzitPanel') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-manage-retry @click="load">{{ t('broker.list.retry') }}</ZButton>
    </div>

    <div v-else class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
      <div class="flex min-w-0 flex-col gap-3.5">
        <div class="flex flex-wrap items-center gap-2.5">
          <ZSegmented
            :value="segment"
            :options="segmentOptions"
            :aria-label="t('broker.manage.segmentsLabel')"
            class="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:shrink-0"
            data-manage-segments
            @update:value="onSegment"
          />
          <ListSearch :value="search" :placeholder="t('broker.manage.search')" data-manage-search @update:value="onSearch" />
        </div>

        <p v-if="error" class="m-0 flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-sm text-ink-2" data-manage-reload-error>
          <span class="min-w-0 flex-1">{{ t('admin.neUdalosZagruzitPanel') }}</span>
          <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" @click="load">{{ t('broker.list.retry') }}</ZButton>
        </p>

        <ZTable
          :columns="columns"
          :data-source="rows"
          row-key="id"
          :loading="loading"
          :pagination="pagination"
          :scroll="{ x: 720 }"
          :aria-label="t('broker.manage.tableLabel')"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
          data-manage-table
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'request'">
              <RouterLink :to="`/import-40/${record.id}`" class="block truncate rounded-field font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus" data-manage-link>{{ record.number }}</RouterLink>
              <span class="block truncate text-xs text-muted" :title="`${record.clientName} · ${record.cargo}`">{{ record.clientName }} · {{ record.cargo }}</span>
            </template>
            <template v-else-if="column.key === 'stage'">
              <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <ZTag :tone="stageTone(record.status)">{{ statusLabel(record.status) }}</ZTag>
                <span class="text-xs tabular-nums text-muted">{{ t('broker.manage.stepOf', { step: stepForStatus(record.status), total: TOTAL_STEPS }) }}</span>
              </span>
              <span v-if="record.isProblem" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <ZTag tone="danger"><PhFlag :size="12" weight="fill" class="mr-1" aria-hidden="true" />{{ t('broker.manage.problem') }}</ZTag>
                <button
                  type="button"
                  :disabled="clearing === record.id"
                  :aria-label="t('broker.manage.clearProblemLabel', { number: record.number })"
                  class="cursor-pointer rounded-field border-0 bg-transparent p-0 text-xs text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:min-h-11 max-sm:px-2 max-sm:text-sm"
                  data-manage-clear
                  @click="clearProblem(record.id)"
                >{{ t('broker.manage.clearProblem') }}</button>
              </span>
              <span v-if="record.isProblem && record.problemNote" class="mt-0.5 block text-xs text-tone-danger-fg" data-manage-note>{{ record.problemNote }}</span>
              <span v-if="isStale(record)" class="mt-0.5 block text-xs text-gold-ink" data-manage-stale>{{ t('broker.manage.updatedAgo', { n: record.daysSinceUpdate }) }}</span>
            </template>
            <ZSelect
              v-else-if="column.key === 'declarant'"
              :key="`d:${record.id}:${rev}`"
              size="sm"
              allow-clear
              :value="record.assignedDeclarantId"
              :options="declarantOptions"
              :placeholder="placeholder(lacksDeclarant(record))"
              :aria-label="t('broker.manage.assignLabel', { number: record.number })"
              :class="selectClass(lacksDeclarant(record))"
              data-manage-declarant
              @change="assign(record.id, 'assignedDeclarantId', $event)"
            />
            <ZSelect
              v-else-if="column.key === 'kpp'"
              :key="`k:${record.id}:${rev}`"
              size="sm"
              allow-clear
              :value="record.assignedKppId"
              :options="kppOptions"
              :placeholder="placeholder(lacksKpp(record))"
              :aria-label="t('broker.manage.assignKppLabel', { number: record.number })"
              :class="selectClass(lacksKpp(record))"
              data-manage-kpp
              @change="assign(record.id, 'assignedKppId', $event)"
            />
          </template>
          <template #emptyText>
            <ZEmpty :title="emptyTitle" :hint="search.trim() ? t('broker.list.nothingFoundHint') : undefined" />
          </template>
        </ZTable>
      </div>

      <section class="rounded-panel border border-line bg-surface px-4 pt-4 pb-1.5" :aria-label="t('broker.manage.load')" data-manage-load>
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h2 class="m-0 text-[15px] font-semibold tracking-[-0.005em] text-ink">{{ t('broker.manage.load') }}</h2>
          <span class="text-xs text-muted">{{ t('broker.manage.loadHint') }}</span>
        </div>
        <ZSkeleton v-if="loading && !overview" :lines="4" height="28px" class="pb-3" />
        <p v-else-if="!loads.length" class="m-0 pt-2 pb-3 text-sm text-ink-3" data-manage-load-empty>{{ t('admin.netSotrudnikovSRolyami') }}</p>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="s in loads" :key="s.id" class="flex items-center gap-2.5 border-0 border-t border-solid border-line py-2.5" data-manage-load-row>
            <ZAvatar :name="s.name" size="sm" />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2 text-[13.5px]">
                <span class="min-w-0 truncate font-medium text-ink" :title="s.name">{{ s.name }}</span>
                <span class="font-semibold tabular-nums" :class="s.count >= HEAVY_LOAD ? 'text-gold-ink' : 'text-ink-2'" data-manage-load-count>{{ s.count }}</span>
              </div>
              <div class="mt-px mb-1.5 truncate text-xs text-muted" :title="roleText(s.roles)" data-manage-load-role>{{ roleText(s.roles) }}</div>
              <div class="h-1 rounded-pill bg-sunken" aria-hidden="true">
                <div class="h-1 rounded-pill" :class="s.count >= HEAVY_LOAD ? 'bg-gold' : 'bg-zircon'" :style="{ width: `${loadPercent(s.count, loadMax)}%` }" data-manage-load-bar />
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
