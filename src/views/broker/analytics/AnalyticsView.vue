<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTable from '@/components/z/ZTable.vue'
import StatStrip, { type StatItem } from '@/components/broker/StatStrip.vue'
import { analyticsApi, type AnalyticsStaff } from '@/api/analytics'
import { manageApi } from '@/api/manage'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { formatUpdated, pluralForm } from '@/views/broker/list'
import { formatMoney } from '@/ui/number'
import type { ZColumn } from '@/ui/table'
import MonthsChart from './MonthsChart.vue'
import {
  MONTH_SERIES, barWidth, delta, deltaText, deltaTone, formatDays, formatPayments, maxOf, paymentsTitle, roleShort,
  staffName, stageBar, stageLabel,
} from './analytics'

// «Аналитика» (редизайн, волна 3б, доска Analytics): показатели за 30 дней с дельтой, шесть месяцев, стадии заявок,
// клиенты по платежам, последние события, загрузка сотрудников. Только просмотр; период один — 30 дней (сервер другого не отдаёт).
// Имена сотрудников — из справочника «Распределения» (нужно право import40.assign); без права его не запрашиваем — остаётся логин.
const { t, te, locale } = useI18n()
const auth = useAuthStore()

// Строка события ведёт на заявку только тем, кто может её открыть (analytics.read ≠ import40.read).
const canOpenCase = computed(() => auth.hasPermission('import40.read'))
const isAdmin = computed(() => (auth.role || '').trim().toLowerCase() === 'administrator')

const names = ref<Record<string, string>>({})
const loadNames = async () => {
  if (!auth.hasPermission('import40.assign')) return
  try {
    const ov = await manageApi.overview({ silent: true })
    names.value = Object.fromEntries(ov.staff.map((s) => [s.id, s.displayName || s.username]))
  } catch { /* нет права на справочник или он недоступен — остаются логины из аналитики */ }
}
const board = useBlock(true, () => {
  void loadNames()
  return analyticsApi.get({ silent: true })
})
onMounted(() => { void board.load() })
const loadingFirst = computed(() => board.loading && !board.data)

// ---- Показатели ----
const stats = computed<StatItem[]>(() => {
  const d = board.data
  if (!d) {
    return ['cases', 'declarations', 'payments', 'avgDays'].map((k) => ({ key: k, label: t(`broker.analytics.stat.${k}`), value: '' }))
  }
  const withDelta = (key: string, cur: number, prev: number, value: string, suffix = false): StatItem => {
    const dl = delta(cur, prev)
    return { key, label: t(`broker.analytics.stat.${key}`), value, hint: deltaText(dl, t, suffix), hintTone: deltaTone(dl) }
  }
  return [
    withDelta('cases', d.cases30d, d.casesPrev30d, String(d.cases30d), true),
    withDelta('declarations', d.declarations30d, d.declarationsPrev30d, String(d.declarations30d)),
    { ...withDelta('payments', d.payments30dKzt, d.paymentsPrev30dKzt, formatPayments(d.payments30dKzt, locale.value, t)), valueTitle: paymentsTitle(d.payments30dKzt) },
    {
      key: 'avgDays', label: t('broker.analytics.stat.avgDays'), value: formatDays(d.avgDaysToDone, locale.value, t),
      hint: t('broker.analytics.stat.avgHint', { active: d.activeCases, problems: d.problemCases }),
    },
  ]
})

// ---- Стадии и клиенты ----
const stages = computed(() => board.data?.stages ?? [])
const stagesMax = computed(() => maxOf(stages.value.map((s) => s.count)))
const clients = computed(() => board.data?.topClients ?? [])
const clientsMax = computed(() => maxOf(clients.value.map((c) => c.paymentsKzt)))
const casesNoun = (n: number) => `${n} ${t(`broker.analytics.clients.cases.${pluralForm(n, locale.value)}`)}`

// ---- События ----
const events = computed(() => board.data?.recentActivity ?? [])
const eventRole = (role: string) => roleShort(role, t, te)

