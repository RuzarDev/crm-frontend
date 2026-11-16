<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPage from '@/components/z/ZPage.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import ZPanel from '@/components/z/ZPanel.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import TruckRow from './TruckRow.vue'
import { LIST_PAGE_SIZE, listTrucks, type FilterId, type TruckListResponse } from '@/api/autoTransit'
import { useAuthStore } from '@/stores/auth'
import { rememberListPath } from '@/shell/listReturn'
import { FILTERS } from './autoTransit'

// «Авто-транзит» — список машин (задача 8, макет 1): одна строка — одна машина на границе, полоса из семи этапов.
// Фильтр и поиск живут в адресе (?filter=&q=; «Все» не пишется), страница — нет: новый фильтр или поиск — первая.
// Список обновляется раз в 60 с, пока вкладка видна; «время на этапе» пересчитывается раз в 30 с без запроса.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canBorder = computed(() => auth.hasPermission('autotransit.border'))

const REFRESH_MS = 60_000
const CLOCK_MS = 30_000
const FILTER_IDS = FILTERS.map((f) => f.id)

const one = (v: LocationQuery[string]): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '')
const filter = computed<FilterId>(() => {
  const f = one(route.query.filter) as FilterId
  return FILTER_IDS.includes(f) ? f : 'all'
})
const q = computed(() => one(route.query.q).trim())
const page = ref(1)

