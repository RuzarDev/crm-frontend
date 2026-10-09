<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple } from '@phosphor-icons/vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import { systemApi, type AuditSearchRow } from '@/api/system'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import { formatAuditAction } from '@/utils/labels'
import { exportXlsx } from '@/views/broker/list'
import {
  AUDIT_ACTIONS, AUDIT_DAYS, AUDIT_EXPORT_LIMIT, AUDIT_PAGE, AUDIT_Q_DEBOUNCE_MS,
  auditExcelRows, auditParams, auditTone, buildAuditQuery, formatAuditWhen, parseAuditQuery, type AuditFilters,
} from './audit'

// «Журнал» раздела «Настройки» (волна 5б): кто что менял — права, пароли, реквизиты, блокировки, отзыв документов.
// Фильтры (период, действие, сотрудник, поиск) живут в адресе (?days=&action=&actor=&q=), список — по 50 строк
// с «Показать ещё». Ответ устаревшего запроса при смене фильтров отбрасывается (seq). Доступ — администратор.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const filters = computed<AuditFilters>(() => parseAuditQuery(route.query))
const setFilters = (patch: Partial<AuditFilters>) => {
  void router.replace({ query: buildAuditQuery(route.query, { ...filters.value, ...patch }) })
}

// ---- Поиск: ввод отдельно от адреса, в адрес — через паузу 400 мс (ListSearch) ----
const qText = ref(filters.value.q)
watch(() => filters.value.q, (q) => { qText.value = q })

// ---- Данные ----
const items = shallowRef<AuditSearchRow[]>([])
const total = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref(false)
const moreError = ref(false)
let seq = 0

const load = async (reset: boolean) => {
  const my = ++seq
  const f = filters.value
  if (reset) {
    items.value = []
    total.value = 0
    loading.value = true
    loadingMore.value = false
    error.value = false
  } else {
    loadingMore.value = true
  }
  moreError.value = false
  try {
    const res = await systemApi.auditSearch(auditParams(f, reset ? 0 : items.value.length, AUDIT_PAGE), { silent: true })
    if (my !== seq) return
    // Новые записи сдвигают смещение — повторы отбрасываем.
    const known = new Set(items.value.map((r) => r.id))
    items.value = reset ? res.items : [...items.value, ...res.items.filter((r) => !known.has(r.id))]
    total.value = res.total
  } catch {
    if (my !== seq) return
    if (reset) error.value = true
    else moreError.value = true
  } finally {
    if (my === seq) { loading.value = false; loadingMore.value = false }
  }
}
watch(() => JSON.stringify(auditParams(filters.value, 0, AUDIT_PAGE)), () => { void load(true) }, { immediate: true })
onBeforeUnmount(() => { seq += 1 })

// Список сотрудников для чипа: ошибка не мешает странице — чип просто без вариантов.
const actors = ref<{ id: string; name: string }[]>([])
onMounted(async () => {
  try { actors.value = await systemApi.auditActors({ silent: true }) } catch { actors.value = [] }
})

// ---- Чипы ----
const daysOptions = computed(() => AUDIT_DAYS.map((d) => ({ value: String(d), label: t(`broker.settings.audit.days${d}`) })))
const onDays = (v: string | null) => setFilters({ days: v == null ? 0 : Number(v) })
const actionOptions = computed(() => AUDIT_ACTIONS.map((a) => ({ value: a, label: formatAuditAction(a) })))
const actorOptions = computed(() => [...actors.value]
  .sort((a, b) => a.name.localeCompare(b.name, locale.value))
  .map((a) => ({ value: a.id, label: a.name })))

// ---- Таблица ----
const columns = computed<ZColumn<AuditSearchRow>[]>(() => [
  { key: 'when', title: t('broker.settings.audit.col.when'), width: 150 },
  { key: 'who', title: t('broker.settings.audit.col.who'), width: 220 },
  { key: 'action', title: t('broker.settings.audit.col.action'), width: 280 },
  { key: 'what', title: t('broker.settings.audit.col.what'), minWidth: 240 },
])
const when = (r: AuditSearchRow) => formatAuditWhen(r.atUtc, locale.value)
const whenFull = (r: AuditSearchRow) => formatAuditWhen(r.atUtc, locale.value, new Date(), true)

const narrowed = computed(() => !!(filters.value.action || filters.value.actor || filters.value.q))
const hasMore = computed(() => items.value.length < total.value)

