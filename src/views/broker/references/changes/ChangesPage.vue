<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { chipFrame, chipTrigger } from '@/components/broker/chipStyles'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { tnvedApi } from '@/api/tnved'
import { useAuthStore } from '@/stores/auth'
import type { TnvedRateChangeDto, TnvedTimelineDto } from '@/types/api'
import { useBlock } from '@/views/home/useBlock'
import { codeDigits, isRateLimited } from '@/views/references/tnvedShared'
import ChangesFeed from './ChangesFeed.vue'
import ChangesStats from './ChangesStats.vue'
import {
  filterChanges, mergeChanges, rateChangeEntries, timelineEntries, todayIso,
  type ChangeFilters, type ChangeKind, type ChangePeriod,
} from './changes'

// «Изменения» (редизайн, волна 5а, доска Changes): лента из хронологии ТН ВЭД и изменений ставок + «Статистика»
// (только сотрудникам с правом: у клиента топ кодов отвечает 403). Раздел — в адресе (?view=stats).
// Фильтры: «Будущие» (по умолчанию), тип, период ±30/90 дней, поиск по коду или тексту.
// Чтения tnved/* — 60 в минуту: на 429 — «попробуйте через минуту» на месте, без тоста.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// Хронологию просим целиком (limit 0): сервер держит её в кэше, а обрезка по limit отрезала бы ближайшие будущие события.
// Изменения ставок сервер отдаёт не больше 200.
const TIMELINE_ALL = 0
const RATE_CHANGES_LIMIT = 200
const CODE_DEBOUNCE_MS = 400
const MIN_CODE_DIGITS = 2

const canStats = computed(() => !auth.isClient && (auth.hasPermission('reestr.read') || auth.hasPermission('references.read')))
const view = computed<'feed' | 'stats'>(() => (route.query.view === 'stats' && canStats.value ? 'stats' : 'feed'))
const viewOptions = computed(() => [
  { value: 'feed', label: t('broker.references.changes.feed') },
  { value: 'stats', label: t('broker.references.changes.stats') },
])
const onView = (v: string | number | boolean) => {
  const query = { ...route.query }
  if (v === 'stats') query.view = 'stats'
  else delete query.view
  void router.replace({ query })
}

// ---- Данные ленты: два источника независимо, ошибка одного не прячет другой ----
const limited = ref(false)
const guard = async <T,>(load: () => Promise<{ data: T[] }>): Promise<T[]> => {
  try {
    const { data } = await load()
    return Array.isArray(data) ? data : []
  } catch (e) {
    if (isRateLimited(e)) limited.value = true
    throw e
  }
}
const timeline = useBlock<TnvedTimelineDto[]>(true, () => guard(() => tnvedApi.timeline(TIMELINE_ALL, { silent: true })))
const rateChanges = useBlock<TnvedRateChangeDto[]>(true, () => guard(() => tnvedApi.rateChanges(RATE_CHANGES_LIMIT, { silent: true })))
let feedRequested = false
const loadFeed = () => {
  limited.value = false
  void timeline.load()
  void rateChanges.load()
}
const ensureFeed = () => {
  if (feedRequested) return
  feedRequested = true
  loadFeed()
}
// Статистика не тянет ленту (лимит 60 запросов в минуту): лента грузится при первом показе.
watch(view, (v) => { if (v === 'feed') ensureFeed() }, { immediate: true })

// ---- Фильтры ----
const filters = reactive<ChangeFilters>({ future: true, type: null, period: null, q: '' })

// ---- Поиск по коду: событие отдаёт только пять кодов, поэтому цифры спрашиваем у сервера (tnved/timeline?code=) ----
// Запрос с паузой; ответ устаревшего запроса отбрасывается (codeSeq). Текст ищем на месте, по названию и строке.
const isNumericQuery = (q: string) => /^[\d\s.-]+$/.test(q.trim())
const wantedPrefix = computed(() => {
  const q = filters.q
  const d = isNumericQuery(q) ? codeDigits(q) : ''
  return d.length >= MIN_CODE_DIGITS ? d : ''
})
const codeResult = shallowRef<{ prefix: string; items: TnvedTimelineDto[] } | null>(null)
const codeFailedFor = ref('')
let codeSeq = 0
let codeTimer: ReturnType<typeof setTimeout> | undefined
const runCodeSearch = async (prefix: string) => {
  const my = ++codeSeq
  codeFailedFor.value = ''
  try {
    const { data } = await tnvedApi.timeline(TIMELINE_ALL, { silent: true, code: prefix })
    if (my !== codeSeq) return
    codeResult.value = { prefix, items: Array.isArray(data) ? data : [] }
  } catch (e) {
    if (my !== codeSeq) return
    if (isRateLimited(e)) limited.value = true
    codeFailedFor.value = prefix
  }
}
watch(wantedPrefix, (prefix) => {
  clearTimeout(codeTimer)
  codeSeq += 1
  codeFailedFor.value = ''
  if (!prefix) { codeResult.value = null; return }
  codeTimer = setTimeout(() => { void runCodeSearch(prefix) }, CODE_DEBOUNCE_MS)
})
onBeforeUnmount(() => { clearTimeout(codeTimer); codeSeq += 1 })
// Ответ по текущему коду — вместо общей хронологии; пока он в пути или не удался — общая (по первым пяти кодам).
const codeReady = computed(() => !!wantedPrefix.value && codeResult.value?.prefix === wantedPrefix.value)
const codePending = computed(() => !!wantedPrefix.value && !codeReady.value && codeFailedFor.value !== wantedPrefix.value)
const codeFailed = computed(() => !!wantedPrefix.value && codeFailedFor.value === wantedPrefix.value)

