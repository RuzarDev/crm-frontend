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
// (взял → вернул/передал дальше), доработка у клиента, текущие просрочки со ссылками на заявки.
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
        <h3 class="m-0 text-sm font-semibold text-ink">{{ t('stages.stats.overdueTitle') }} <span class="font-normal text-muted tabular-nums">{{ stats.overdue.length }}</span></h3>
        <p v-if="!stats.overdue.length" class="m-0 text-sm text-ink-3" data-stage-overdue-empty>{{ t('stages.stats.overdueEmpty') }}</p>
        <ul v-else class="m-0 flex list-none flex-col p-0">
          <li v-for="o in stats.overdue" :key="o.caseId" class="border-t border-line first:border-t-0" data-stage-overdue-row>
            <RouterLink
              :to="`/import-40/${o.caseId}`"
              class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-row px-1 py-2 text-sm text-ink no-underline outline-hidden hover:bg-canvas focus-visible:shadow-focus"
            >
              <span class="font-mono text-[13px] text-ink-2">{{ o.number }}</span>
              <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{ o.clientName }}</span>
              <span class="text-ink-2">{{ o.step }}. {{ t(`enum.step.s${o.step}`) }}</span>
              <ZTag v-if="o.inRework" tone="wait" size="sm">{{ t('stages.stats.reworkTag') }}</ZTag>
              <span class="font-semibold text-tone-danger-fg tabular-nums">{{ durationText(o.elapsedMinutes, t) }}</span>
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