// ---- Сотрудники ----
const staff = computed(() => board.data?.staff ?? [])
const columns = computed<ZColumn<AnalyticsStaff>[]>(() => [
  { key: 'user', title: t('broker.analytics.staff.col.user'), width: 280 },
  { key: 'role', title: t('broker.analytics.staff.col.role'), width: 220 },
  { key: 'active', title: t('broker.analytics.staff.col.active'), width: 120, align: 'right' },
  { key: 'done', title: t('broker.analytics.staff.col.done'), width: 120, align: 'right' },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))

const panel = 'rounded-panel border border-line bg-surface p-5'
const h2 = 'text-[15px] leading-6 font-semibold tracking-[-0.005em] text-ink'
</script>

<template>
  <div class="flex flex-col gap-4" data-analytics>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.analytics.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-ink-3">{{ t('broker.analytics.subtitle') }}</p>
      </div>
      <ZButton variant="ghost" :loading="board.loading && !!board.data" class="max-sm:h-11 max-sm:w-full" data-analytics-refresh @click="board.load()">
        <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
        {{ t('broker.list.refresh') }}
      </ZButton>
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-analytics-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-analytics-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-analytics-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-analytics-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>

      <StatStrip :items="stats" :loading="loadingFirst" data-analytics-stats />

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section :class="panel" data-analytics-months>
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 :class="[h2, 'm-0']">{{ t('broker.analytics.months.title') }}</h2>
            <ul class="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[12.5px] text-ink-3" data-analytics-legend>
              <li v-for="s in MONTH_SERIES" :key="s.key" class="inline-flex items-center gap-1.5">
                <span :class="['size-2.5 rounded-[3px]', s.bar]" aria-hidden="true" />{{ t(`broker.analytics.series.${s.key}`) }}
              </li>
            </ul>
          </div>
          <ZSkeleton v-if="loadingFirst" height="230px" />
          <MonthsChart v-else-if="board.data" :months="board.data.months" />
        </section>

        <section :class="panel" data-analytics-stages>
          <h2 :class="[h2, 'mx-0 mt-0 mb-2.5']">{{ t('broker.analytics.stages.title') }}</h2>
          <ZSkeleton v-if="loadingFirst" :lines="6" height="20px" />
          <ul v-else class="m-0 list-none p-0">
            <li
              v-for="s in stages"
              :key="s.key"
              class="grid grid-cols-[10rem_minmax(0,1fr)_2.25rem] items-center gap-2.5 py-[5px] text-sm"
              data-analytics-stage
            >
              <span class="min-w-0 truncate text-ink-2" :title="stageLabel(s, t)">{{ stageLabel(s, t) }}</span>
              <span class="h-2 rounded-pill bg-sunken" aria-hidden="true">
                <span :class="['block h-2 rounded-pill', stageBar(s.key)]" :style="{ width: `${barWidth(s.count, stagesMax)}%` }" />
              </span>
              <span class="text-right font-semibold text-ink tabular-nums" data-analytics-stage-count>{{ s.count }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section :class="panel" data-analytics-clients>
          <h2 :class="[h2, 'mx-0 mt-0 mb-1.5']">{{ t('broker.analytics.clients.title') }}</h2>
          <ZSkeleton v-if="loadingFirst" :lines="5" height="32px" />
          <ZEmpty v-else-if="!clients.length" :title="t('admin.pokaNetPlatezhey')" />
          <ul v-else class="m-0 list-none p-0">
            <li v-for="c in clients" :key="c.clientId" class="flex items-center gap-2.5 py-[7px]" data-analytics-client>
              <ZAvatar :name="c.clientName" size="sm" />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate text-ink" :title="c.clientName">{{ c.clientName }}</span>
                  <span class="shrink-0 font-semibold whitespace-nowrap text-ink tabular-nums" data-analytics-client-sum>{{ formatMoney(c.paymentsKzt) }}</span>
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <span class="h-1 flex-1 rounded-pill bg-sunken" aria-hidden="true">
                    <span class="block h-1 rounded-pill bg-zircon" :style="{ width: `${barWidth(c.paymentsKzt, clientsMax)}%` }" />
                  </span>
                  <span class="shrink-0 text-right text-xs whitespace-nowrap text-muted tabular-nums" data-analytics-client-cases>{{ casesNoun(c.cases) }}</span>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section :class="[panel, 'pb-2']" data-analytics-events>
          <div class="mb-1.5 flex items-baseline justify-between gap-3">
            <h2 :class="[h2, 'm-0']">{{ t('broker.analytics.events.title') }}</h2>
            <RouterLink
              v-if="isAdmin"
              to="/system/audit"
              class="inline-flex items-center rounded-field text-[13px] text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
              data-analytics-journal
            >{{ t('broker.analytics.events.journal') }}</RouterLink>
          </div>
          <ZSkeleton v-if="loadingFirst" :lines="6" height="20px" />
          <ZEmpty v-else-if="!events.length" :title="t('admin.operaciyPokaNet')" />
          <ul v-else class="m-0 list-none p-0">
            <li
              v-for="(e, i) in events"
              :key="`${e.caseId}${e.atUtc}${i}`"
              class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-line py-2.5 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-0.5"
              data-analytics-event
            >
              <div class="min-w-0">
                <RouterLink
                  v-if="canOpenCase"
                  :to="`/import-40/${e.caseId}`"
                  class="inline-flex max-w-full items-center rounded-field font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
                  :aria-label="t('broker.analytics.events.openCase', { name: e.clientName || e.cargo || '—' })"
                  data-analytics-event-link
                ><span class="truncate">{{ e.clientName || e.cargo || '—' }}</span></RouterLink>
                <span v-else class="block truncate font-medium text-ink" data-analytics-event-name>{{ e.clientName || e.cargo || '—' }}</span>
                <span v-if="e.clientName && e.cargo" class="block truncate text-xs text-muted" :title="e.cargo">{{ e.cargo }}</span>
              </div>
              <span class="min-w-0 text-ink max-sm:order-3 max-sm:col-span-2" data-analytics-event-text>{{ e.text }}<span v-if="eventRole(e.role)" class="text-muted"> · {{ eventRole(e.role) }}</span></span>
              <span class="text-[12.5px] whitespace-nowrap text-muted tabular-nums max-sm:order-2" data-analytics-event-time>{{ formatUpdated(e.atUtc, new Date(), t) }}</span>
            </li>
          </ul>
        </section>
      </div>

      <section :class="[panel, 'max-sm:p-4']" data-analytics-staff>
        <h2 :class="[h2, 'mx-0 mt-0 mb-3']">{{ t('broker.analytics.staff.title') }}</h2>
        <ZSkeleton v-if="loadingFirst" :lines="3" height="36px" />
        <ZTable
          v-else
          :columns="columns"
          :data-source="staff"
          row-key="userId"
          size="small"
          :scroll="{ x: tableWidth }"
          :aria-label="t('broker.analytics.staff.tableLabel')"
          data-analytics-staff-table
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'user'" class="flex min-w-0 items-center gap-2.5">
              <ZAvatar :name="staffName(record, names)" size="sm" />
              <span class="min-w-0 truncate text-sm font-medium text-ink" data-analytics-staff-name>{{ staffName(record, names) }}</span>
            </span>
            <span v-else-if="column.key === 'role'" class="text-sm text-ink-3" data-analytics-staff-role>{{ roleShort(record.role, t, te) || '—' }}</span>
            <span v-else-if="column.key === 'active'" class="text-sm font-semibold text-ink tabular-nums">{{ record.activeCases }}</span>
            <span v-else-if="column.key === 'done'" class="text-sm text-ink-2 tabular-nums">{{ record.doneCases }}</span>
          </template>
          <template #emptyText>
            <ZEmpty :title="t('admin.naznacheniyPokaNet')" />
          </template>
        </ZTable>
      </section>
    </template>
  </div>
</template>
