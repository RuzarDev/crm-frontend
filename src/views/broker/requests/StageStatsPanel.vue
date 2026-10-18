<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { stagesApi, type StageStats, type StageStepStat } from '@/api/stages'
import { durationText } from '@/utils/import40StageModel'
import { cn } from '@/ui/cn'

// «Время этапов» в «Распределении» (хронометраж 17.10, руководитель/админ): среднее и медиана по шагам и по сотрудникам
// (по ролям: декларант — шаг 3 до подачи ДТ, КПП — граница и шаг 4 до счёта СВХ), доработка у клиента, текущие просрочки
// со ссылками на заявки. Заявки, начатые до 17.10 (истории нет), — не в просрочках: отдельный фильтр «До 17.10».
// GET import40/manage/stage-stats?days= — право import40.assign, как у самого «Распределения».
const { t } = useI18n()

const PERIODS = [30, 90, 365] as const
const days = ref<number>(90)
const stats = ref<StageStats | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let seq = 0
const load = async () => {
  const my = ++seq
  state.value = 'loading'
  try {
    const res = await stagesApi.stats(days.value, { silent: true })
    if (my !== seq) return
    stats.value = res
    state.value = 'ready'
  } catch {
    if (my === seq) state.value = 'error'
  }
}
onMounted(load)
const onPeriod = (v: unknown) => { days.value = Number(v); void load() }
const periodOptions = computed(() => PERIODS.map((d) => ({ value: d, label: t(`stages.stats.days.d${d}`) })))

const hours = (h: number | null) => (h == null ? '—' : durationText(h * 60, t))
const over = (s: StageStepStat) => s.medianHours != null && s.normHours > 0 && s.medianHours > s.normHours
const stepRows = computed(() => {
  const st = stats.value
  if (!st) return []
  return [
    ...st.steps.map((s) => ({ key: `s${s.step}`, label: `${s.step}. ${t(`enum.step.s${s.step}`)}`, s })),
    { key: 'rework', label: t('stages.stats.rework'), s: st.rework },
  ]
})
// Просрочки или заявки без истории (до 17.10): фильтр — только если такие есть (старый сервер — поля нет).
const view = ref<'overdue' | 'noHistory'>('overdue')
const untracked = computed(() => stats.value?.untracked ?? [])
const viewOptions = computed(() => [
  { value: 'overdue', label: `${t('stages.stats.filterOverdue')} · ${stats.value?.overdue.length ?? 0}` },
  { value: 'noHistory', label: `${t('stages.stats.filterNoHistory')} · ${untracked.value.length}` },
])
const rows = computed(() => (view.value === 'noHistory' && untracked.value.length ? untracked.value : stats.value?.overdue ?? []))
const showingNoHistory = computed(() => view.value === 'noHistory' && untracked.value.length > 0)

// «Время на границе» по постам (18.10): прибытие → прохождение; старый сервер — поля нет.
const borderByPost = computed(() => stats.value?.borderByPost ?? [])

const hasData = computed(() => !!stats.value && (stepRows.value.some((r) => r.s.count > 0) || stats.value.employees.length > 0))

const th = 'px-3 py-2 text-left text-xs font-medium text-muted whitespace-nowrap'
const td = 'px-3 py-2 text-[13.5px] tabular-nums text-ink-2 whitespace-nowrap'
</script>

