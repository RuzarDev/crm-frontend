<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown } from '@phosphor-icons/vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { EecSyncStatus } from '@/api/tnvedEec'
import { formatCount, formatDateTime } from '@/views/broker/references/system/systemData'
import { P, runActive, runBy, runItemLabel, runItemTone, runStatusLabel, runTone, utc } from './eec'

// Последняя проверка ЕЭК: статус, кто и когда запустил, счётчики (файлов, скачано, применено, ждут, ошибок),
// ошибка прогона и журнал по файлам (раскрывается). Пока прогон идёт — «Проверка идёт…» (опрос — в useEecSync).
const props = defineProps<{
  status: EecSyncStatus | null
  loading: boolean
  error: boolean
  alreadyRunning: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()

const run = computed(() => props.status?.run ?? null)
const active = computed(() => runActive(props.status))
const num = (n: number) => formatCount(n, locale.value)
const stats = computed(() => {
  const r = run.value
  if (!r) return []
  return [
    { key: 'listed', n: r.filesListed },
    { key: 'downloaded', n: r.filesDownloaded },
    { key: 'applied', n: r.editionsApplied },
    { key: 'held', n: r.editionsHeld, warn: r.editionsHeld > 0 },
    { key: 'failed', n: r.filesFailed, danger: r.filesFailed > 0 },
    { key: 'decisions', n: r.decisionsResolved },
    { key: 'keden', n: r.kedenPrefetched },
  ]
})
// Журнал: «пропущено» — шум (96 файлов без изменений), показываем только по кнопке.
const showSkipped = ref(false)
const open = ref(false)
const items = computed(() => (run.value?.items ?? []).filter((i) => showSkipped.value || i.action !== 'skipped'))
const skippedCount = computed(() => (run.value?.items ?? []).filter((i) => i.action === 'skipped').length)
</script>

<template>
  <section class="flex min-w-0 flex-col gap-3 rounded-panel border border-line bg-surface px-5 py-4 max-sm:px-4" :aria-label="t(`${P}.run.title`)" data-eec-sync>
    <div v-if="loading && !status" data-eec-sync-loading><ZSkeleton :lines="2" height="18px" /></div>
    <div v-else-if="error && !status" role="alert" class="flex flex-wrap items-center gap-3" data-eec-sync-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t(`${P}.run.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-eec-sync-retry @click="emit('retry')">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <template v-else>
      <p v-if="active" role="status" class="m-0 flex items-center gap-2 text-sm text-ink" data-eec-sync-running>
        <ZSpin size="sm" />
        <span>{{ alreadyRunning ? t(`${P}.run.alreadyRunning`) : t(`${P}.run.running`) }}</span>
      </p>
      <p v-if="!run && !active" class="m-0 text-sm text-ink-3" data-eec-sync-never>{{ t(`${P}.run.never`) }}</p>
      <div v-if="run" class="flex min-w-0 flex-col gap-2">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="font-semibold text-ink">{{ t(`${P}.run.last`) }}</span>
          <StatusDot :tone="runTone(run.status)" :label="runStatusLabel(run.status, t)" data-eec-sync-status />
          <span class="tabular-nums text-ink-2" data-eec-sync-started>{{ formatDateTime(utc(run.startedAtUtc), locale) }}</span>
          <span class="text-ink-3" data-eec-sync-by>{{ runBy(run.triggeredBy, t) }}</span>
        </div>
        <ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm" data-eec-sync-stats>
          <li
            v-for="s in stats"
            :key="s.key"
            :class="['tabular-nums', s.danger ? 'text-tone-danger-fg' : s.warn ? 'text-tone-wait-fg' : 'text-ink-2']"
            :data-stat="s.key"
          ><span class="text-ink-3">{{ t(`${P}.run.stat.${s.key}`) }}:</span> {{ num(s.n) }}</li>
        </ul>
        <p v-if="run.errorMessage" class="m-0 rounded-row bg-tone-danger-bg px-3 py-2 text-xs whitespace-pre-wrap text-tone-danger-fg [overflow-wrap:anywhere]" data-eec-sync-message>{{ run.errorMessage }}</p>
        <div v-if="run.items.length">
          <button
            type="button"
            class="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent px-0 font-sans text-sm text-zircon-ink outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
            :aria-expanded="open"
            data-eec-sync-log-toggle
            @click="open = !open"
          >
            {{ open ? t(`${P}.run.hideLog`) : t(`${P}.run.showLog`, { n: run.items.length }) }}
            <PhCaretDown :size="13" :class="open ? 'rotate-180' : ''" aria-hidden="true" />
          </button>
          <div v-if="open" class="mt-2 flex flex-col gap-2" data-eec-sync-log>
            <ZCheckbox v-if="skippedCount" v-model:checked="showSkipped" class="text-sm text-ink-2 max-sm:min-h-11" data-eec-sync-skipped>
              {{ t(`${P}.run.showSkipped`, { n: skippedCount }) }}
            </ZCheckbox>
            <p v-if="!items.length" class="m-0 text-sm text-ink-3">{{ t(`${P}.run.logEmpty`) }}</p>
            <ul v-else class="m-0 flex list-none flex-col divide-y divide-line rounded-row border border-line p-0">
              <li v-for="(i, idx) in items" :key="idx" class="flex flex-col gap-0.5 px-3 py-2 text-sm" data-eec-sync-item :data-action="i.action">
                <div class="flex flex-wrap items-center gap-2">
                  <ZTag size="sm" :tone="runItemTone(i.action)">{{ runItemLabel(i.action, t) }}</ZTag>
                  <span v-if="i.group" class="text-ink">{{ t(`${P}.group`, { n: i.group }) }}</span>
                  <span class="min-w-0 truncate font-mono text-xs text-ink-3" :title="i.file">{{ i.file }}</span>
                  <RouterLink
                    v-if="i.editionId"
                    :to="`/tnved/eec/editions/${i.editionId}`"
                    class="text-xs text-zircon-ink underline-offset-2 hover:underline"
                  >{{ t(`${P}.run.openEdition`) }}</RouterLink>
                </div>
                <p v-if="i.detail" class="m-0 text-xs text-ink-2 [overflow-wrap:anywhere]">{{ i.detail }}</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
