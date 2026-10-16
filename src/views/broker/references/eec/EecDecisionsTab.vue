<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { tnvedEecApi, type EecDecisionView } from '@/api/tnvedEec'
import { formatDay } from '@/views/broker/list'
import { formatCount, formatDateTime } from '@/views/broker/references/system/systemData'
import { useBlock } from '@/views/home/useBlock'
import { message } from '@/ui/message'
import EecActionModal, { type EecActionValue } from './EecActionModal.vue'
import { P, decisionFlagLabel, utc } from './eec'

// Вкладка «Даты решений»: решения ЕЭК, «с даты вступления в силу» которых действуют ставки сносок. Портал ЕАЭС
// дату не дал (не найдено, нет даты, неоднозначно) — ставки таких сносок в расчёте «проверить вручную».
// Человек указывает дату вступления (не раньше даты принятия) и комментарий; список «без даты» уменьшается.
const emit = defineEmits<{ count: [n: number] }>()
const { t, locale } = useI18n()

const pendingOnly = ref(true)
const board = useBlock(true, async () => {
  const { data } = await tnvedEecApi.decisions(pendingOnly.value)
  const list = Array.isArray(data) ? data : []
  if (pendingOnly.value) emit('count', list.length)
  return list
})
onMounted(() => { void board.load() })
const props = defineProps<{ version?: number }>()
watch(() => props.version, () => { void board.load() })
const onScope = (v: unknown) => {
  pendingOnly.value = v === 'pending'
  void board.load()
}
const scopeOptions = computed(() => [
  { value: 'pending', label: t(`${P}.dec.pending`) },
  { value: 'all', label: t(`${P}.dec.all`) },
])
const items = computed<EecDecisionView[]>(() => board.data ?? [])

const headline = (d: EecDecisionView) => t(`${P}.dec.headline`, { title: d.title, date: formatDay(d.decisionDate) })
const sourceLabel = (d: EecDecisionView) =>
  (d.source === 'manual' ? t(`${P}.dec.sourceManual`) : d.source === 'auto' ? t(`${P}.dec.sourceAuto`) : t(`${P}.dec.sourceNone`))

