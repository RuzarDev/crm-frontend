<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCaretRight, PhDownloadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDateRange from '@/components/z/ZDateRange.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import StatStrip, { type StatItem } from '@/components/broker/StatStrip.vue'
import { reportsApi, type RepDeclarationRow } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { cn } from '@/ui/cn'
import { formatDateText } from '@/ui/date'
import { saveBlob } from '@/ui/download'
import { formatAmount, formatMoney } from '@/ui/number'
import {
  defaultPeriod, matchingQuarter, periodText, postKey, proceduresText, quarterKey, quarterPeriod, quickQuarters,
  romanQuarter, rowsOfPost, xlsxFileName, type Period, type Quarter,
} from './representativeReport'

// «Отчёт представителя» (17.10): сколько ДТ подано за период в каждый таможенный орган — ДГД → пост, выпущено, процедуры,
// таможенная стоимость и платежи; пост раскрывается списком ДТ; «Скачать Excel» — сводка и перечень с реквизитами организации.
// Период по умолчанию — прошлый квартал; быстрые кнопки — текущий и три предыдущих квартала; свой период — «С — По».
// Отправки по почте нет: формат органа будет отдельно (решение владельца 17.10).
const { t } = useI18n()
const auth = useAuthStore()
const canOpenCase = computed(() => auth.hasPermission('import40.read'))

const today = new Date()
const quarters = quickQuarters(today)
const period = ref<Period>(defaultPeriod(today))
const range = computed<[string | null, string | null]>(() => [period.value.from, period.value.to])
const activeQuarter = computed(() => matchingQuarter(period.value, quarters))

const report = useBlock(true, () => reportsApi.customsRepresentative(period.value.from, period.value.to, { silent: true }))
onMounted(() => { void report.load() })
const loadingFirst = computed(() => report.loading && !report.data)

const setPeriod = (p: Period) => {
  if (p.from === period.value.from && p.to === period.value.to) return
  period.value = p
  expanded.clear()
  void report.load()
}
const pickQuarter = (q: Quarter) => setPeriod(quarterPeriod(q))
const onRange = (v: [string | null, string | null]) => {
  if (v[0] && v[1]) setPeriod({ from: v[0], to: v[1] })
}
const quarterLabel = (q: Quarter) => t('broker.repReport.quarter', { q: romanQuarter(q), year: q.year })

// ---- Показатели ----
const stats = computed<StatItem[]>(() => {
  const s = report.data?.totals
  const v = (x: string) => (s ? x : '')
  return [
    { key: 'declarations', label: t('broker.repReport.stat.declarations'), value: v(String(s?.declarations ?? 0)), hint: s ? proceduresText(s.procedures) : undefined },
    { key: 'released', label: t('broker.repReport.stat.released'), value: v(String(s?.released ?? 0)) },
    { key: 'value', label: t('broker.repReport.stat.customsValue'), value: v(formatMoney(s?.customsValueKzt ?? 0)) },
    { key: 'payments', label: t('broker.repReport.stat.payments'), value: v(formatMoney(s?.paymentsKzt ?? 0)) },
  ]
})

// ---- Раскрытие поста ----
const expanded = reactive(new Set<string>())
const toggle = (key: string) => (expanded.has(key) ? expanded.delete(key) : expanded.add(key))
const postRows = (dgd: string | null, post: string | null): RepDeclarationRow[] => rowsOfPost(report.data?.declarations ?? [], dgd, post)
const authorityName = (code: string | null, name: string) => (code ? name : t('broker.repReport.noAuthority'))

const STATUS_TONE: Record<string, 'done' | 'submitted' | 'neutral'> = { released: 'done', submitted: 'submitted', cancelled: 'neutral' }
const statusTone = (s: string) => STATUS_TONE[s] ?? 'neutral'
const statusLabel = (s: string) => (s in STATUS_TONE ? t(`broker.repReport.status.${s}`) : s)
const procedureLabel = (r: RepDeclarationRow) =>
  r.splitRole === 'ETT' ? `${r.procedure} · ${t('broker.repReport.split.ett')}` : r.splitRole === 'VTO' ? `${r.procedure} · ${t('broker.repReport.split.vto')}` : r.procedure

// ---- Excel ----
const downloading = ref(false)
const download = async () => {
  if (downloading.value) return
  downloading.value = true
  try {
    const p = period.value
    const blob = await reportsApi.customsRepresentativeXlsx(p.from, p.to)
    saveBlob(blob, xlsxFileName(t('broker.repReport.fileName'), p))
  } catch {
    /* ошибку показал перехватчик запросов */
  } finally {
    downloading.value = false
  }
}