const today = todayIso()
const entries = computed(() => mergeChanges(
  timelineEntries(codeReady.value ? codeResult.value!.items : timeline.data),
  rateChangeEntries(rateChanges.data),
))
// Есть ли вообще данные (без поиска по коду): ответ «по коду» бывает пустым, а лента — нет.
const hasAny = computed(() => !!timeline.data?.length || !!rateChanges.data?.length)
const loading = computed(() => timeline.loading || rateChanges.loading)
const failed = computed(() => timeline.error || rateChanges.error || codeFailed.value)
const retry = () => {
  loadFeed()
  if (wantedPrefix.value) void runCodeSearch(wantedPrefix.value)
}
const tr = (key: string, named?: Record<string, unknown>) => t(key, named ?? {})
const shown = computed(() => filterChanges(entries.value, filters, today, tr))
const anyOtherFilter = computed(() => !!(filters.type || filters.period || filters.q.trim()))
const typeOptions = computed(() => (['starts', 'ends', 'rate'] as const).map((k) => ({ value: k, label: t(`broker.references.changes.typeOption.${k}`) })))
const periodOptions = computed(() => [
  { value: '30', label: t('broker.references.changes.period30') },
  { value: '90', label: t('broker.references.changes.period90') },
])
const onType = (v: string | null) => { filters.type = v as ChangeKind | null }
const onPeriod = (v: string | null) => { filters.period = v as ChangePeriod | null }
</script>

<template>
  <div class="flex flex-col gap-5" data-changes-page>
    <div>
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.references.changes.title') }}</h1>
      <p class="m-0 mt-1 text-sm text-muted">{{ view === 'stats' ? t('broker.references.changes.stat.subtitle') : t('broker.references.changes.subtitle') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      <ZSegmented
        v-if="canStats"
        :value="view"
        :options="viewOptions"
        :aria-label="t('broker.references.changes.view')"
        data-changes-view
        @update:value="onView"
      />
      <template v-if="view === 'feed'">
        <ListSearch
          :value="filters.q"
          :placeholder="t('broker.references.changes.search')"
          data-changes-search
          @update:value="filters.q = $event"
        />
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <span :class="chipFrame(filters.future)">
            <button
              type="button"
              :class="chipTrigger"
              :aria-pressed="filters.future"
              data-changes-future
              @click="filters.future = !filters.future"
            >
              <PhCheck v-if="filters.future" :size="13" weight="bold" aria-hidden="true" />
              {{ t('broker.references.changes.future') }}
            </button>
          </span>
          <FilterChip
            :label="t('broker.references.changes.typeFilter')"
            :all-label="t('broker.references.changes.allTypes')"
            :options="typeOptions"
            :value="filters.type"
            data-changes-type
            @update:value="onType"
          />
          <FilterChip
            :label="t('broker.references.changes.periodFilter')"
            :all-label="t('broker.references.changes.allPeriods')"
            :options="periodOptions"
            :value="filters.period"
            data-changes-period
            @update:value="onPeriod"
          />
        </div>
      </template>
    </div>

    <!-- KeepAlive: возврат на «Статистику» не перезапрашивает топ кодов и разделы ВТО (лимит 60 запросов в минуту). -->
    <KeepAlive>
      <ChangesStats v-if="view === 'stats'" />
    </KeepAlive>

    <section v-if="view === 'feed'" :aria-busy="loading || undefined" :aria-label="t('broker.references.changes.listLabel')">
      <div v-if="failed && !hasAny && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-changes-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ limited ? t('broker.references.changes.limit') : t('broker.references.changes.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-changes-retry @click="retry">{{ t('broker.references.changes.retry') }}</ZButton>
      </div>
      <div v-else-if="loading && !hasAny" class="rounded-panel border border-line bg-surface px-5 py-5" data-changes-loading>
        <ZSkeleton :lines="4" height="22px" />
      </div>
      <div v-else-if="!hasAny" class="rounded-panel border border-dashed border-line-strong" data-changes-empty>
        <ZEmpty :title="t('broker.references.changes.empty')" :hint="t('broker.references.changes.emptyHint')" />
      </div>
      <template v-else>
        <div v-if="failed" role="alert" class="mb-3 flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3" data-changes-partial>
          <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ limited ? t('broker.references.changes.limit') : t('broker.references.changes.partialError') }}</p>
          <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-changes-retry @click="retry">{{ t('broker.references.changes.retry') }}</ZButton>
        </div>
        <div v-if="!shown.length && codePending" class="rounded-panel border border-line bg-surface px-5 py-5" data-changes-searching>
          <ZSkeleton :lines="2" height="22px" />
        </div>
        <div v-else-if="!shown.length" class="rounded-panel border border-dashed border-line-strong" data-changes-nothing>
          <ZEmpty
            v-if="filters.future && !anyOtherFilter"
            :title="t('broker.references.changes.nothingFuture')"
            :hint="t('broker.references.changes.nothingFutureHint')"
          />
          <ZEmpty v-else :title="t('broker.references.changes.nothing')" :hint="t('broker.references.changes.nothingHint')" />
        </div>
        <ChangesFeed v-else :entries="shown" :today="today" />
      </template>
    </section>
  </div>
</template>
