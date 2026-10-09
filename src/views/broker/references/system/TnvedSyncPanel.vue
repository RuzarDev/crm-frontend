<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhCaretDown, PhDatabase } from '@phosphor-icons/vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import type { ZTone } from '@/components/z/ZTag.vue'
import { tnvedApi } from '@/api/tnved'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import type { TnvedSyncLogDto } from '@/types/api'
import { durationParts, formatCount, formatDateTime } from './systemData'

// «Синхронизация ТН ВЭД» (право tnved.manage): история прогонов (статус, длительность, +добавлено ~изменено −удалено,
// ставки, кто запустил, ошибка раскрывается), «Запустить синхронизацию» с подтверждением — сервер отвечает по окончании,
// до ответа «выполняется…»; «Загрузить переходы» (таблица старый код → новые). last — дата последнего прогона для меню.
const emit = defineEmits<{ last: [iso: string | null]; error: [] }>()
const { t, locale } = useI18n()
const { confirm } = useConfirm()
const P = 'broker.references.system.sync'

const logs = shallowRef<TnvedSyncLogDto[]>([])
const loading = ref(true)
const error = ref(false)
let seq = 0
const load = async () => {
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const { data } = await tnvedApi.syncHistory({ silent: true })
    if (my !== seq) return
    logs.value = Array.isArray(data) ? data : []
    emit('last', logs.value[0]?.startedAtUtc ?? null)
  } catch {
    if (my === seq) {
      error.value = true
      emit('error') // дата в меню не ждёт вечно: «—»
    }
  } finally {
    if (my === seq) loading.value = false
  }
}
void load()

const STATUS: Record<string, { tone: ZTone; key: string }> = {
  Completed: { tone: 'done', key: 'completed' },
  Running: { tone: 'info', key: 'running' },
  Failed: { tone: 'danger', key: 'failed' },
}
const statusOf = (s: string) => STATUS[s] ?? { tone: 'neutral' as ZTone, key: '' }
const statusLabel = (s: string) => (statusOf(s).key ? t(`${P}.status.${statusOf(s).key}`) : s)
const duration = (r: TnvedSyncLogDto) => {
  const d = durationParts(r.startedAtUtc, r.finishedAtUtc)
  return d ? t(`${P}.${d.unit}`, { n: d.n }) : '—'
}
const who = (by: string) => (by === 'scheduler' ? t(`${P}.byScheduler`) : by.startsWith('admin:') ? t(`${P}.byHand`) : by)
const num = (n: number) => formatCount(n, locale.value)

const open = ref(new Set<number>())
const toggle = (id: number) => {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}

// ---- Запуск ----
const running = ref(false)
const run = async () => {
  if (running.value) return
  const ok = await confirm({ title: t(`${P}.confirmTitle`), content: t(`${P}.confirmText`), okText: t(`${P}.confirmOk`) })
  if (!ok) return
  running.value = true
  try {
    await tnvedApi.syncTrigger()
    message.success(t(`${P}.done`))
  } catch { /* текст ошибки показал общий перехватчик */ } finally {
    running.value = false
    await load()
  }
}