<template>
  <section class="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 max-sm:px-4" aria-labelledby="stage-stats-title" data-stage-stats>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="min-w-0">
        <h2 id="stage-stats-title" class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ t('stages.stats.title') }}</h2>
        <p class="m-0 mt-0.5 text-[13px] text-muted">{{ t('stages.stats.lead') }}</p>
      </div>
      <ZSegmented
        :value="days"
        :options="periodOptions"
        :aria-label="t('stages.stats.period')"
        class="max-sm:w-full max-sm:[&>button]:min-h-11 max-sm:[&>button]:flex-1"
        data-stage-stats-period
        @update:value="onPeriod"
      />
    </div>

    <div v-if="state === 'error'" role="alert" class="flex flex-wrap items-center gap-3" data-stage-stats-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('stages.stats.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" @click="load">{{ t('stages.stats.retry') }}</ZButton>
    </div>
    <ZSkeleton v-else-if="state === 'loading' && !stats" :lines="5" height="22px" />

    <template v-else-if="stats">
      <!-- Просрочки сейчас — первым: с ними руководитель что-то делает. -->
      <div class="flex flex-col gap-2" data-stage-overdue>
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 class="m-0 text-sm font-semibold text-ink">{{ t('stages.stats.overdueTitle') }} <span class="font-normal text-muted tabular-nums">{{ stats.overdue.length }}</span></h3>
          <ZSegmented
            v-if="untracked.length"
            :value="view"
            :options="viewOptions"
            :aria-label="t('stages.stats.filterLabel')"
            class="max-w-full overflow-x-auto max-sm:w-full max-sm:[&>button]:min-h-11 max-sm:[&>button]:flex-1 [&_button]:whitespace-nowrap"
            data-stage-overdue-filter
            @update:value="(v) => { view = v as 'overdue' | 'noHistory' }"
          />
        </div>
        <p v-if="showingNoHistory" class="m-0 text-[13px] text-muted" data-stage-untracked-hint>{{ t('stages.stats.noHistoryHint') }}</p>
        <p v-if="!rows.length" class="m-0 text-sm text-ink-3" data-stage-overdue-empty>{{ t('stages.stats.overdueEmpty') }}</p>
        <ul v-else class="m-0 flex list-none flex-col p-0">
          <li
            v-for="o in rows"
            :key="`${o.caseId}:${o.step}`"
            class="border-t border-line first:border-t-0"
            :data-stage-overdue-row="o.historyMissing ? undefined : ''"
            :data-stage-untracked-row="o.historyMissing ? '' : undefined"
          >
            <RouterLink
              :to="`/import-40/${o.caseId}`"
              class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-row px-1 py-2 text-sm text-ink no-underline outline-hidden hover:bg-canvas focus-visible:shadow-focus"
            >
              <span class="font-mono text-[13px] text-ink-2">{{ o.number }}</span>
              <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{ o.clientName }}</span>
              <span class="text-ink-2">{{ o.step }}. {{ t(`enum.step.s${o.step}`) }}</span>
              <ZTag v-if="o.inRework" tone="wait" size="sm">{{ t('stages.stats.reworkTag') }}</ZTag>
              <template v-if="o.historyMissing">
                <ZTag tone="neutral" size="sm">{{ t('stages.stats.noHistoryTag') }}</ZTag>
                <span class="text-ink-2 tabular-nums">{{ t('stages.stats.sinceChange', { time: durationText(o.elapsedMinutes, t) }) }}</span>
              </template>
              <span v-else class="font-semibold text-tone-danger-fg tabular-nums">{{ durationText(o.elapsedMinutes, t) }}</span>
              <span class="text-xs text-muted">{{ t('stages.norm', { time: durationText(o.normMinutes, t) }) }}</span>
              <span v-if="o.responsibleName" class="w-full text-xs text-muted sm:w-auto">{{ o.responsibleName }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>

      <p v-if="!hasData" class="m-0 text-sm text-ink-3" data-stage-stats-empty>{{ t('stages.stats.noData') }}</p>
      <template v-else>
        <div class="min-w-0 overflow-x-auto rounded-row border border-line" data-stage-steps-table>
          <table class="w-full border-collapse">
            <thead class="bg-canvas">
              <tr>
                <th :class="th" scope="col">{{ t('stages.stats.step') }}</th>
                <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.count') }}</th>
                <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.avg') }}</th>
                <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.median') }}</th>
                <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.norm') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in stepRows" :key="r.key" class="border-t border-line" :data-stage-step-row="r.key">
                <th scope="row" :class="cn(td, 'text-left font-medium text-ink')">{{ r.label }}</th>
                <td :class="cn(td, 'text-right')">{{ r.s.count }}</td>
                <td :class="cn(td, 'text-right')">{{ hours(r.s.avgHours) }}</td>
                <td :class="cn(td, 'text-right', over(r.s) && 'font-semibold text-tone-danger-fg')">{{ hours(r.s.medianHours) }}</td>
                <td :class="cn(td, 'text-right text-muted')">{{ hours(r.s.normHours) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="borderByPost.length" class="flex flex-col gap-2" data-stage-border-posts>
          <h3 class="m-0 text-sm font-semibold text-ink">{{ t('stages.stats.borderByPost') }}</h3>
          <p class="m-0 text-xs text-muted">{{ t('stages.stats.borderByPostHint') }}</p>
          <div class="min-w-0 overflow-x-auto rounded-row border border-line">
            <table class="w-full border-collapse">
              <thead class="bg-canvas">
                <tr>
                  <th :class="th" scope="col">{{ t('stages.stats.post') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.count') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.avg') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.median') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in borderByPost" :key="p.post" class="border-t border-line" data-stage-border-post-row>
                  <th scope="row" :class="cn(td, 'text-left font-medium text-ink [overflow-wrap:anywhere]')">{{ p.post || t('stages.stats.noPost') }}</th>
                  <td :class="cn(td, 'text-right')">{{ p.count }}</td>
                  <td :class="cn(td, 'text-right')">{{ hours(p.avgHours) }}</td>
                  <td :class="cn(td, 'text-right')">{{ hours(p.medianHours) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="stats.employees.length" class="flex flex-col gap-2" data-stage-employees>
          <h3 class="m-0 text-sm font-semibold text-ink">{{ t('stages.stats.employees') }}</h3>
          <div class="min-w-0 overflow-x-auto rounded-row border border-line">
            <table class="w-full border-collapse">
              <thead class="bg-canvas">
                <tr>
                  <th :class="th" scope="col">{{ t('stages.stats.employee') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.count') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.avg') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.median') }}</th>
                  <th :class="cn(th, 'text-right')" scope="col">{{ t('stages.stats.returned') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in stats.employees" :key="e.userId" class="border-t border-line" data-stage-employee-row>
                  <th scope="row" :class="cn(td, 'text-left font-medium text-ink')">{{ e.name }}</th>
                  <td :class="cn(td, 'text-right')">{{ e.count }}</td>
                  <td :class="cn(td, 'text-right')">{{ hours(e.avgHours) }}</td>
                  <td :class="cn(td, 'text-right')">{{ hours(e.medianHours) }}</td>
                  <td :class="cn(td, 'text-right')">{{ e.returned }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>