// ---- Excel: все строки по текущим фильтрам, до 5000 ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const res = await systemApi.auditSearch(auditParams(filters.value, 0, AUDIT_EXPORT_LIMIT), { silent: true })
    const labels = {
      when: t('broker.settings.audit.col.when'), who: t('broker.settings.audit.col.who'),
      action: t('broker.settings.audit.col.action'), what: t('broker.settings.audit.col.what'),
    }
    await exportXlsx('audit', t('broker.settings.audit.title'), auditExcelRows(res.items, labels, locale.value, formatAuditAction))
    if (res.total > AUDIT_EXPORT_LIMIT) {
      message.warning(t('broker.settings.audit.exportTruncated', { limit: AUDIT_EXPORT_LIMIT, total: res.total }))
    }
  } catch {
    message.error(t('broker.settings.audit.exportError'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 overflow-x-clip" data-audit>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.settings.audit.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted" data-audit-hint>{{ t('broker.settings.audit.hint') }}</p>
      </div>
      <ZButton
        variant="ghost"
        :loading="exporting"
        :disabled="!total"
        :title="total ? undefined : t('broker.list.exportEmpty')"
        class="ml-auto max-sm:h-11 max-sm:w-full"
        data-audit-export
        @click="exportExcel"
      >
        <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
        {{ t('broker.list.excel') }}
      </ZButton>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      <ListSearch
        :value="qText"
        :debounce="AUDIT_Q_DEBOUNCE_MS"
        :placeholder="t('broker.settings.audit.search')"
        data-audit-search
        @update:value="qText = $event"
        @search="setFilters({ q: $event })"
      />
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <FilterChip
          :label="t('broker.settings.audit.period')"
          :all-label="t('broker.settings.audit.daysAll')"
          :options="daysOptions"
          :value="filters.days > 0 ? String(filters.days) : null"
          data-audit-days
          @update:value="onDays"
        />
        <FilterChip
          :label="t('broker.settings.audit.action')"
          :all-label="t('broker.settings.audit.allActions')"
          :options="actionOptions"
          :value="filters.action || null"
          data-audit-action
          @update:value="setFilters({ action: $event ?? '' })"
        />
        <FilterChip
          :label="t('broker.settings.audit.actor')"
          :all-label="t('broker.settings.audit.allActors')"
          :options="actorOptions"
          :value="filters.actor || null"
          data-audit-actor
          @update:value="setFilters({ actor: $event ?? '' })"
        />
      </div>
    </div>

    <div v-if="error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-audit-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.settings.audit.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-audit-retry @click="load(true)">{{ t('broker.settings.audit.retry') }}</ZButton>
    </div>
    <template v-else>
      <ZTable
        :columns="columns"
        :data-source="items"
        row-key="id"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 720 }"
        :aria-label="t('broker.settings.audit.title')"
        :aria-busy="loading || undefined"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-audit-table
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'when'" class="tabular-nums text-ink-3" :title="whenFull(record)" data-audit-when>{{ when(record) }}</span>
          <span v-else-if="column.key === 'who'" class="inline-flex min-w-0 items-center gap-2.5" data-audit-who>
            <ZAvatar :name="record.actorName" size="md" />
            <span class="min-w-0 truncate text-ink">{{ record.actorName }}</span>
          </span>
          <StatusDot
            v-else-if="column.key === 'action'"
            :tone="auditTone(record.action)"
            :label="formatAuditAction(record.action)"
            :data-tone="auditTone(record.action)"
            data-audit-action-cell
          />
          <span v-else-if="column.key === 'what'" class="text-ink-2" data-audit-what>{{ record.summary }}</span>
        </template>
        <template #emptyText>
          <ZEmpty
            v-if="narrowed"
            :title="t('broker.settings.audit.nothing')"
            :hint="t('broker.settings.audit.nothingHint')"
          />
          <ZEmpty v-else :title="t('broker.settings.audit.empty')" />
        </template>
      </ZTable>

      <div v-if="!loading && items.length" class="flex flex-wrap items-center gap-x-4 gap-y-2" data-audit-footer>
        <p class="m-0 text-sm text-muted tabular-nums" data-audit-shown>{{ t('broker.settings.audit.shown', { n: items.length, m: total }) }}</p>
        <ZButton
          v-if="hasMore"
          :loading="loadingMore"
          class="max-sm:h-11 max-sm:w-full"
          data-audit-more
          @click="load(false)"
        >{{ t('broker.settings.audit.more') }}</ZButton>
        <p v-if="moreError" role="alert" class="m-0 text-sm text-ink-2" data-audit-more-error>{{ t('broker.settings.audit.moreError') }}</p>
      </div>
    </template>
  </div>
</template>