const seeding = ref(false)
const seed = async () => {
  if (seeding.value) return
  seeding.value = true
  try {
    const { data } = await tnvedApi.seedTransitions()
    message.success(t(`${P}.seedDone`, { n: data.inserted, v: data.sourceVersion }))
  } catch { /* текст ошибки показал общий перехватчик */ } finally {
    seeding.value = false
  }
}
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" aria-labelledby="sd-title-sync" data-tnved-sync>
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1 basis-60">
        <h2 id="sd-title-sync" class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ t(`${P}.title`) }}</h2>
        <p class="m-0 mt-1 text-sm text-ink-3">{{ t(`${P}.sub`) }}</p>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <ZButton variant="secondary" class="border border-line-strong bg-surface max-sm:h-11 max-sm:flex-1" :loading="seeding" data-sync-seed @click="seed">
          <template #icon><PhDatabase :size="15" aria-hidden="true" /></template>
          {{ t(`${P}.seed`) }}
        </ZButton>
        <ZButton variant="primary" class="max-sm:h-11 max-sm:flex-1" :loading="running" data-sync-run @click="run">
          <template #icon><PhArrowsClockwise :size="15" aria-hidden="true" /></template>
          {{ t(`${P}.run`) }}
        </ZButton>
      </div>
    </div>
    <p v-if="running" class="m-0 text-sm text-ink-2" role="status" data-sync-running>{{ t(`${P}.running`) }}</p>

    <h3 class="m-0 text-sm font-semibold text-ink-2">{{ t(`${P}.history`) }}</h3>
    <div v-if="error && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-sync-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.references.system.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-sync-retry @click="load">{{ t('broker.references.system.retry') }}</ZButton>
    </div>
    <div v-else-if="loading && !logs.length" class="rounded-panel border border-line bg-surface px-5 py-5" data-sync-loading>
      <ZSkeleton :lines="4" height="20px" />
    </div>
    <div v-else-if="!logs.length" class="rounded-panel border border-dashed border-line-strong" data-sync-empty>
      <ZEmpty :title="t(`${P}.empty`)" />
    </div>
    <ul v-else class="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line bg-surface p-0" :aria-label="t(`${P}.history`)" data-sync-history>
      <li
        class="hidden grid-cols-[150px_120px_90px_minmax(170px,1fr)_100px_130px] gap-3 border-b border-line bg-canvas px-4 py-2 text-xs font-medium text-ink-3 lg:grid"
        aria-hidden="true"
      >
        <span>{{ t(`${P}.col.started`) }}</span>
        <span>{{ t(`${P}.col.status`) }}</span>
        <span>{{ t(`${P}.col.duration`) }}</span>
        <span>{{ t(`${P}.col.changes`) }}</span>
        <span class="text-right">{{ t(`${P}.col.rates`) }}</span>
        <span>{{ t(`${P}.col.by`) }}</span>
      </li>
      <li v-for="r in logs" :key="r.id" class="border-b border-line px-4 py-3 last:border-b-0" data-sync-row :data-status="r.status">
        <div class="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-sm lg:grid-cols-[150px_120px_90px_minmax(170px,1fr)_100px_130px]">
          <span class="tabular-nums text-ink" data-sync-started>{{ formatDateTime(r.startedAtUtc, locale) }}</span>
          <span class="max-lg:justify-self-end"><StatusDot :tone="statusOf(r.status).tone" :label="statusLabel(r.status)" /></span>
          <span class="tabular-nums text-ink-2" data-sync-duration><span class="text-ink-3 lg:hidden">{{ t(`${P}.col.duration`) }}: </span>{{ duration(r) }}</span>
          <span class="flex flex-wrap gap-1.5 tabular-nums max-lg:justify-self-end" :title="t(`${P}.changesTitle`)" data-sync-changes>
            <span class="text-tone-done-fg">+{{ num(r.nodesAdded) }}</span>
            <span class="text-tone-info-fg">~{{ num(r.nodesUpdated) }}</span>
            <span class="text-tone-danger-fg">−{{ num(r.nodesRemoved) }}</span>
          </span>
          <span class="tabular-nums text-ink-2 lg:text-right" data-sync-rates><span class="text-ink-3 lg:hidden">{{ t(`${P}.col.rates`) }}: </span>{{ num(r.ratesUpdated) }}</span>
          <span class="truncate text-ink-2 max-lg:justify-self-end" :title="r.triggeredBy" data-sync-by>{{ who(r.triggeredBy) }}</span>
        </div>
        <template v-if="r.errorMessage">
          <button
            type="button"
            class="mt-2 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent px-0 font-sans text-sm text-tone-danger-fg outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
            :aria-expanded="open.has(r.id)"
            data-sync-error-toggle
            @click="toggle(r.id)"
          >
            {{ open.has(r.id) ? t(`${P}.hideError`) : t(`${P}.showError`) }}
            <PhCaretDown :size="13" :class="open.has(r.id) ? 'rotate-180' : ''" aria-hidden="true" />
          </button>
          <p v-if="open.has(r.id)" class="m-0 mt-1 rounded-row bg-tone-danger-bg px-3 py-2 text-xs whitespace-pre-wrap text-tone-danger-fg [overflow-wrap:anywhere]" data-sync-error-text>{{ r.errorMessage }}</p>
        </template>
      </li>
    </ul>
  </section>
</template>