const orgMissing = computed(() => !!report.data && !report.data.organizationName)
const panel = 'rounded-panel border border-line bg-surface'
const th = 'px-3 py-2.5 text-left text-[12.5px] font-medium text-ink-3 whitespace-nowrap'
const num = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap'
</script>

<template>
  <div class="flex flex-col gap-4" data-rep-report>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.repReport.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-ink-3">{{ t('broker.repReport.subtitle') }}</p>
      </div>
      <div class="flex gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="report.loading && !!report.data" class="max-sm:h-11 max-sm:flex-1" data-rep-refresh @click="report.load()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton variant="primary" :loading="downloading" class="max-sm:h-11 max-sm:flex-1" data-rep-xlsx @click="download">
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.repReport.download') }}
        </ZButton>
      </div>
    </div>

    <section :class="[panel, 'flex flex-col gap-3 p-4']" data-rep-period :aria-label="t('broker.repReport.period')">
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('broker.repReport.quarters')">
        <ZButton
          v-for="q in quarters"
          :key="quarterKey(q)"
          size="sm"
          :variant="activeQuarter && quarterKey(activeQuarter) === quarterKey(q) ? 'primary' : 'secondary'"
          :aria-pressed="activeQuarter && quarterKey(activeQuarter) === quarterKey(q) ? 'true' : 'false'"
          class="max-sm:h-11 max-sm:flex-[1_1_calc(50%-0.25rem)]"
          data-rep-quarter
          @click="pickQuarter(q)"
        >{{ quarterLabel(q) }}</ZButton>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:flex-col max-sm:items-stretch">
        <span class="text-sm text-ink-3">{{ t('broker.repReport.custom') }}</span>
        <ZDateRange :value="range" class="w-auto max-w-md flex-1 max-sm:max-w-none" data-rep-range @change="onRange" />
      </div>
      <p class="m-0 text-[12.5px] text-muted" data-rep-org>
        <template v-if="report.data && !orgMissing">
          {{ t('broker.repReport.orgLine', { org: report.data.organizationName, bin: report.data.organizationBin || '—', period: periodText(period) }) }}
        </template>
        <template v-else-if="orgMissing">
          {{ t('broker.repReport.orgMissing') }}
          <RouterLink to="/settings/organization" class="text-zircon-ink">{{ t('broker.repReport.orgLink') }}</RouterLink>
        </template>
        <template v-else>{{ periodText(period) }}</template>
      </p>
    </section>

    <div v-if="report.error && !report.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-rep-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-rep-retry @click="report.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="report.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-rep-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-rep-retry @click="report.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>

      <StatStrip :items="stats" :loading="loadingFirst" data-rep-stats />

      <section :class="[panel, 'p-0']" data-rep-summary>
        <h2 class="m-0 px-5 pt-4 pb-3 text-[15px] leading-6 font-semibold text-ink">{{ t('broker.repReport.summaryTitle') }}</h2>
        <div v-if="loadingFirst" class="px-5 pb-5"><ZSkeleton :lines="6" height="28px" /></div>
        <ZEmpty v-else-if="!report.data?.authorities.length" class="pb-6" :title="t('broker.repReport.empty')" data-rep-empty />
        <div v-else class="overflow-x-auto" :aria-busy="report.loading ? 'true' : undefined">
          <table class="w-full min-w-[680px] border-collapse text-sm" :aria-label="t('broker.repReport.summaryTitle')">
            <thead>
              <tr class="border-y border-line bg-sunken">
                <th scope="col" :class="th">{{ t('broker.repReport.col.authority') }}</th>
                <th scope="col" :class="[th, 'text-right']">{{ t('broker.repReport.col.declarations') }}</th>
                <th scope="col" :class="[th, 'text-right']">{{ t('broker.repReport.col.released') }}</th>
                <th scope="col" :class="th">{{ t('broker.repReport.col.procedures') }}</th>
                <th scope="col" :class="[th, 'text-right']">{{ t('broker.repReport.col.customsValue') }}</th>
                <th scope="col" :class="[th, 'text-right']">{{ t('broker.repReport.col.payments') }}</th>
              </tr>
            </thead>
            <tbody v-for="a in report.data.authorities" :key="a.code ?? '-'" data-rep-authority>
              <tr class="border-b border-line bg-surface">
                <th scope="rowgroup" class="px-3 py-2.5 text-left font-semibold text-ink" data-rep-authority-name>{{ authorityName(a.code, a.name) }}</th>
                <td :class="[num, 'font-semibold text-ink']" data-rep-authority-count>{{ a.declarations }}</td>
                <td :class="[num, 'text-ink-2']">{{ a.released }}</td>
                <td class="px-3 py-2.5 text-ink-3">{{ proceduresText(a.procedures) }}</td>
                <td :class="[num, 'text-ink-2']">{{ formatAmount(a.customsValueKzt) }}</td>
                <td :class="[num, 'font-semibold text-ink']">{{ formatAmount(a.paymentsKzt) }}</td>
              </tr>
              <template v-for="p in a.posts" :key="postKey(a.code, p.code)">
                <tr class="border-b border-line" data-rep-post>
                  <th scope="row" class="py-1 pr-3 pl-3 text-left font-normal">
                    <button
                      type="button"
                      class="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-field pl-3 text-left text-ink outline-hidden hover:text-zircon-ink focus-visible:shadow-focus max-sm:min-h-11"
                      :aria-expanded="expanded.has(postKey(a.code, p.code)) ? 'true' : 'false'"
                      :aria-controls="`rep-post-${postKey(a.code, p.code)}`"
                      data-rep-post-toggle
                      @click="toggle(postKey(a.code, p.code))"
                    >
                      <PhCaretRight
                        :size="13"
                        aria-hidden="true"
                        :class="cn('shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none', expanded.has(postKey(a.code, p.code)) && 'rotate-90')"
                      />
                      <span class="min-w-0">{{ authorityName(p.code, p.name) }}</span>
                    </button>
                  </th>
                  <td :class="[num, 'text-ink']">{{ p.declarations }}</td>
                  <td :class="[num, 'text-ink-2']">{{ p.released }}</td>
                  <td class="px-3 py-2.5 text-ink-3">{{ proceduresText(p.procedures) }}</td>
                  <td :class="[num, 'text-ink-2']">{{ formatAmount(p.customsValueKzt) }}</td>
                  <td :class="[num, 'text-ink']">{{ formatAmount(p.paymentsKzt) }}</td>
                </tr>
                <tr v-if="expanded.has(postKey(a.code, p.code))" :id="`rep-post-${postKey(a.code, p.code)}`" class="border-b border-line bg-sunken/60" data-rep-post-rows>
                  <td colspan="6" class="px-3 py-2">
                    <ul class="m-0 list-none p-0 pl-6">
                      <li
                        v-for="r in postRows(a.code, p.code)"
                        :key="r.declarationId"
                        class="grid grid-cols-[minmax(0,13rem)_6rem_minmax(0,1fr)_8.5rem_7rem] items-baseline gap-x-3 py-1.5 text-[13px]"
                        data-rep-dt
                      >
                        <span class="min-w-0 truncate font-medium text-ink tabular-nums">
                          <RouterLink
                            v-if="canOpenCase"
                            :to="`/import-40/${r.caseId}`"
                            class="rounded-field text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus"
                            data-rep-dt-link
                          >{{ r.number || t('broker.repReport.noNumber') }}</RouterLink>
                          <template v-else>{{ r.number || t('broker.repReport.noNumber') }}</template>
                        </span>
                        <span class="text-ink-2 tabular-nums" :title="r.dateSource === 'number' ? t('broker.repReport.dateFromNumber') : undefined">{{ formatDateText(r.date) }}</span>
                        <span class="min-w-0 truncate text-ink-2" :title="r.clientName">
                          {{ r.clientName || '—' }}<span v-if="r.clientBin" class="text-muted"> · {{ r.clientBin }}</span>
                          <span class="text-muted"> · {{ procedureLabel(r) }}</span>
                        </span>
                        <ZTag size="sm" :tone="statusTone(r.status)" class="justify-self-start" data-rep-dt-status>{{ statusLabel(r.status) }}</ZTag>
                        <span class="text-right text-ink tabular-nums">{{ formatAmount(r.paymentsKzt) }}</span>
                      </li>
                    </ul>
                  </td>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-line-strong" data-rep-total>
                <th scope="row" class="px-3 py-3 text-left font-semibold text-ink">{{ t('broker.repReport.total') }}</th>
                <td :class="[num, 'font-semibold text-ink']">{{ report.data.totals.declarations }}</td>
                <td :class="[num, 'font-semibold text-ink']">{{ report.data.totals.released }}</td>
                <td class="px-3 py-3 text-ink-3">{{ proceduresText(report.data.totals.procedures) }}</td>
                <td :class="[num, 'font-semibold text-ink']">{{ formatAmount(report.data.totals.customsValueKzt) }}</td>
                <td :class="[num, 'font-semibold text-ink']">{{ formatAmount(report.data.totals.paymentsKzt) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <p class="m-0 text-[12.5px] text-muted">{{ t('broker.repReport.note') }}</p>
    </template>
  </div>
</template>