// ---- Подтверждение даты ----
const target = shallowRef<EecDecisionView | null>(null)
const modalOpen = ref(false)
const ask = (d: EecDecisionView) => { target.value = d; modalOpen.value = true }
const save = async (v: EecActionValue) => {
  const d = target.value
  if (!d || !v.date) return
  await tnvedEecApi.confirmDecision(d.id, v.date, v.note)
  message.success(t(`${P}.dec.confirmed`, { date: formatDay(v.date) }))
  void board.load()
}
const num = (n: number) => formatCount(n, locale.value)
// Сервер не примет дату позже даты принятия + 5 лет.
const plusYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}`
</script>

<template>
  <div class="flex flex-col gap-4" data-eec-decisions>
    <div class="flex flex-wrap items-center gap-2">
      <p class="m-0 min-w-0 flex-1 basis-72 text-sm text-ink-3 text-pretty">{{ t(`${P}.dec.sub`) }}</p>
      <ZSegmented :value="pendingOnly ? 'pending' : 'all'" :options="scopeOptions" :aria-label="t(`${P}.dec.scope`)" data-eec-dec-scope @update:value="onScope" />
    </div>

    <div v-if="board.error && !board.data" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-eec-dec-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${P}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-eec-dec-retry @click="board.load()">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <div v-else-if="board.loading && !board.data" class="rounded-panel border border-line bg-surface px-5 py-5" data-eec-dec-loading>
      <ZSkeleton :lines="3" height="20px" />
    </div>
    <div v-else-if="!items.length" class="rounded-panel border border-dashed border-line-strong" data-eec-dec-empty>
      <ZEmpty :title="pendingOnly ? t(`${P}.dec.emptyPending`) : t(`${P}.dec.empty`)" :hint="pendingOnly ? t(`${P}.dec.emptyPendingHint`) : undefined" />
    </div>
    <ul v-else class="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line bg-surface p-0" :aria-label="t(`${P}.tabs.decisions`)" data-eec-dec-list>
      <li v-for="d in items" :key="d.id" class="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0 max-sm:px-4" data-eec-dec :data-id="d.id">
        <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div class="min-w-0 flex-1 basis-64">
            <p class="m-0 text-sm font-semibold text-ink" data-eec-dec-title>{{ headline(d) }}</p>
            <p class="m-0 mt-0.5 text-xs text-ink-3">
              {{ t(`${P}.dec.usage`, { footnotes: d.footnotes.join(', ') || '—', codes: num(d.codes) }) }}
            </p>
          </div>
          <ZButton
            :variant="d.entryIntoForce ? 'secondary' : 'primary'"
            size="sm"
            class="max-sm:h-11 max-sm:w-full"
            data-eec-dec-confirm
            @click="ask(d)"
          >{{ d.entryIntoForce ? t(`${P}.dec.change`) : t(`${P}.dec.confirm`) }}</ZButton>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="text-ink-3">{{ t(`${P}.dec.entry`) }}:</span>
          <span :class="d.entryIntoForce ? 'tabular-nums text-ink' : 'text-tone-wait-fg'" data-eec-dec-entry>
            {{ d.entryIntoForce ? formatDay(d.entryIntoForce) : t(`${P}.dec.noDate`) }}
          </span>
          <span class="text-xs text-ink-3" data-eec-dec-source>{{ sourceLabel(d) }}<template v-if="d.confirmedBy"> · {{ d.confirmedBy }}</template></span>
          <span v-if="d.publishedDate" class="text-xs text-ink-3">{{ t(`${P}.dec.published`, { date: formatDay(d.publishedDate) }) }}</span>
        </div>
        <div v-if="d.flags.length" class="flex flex-wrap gap-1.5" data-eec-dec-flags>
          <ZTag v-for="f in d.flags" :key="f" size="sm" tone="wait" :data-flag="f">{{ decisionFlagLabel(f, t) }}</ZTag>
        </div>
        <p v-if="d.portalComment" class="m-0 text-xs text-ink-2 text-pretty [overflow-wrap:anywhere]">{{ d.portalComment }}</p>
        <p v-if="d.note" class="m-0 text-xs text-ink-2">{{ t(`${P}.dec.note`) }}: {{ d.note }}</p>
        <p v-if="d.lastCheckError" class="m-0 text-xs text-tone-danger-fg [overflow-wrap:anywhere]" data-eec-dec-check-error>
          {{ t(`${P}.dec.checkError`, { date: formatDateTime(utc(d.lastCheckedAtUtc), locale) }) }}: {{ d.lastCheckError }}
        </p>
        <a
          v-if="d.portalUrl"
          :href="d.portalUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex w-fit items-center gap-1 text-xs text-zircon-ink underline-offset-2 hover:underline max-sm:min-h-11"
          data-eec-dec-portal
        >{{ t(`${P}.dec.portal`) }} <PhArrowSquareOut :size="12" aria-hidden="true" /><span class="sr-only">({{ t(`${P}.newTab`) }})</span></a>
      </li>
    </ul>

    <EecActionModal
      v-model:open="modalOpen"
      :title="t(`${P}.dec.modalTitle`)"
      :text="target ? headline(target) : undefined"
      :ok-text="t(`${P}.dec.modalOk`)"
      :date-label="t(`${P}.dec.entry`)"
      date-required
      :date-min="target?.decisionDate ?? null"
      :date-max="target ? plusYears(target.decisionDate, 5) : null"
      :date-help="target ? t(`${P}.dec.dateHelp`, { date: formatDay(target.decisionDate) }) : undefined"
      :initial-date="target?.entryIntoForce ?? null"
      :note-label="t(`${P}.dec.noteLabel`)"
      :save="save"
    />
  </div>
</template>