// ---- Загрузка ----
const data = ref<TruckListResponse | null>(null)
const loading = ref(false)
const error = ref(false)
let loadedAt = 0
let seq = 0
// background — таймер и возврат на вкладку: сбой показывает только плашка на месте, без общего тоста.
const load = async (background = false) => {
  const my = ++seq
  loading.value = true
  try {
    const params = { filter: filter.value, q: q.value, page: page.value }
    const res = await (background ? listTrucks(params, { silent: true }) : listTrucks(params))
    if (my !== seq) return
    data.value = res
    error.value = false
    loadedAt = Date.now()
  } catch {
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}

// Адрес — источник фильтра и поиска: смена (свой чип, поиск, «Назад») — первая страница и новый запрос.
const pushQuery = (next: { filter?: FilterId; q?: string }) => {
  const f = next.filter ?? filter.value
  const s = next.q ?? q.value
  const query: Record<string, string> = {}
  if (f !== 'all') query.filter = f
  if (s) query.q = s
  void router.replace({ query })
}
// Уход на карточку машины меняет адрес (query пустеет) — список под уходящим экраном не перезапрашиваем.
const LIST_ROUTE = 'auto-transit'
// Крошка карточки машины ведёт сюда же, с фильтром и поиском (как «Заявки» в Импорте 40).
watch(() => route.fullPath, (p) => { if (route.name === LIST_ROUTE) rememberListPath('autoTransit', p) }, { immediate: true })
watch([filter, q], () => {
  if (route.name !== LIST_ROUTE) return
  page.value = 1
  void load()
})

const setFilter = (v: unknown) => pushQuery({ filter: v as FilterId })
const searchText = ref(q.value)
watch(q, (v) => { if (v !== searchText.value.trim()) searchText.value = v })
const onSearch = (v: string) => {
  const s = v.trim()
  if (s !== q.value) pushQuery({ q: s })
}
const filtered = computed(() => filter.value !== 'all' || !!q.value)
const resetFilters = () => {
  searchText.value = ''
  pushQuery({ filter: 'all', q: '' })
}
const onPage = (p: number) => {
  page.value = p
  void load()
}

const filterOptions = computed(() => FILTERS.map((f) => ({
  value: f.id,
  label: t(f.key),
  count: data.value?.counts?.[f.id],
})))

// ---- Автообновление и часы ----
const now = ref(new Date())
let refreshTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
const stopTimers = () => {
  if (refreshTimer !== undefined) clearInterval(refreshTimer)
  if (clockTimer !== undefined) clearInterval(clockTimer)
  refreshTimer = clockTimer = undefined
}
const startTimers = () => {
  stopTimers()
  refreshTimer = setInterval(() => { void load(true) }, REFRESH_MS)
  clockTimer = setInterval(() => { now.value = new Date() }, CLOCK_MS)
}
const onVisibility = () => {
  if (document.visibilityState === 'hidden') {
    stopTimers()
    return
  }
  now.value = new Date()
  if (Date.now() - loadedAt >= REFRESH_MS) void load(true)
  startTimers()
}
onMounted(() => {
  void load()
  if (document.visibilityState !== 'hidden') startTimers()
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  stopTimers()
  document.removeEventListener('visibilitychange', onVisibility)
})

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const firstLoad = computed(() => !data.value && loading.value)
const openNew = () => { void router.push({ name: 'auto-transit-new' }) }
</script>

<template>
  <ZPage :title="t('broker.autoTransit.list.title')" data-auto-transit>
    <template #meta>
      <span v-if="data" class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3" data-at-count>{{ total }}</span>
    </template>
    <template v-if="canBorder" #actions>
      <ZButton variant="primary" class="max-sm:h-11" data-at-new @click="openNew">
        <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
        {{ t('broker.autoTransit.list.newTruck') }}
      </ZButton>
    </template>

    <div class="flex min-w-0 flex-col gap-3">
      <!-- Обёртка-строка: flex-basis 15rem у ListSearch рассчитан на строку инструментов; в колонке он стал бы высотой. -->
      <div class="flex min-w-0" data-at-search>
        <ListSearch
          :value="searchText"
          :debounce="300"
          :placeholder="t('broker.autoTransit.list.search')"
          @update:value="searchText = $event"
          @search="onSearch"
        />
      </div>
      <div class="min-w-0 max-w-full overflow-x-auto">
        <ZSegmented
          :value="filter"
          :options="filterOptions"
          :aria-label="t('broker.autoTransit.list.filtersLabel')"
          class="[&_button]:shrink-0 [&_button]:whitespace-nowrap"
          data-at-filters
          @update:value="setFilter"
        />
      </div>
    </div>

    <ZAlert v-if="error" type="error" :message="t('broker.list.loadError')" data-at-error>
      <template #action>
        <ZButton size="sm" :loading="loading" class="max-sm:h-11" data-at-retry @click="load()">{{ t('broker.list.retry') }}</ZButton>
      </template>
    </ZAlert>

    <ZPanel v-if="firstLoad" padding="none" data-at-skeleton>
      <div v-for="i in 5" :key="i" class="border-b border-line px-4 py-4 last:border-b-0">
        <ZSkeleton :lines="2" />
      </div>
    </ZPanel>
    <ZPanel v-else-if="items.length" padding="none">
      <div role="list" :aria-label="t('broker.autoTransit.list.listLabel')" :aria-busy="loading" class="divide-y divide-line">
        <div v-for="it in items" :key="it.id" role="listitem">
          <TruckRow :item="it" :now="now" />
        </div>
      </div>
    </ZPanel>
    <ZPanel v-else-if="data">
      <ZEmpty
        :title="filtered ? t('broker.list.nothingFound') : t('broker.autoTransit.list.empty')"
        :hint="filtered ? t('broker.list.nothingFoundHint') : t(canBorder ? 'broker.autoTransit.list.emptyHint' : 'broker.autoTransit.list.emptyHintReadonly')"
      >
        <template v-if="filtered || canBorder" #action>
          <ZButton v-if="filtered" data-at-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
          <ZButton v-else variant="primary" data-at-empty-new @click="openNew">{{ t('broker.autoTransit.list.newTruck') }}</ZButton>
        </template>
      </ZEmpty>
    </ZPanel>

    <div v-if="total > LIST_PAGE_SIZE" class="flex justify-center">
      <ZPagination :current="page" :total="total" :page-size="LIST_PAGE_SIZE" :disabled="loading" @change="onPage" />
    </div>
  </ZPage>
</template>
