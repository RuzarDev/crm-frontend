<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ListSearch from '@/components/broker/ListSearch.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import {
  tnvedEecApi, type EecApplyResult, type EecCodeChange, type EecEditionDetail, type EecFootnoteChange, type EecUnparsedLine,
} from '@/api/tnvedEec'
import { formatDay } from '@/views/broker/list'
import { formatCount, formatDateTime, responseStatus } from '@/views/broker/references/system/systemData'
import { cleanName, formatTnvedCode } from '@/views/references/tnvedShared'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import EecActionModal, { type EecActionValue } from './EecActionModal.vue'
import {
  CHANGE_FILTERS, P, canDecide, changeCounts, changeFlags, changeTone, editionStatusLabel, editionTitle, editionTone,
  filterCodeChanges, rateStateText, unparsedLabel, utc, type ChangeFilter,
} from './eec'

// Карточка редакции ЕЭК (/tnved/eec/editions/:id): что изменится (было → станет, рядом ставка КЕДЕН), новые коды
// дерева, закрытые в дереве, висячие ссылки на сноски, нераспознанные строки разбора. Отложенную (held) или
// загруженную (staged) редакцию можно подтвердить (применить) или отклонить — с комментарием.
const { t, locale } = useI18n()
const route = useRoute()

const id = computed(() => Number(route.params.id))
const detail = shallowRef<EecEditionDetail | null>(null)
const loading = ref(true)
const error = ref<'notFound' | 'other' | null>(null)
let seq = 0
const load = async () => {
  if (!Number.isFinite(id.value)) { error.value = 'notFound'; loading.value = false; return }
  const my = ++seq
  loading.value = true
  error.value = null
  try {
    const { data } = await tnvedEecApi.edition(id.value)
    if (my === seq) detail.value = data
  } catch (e) {
    if (my === seq) error.value = responseStatus(e) === 404 ? 'notFound' : 'other'
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(id, () => { applyResult.value = null; void load() }, { immediate: false })
void load()

const ed = computed(() => detail.value?.edition ?? null)
const diff = computed(() => detail.value?.diff ?? null)
const report = computed(() => detail.value?.report ?? null)
const isNotes = computed(() => ed.value?.kind === 'ettNotes')
const title = computed(() => (ed.value ? editionTitle(ed.value, t) : t(`${P}.edition`)))
const crumbs = computed(() => [{ label: t(`${P}.title`), to: '/tnved/eec' }, { label: title.value }])
const num = (n: number) => formatCount(n, locale.value)

const stats = computed(() => {
  const d = diff.value
  if (!d) return []
  const share = `${(d.removedShare * 100).toLocaleString(locale.value === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 1 })}%`
  const list: { key: string; value: string; warn?: boolean }[] = isNotes.value
    ? [
        { key: 'footnotesAdded', value: num(d.added) },
        { key: 'footnotesChanged', value: num(d.changed) },
        { key: 'footnotesRemoved', value: num(d.removed), warn: d.removed > 0 },
        { key: 'newDecisions', value: num(d.newDecisions.length) },
        { key: 'unparsed', value: num(d.unparsed), warn: d.unparsed > 0 },
      ]
    : [
        { key: 'codes', value: d.isBaseline ? num(d.codesAfter) : `${num(d.codesBefore)} → ${num(d.codesAfter)}` },
        { key: 'added', value: num(d.added) },
        { key: 'changed', value: num(d.changed) },
        { key: 'rateChanged', value: num(d.rateChanged) },
        { key: 'removed', value: d.removed ? `${num(d.removed)} (${share})` : '0', warn: d.removed > 0 },
        { key: 'unrecognized', value: num(d.unrecognizedRates), warn: d.unrecognizedRates > 0 },
        { key: 'unparsed', value: num(d.unparsed), warn: d.unparsed > 0 },
      ]
  return list
})

// ---- Изменения кодов ----
const filter = ref<ChangeFilter>('all')
const q = ref('')
const codePage = ref(1)
watch([filter, q], () => { codePage.value = 1 })
const codes = computed(() => diff.value?.codes ?? [])
const counts = computed(() => changeCounts(codes.value))
const filterOptions = computed(() => CHANGE_FILTERS
  .filter((f) => f === 'all' || counts.value[f] > 0)
  .map((f) => ({ value: f, label: t(`${P}.change.${f}`), count: counts.value[f] })))
const shownCodes = computed(() => filterCodeChanges(codes.value, filter.value, q.value))
const codeColumns = computed<ZColumn<EecCodeChange>[]>(() => [
  { key: 'code', title: t(`${P}.ed.col.code`), width: 260, cardLead: true },
  { key: 'kind', title: t(`${P}.ed.col.kind`), width: 170 },
  { key: 'before', title: t(`${P}.ed.col.before`), width: 170 },
  { key: 'after', title: t(`${P}.ed.col.after`), width: 170 },
  { key: 'keden', title: t(`${P}.ed.col.keden`), width: 130 },
])
const codesWidth = computed(() => codeColumns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0))
const codePagination = computed(() => ({
  current: codePage.value,
  onChange: (p: number) => { codePage.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))
const nameOf = (c: EecCodeChange) => cleanName(c.after?.nameRu ?? c.before?.nameRu ?? '')
const treeTo = (code: string) => ({ path: '/tnved/tree', query: { code } })

// ---- Сноски (примечания) ----
const footnoteColumns = computed<ZColumn<EecFootnoteChange>[]>(() => [
  { key: 'number', title: t(`${P}.ed.col.footnote`), width: 110, cardLead: true },
  { key: 'kind', title: t(`${P}.ed.col.kind`), width: 130 },
  { key: 'before', title: t(`${P}.ed.col.before`), width: 300 },
  { key: 'after', title: t(`${P}.ed.col.after`), width: 300 },
  { key: 'codes', title: t(`${P}.ed.col.codes`), width: 90, align: 'right' },
])
const footnotesWidth = computed(() => footnoteColumns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0))
const fnTone = (k: string) => (k === 'added' ? 'done' : k === 'removed' ? 'danger' : 'info')

// ---- Нераспознанные строки ----
const unparsedColumns = computed<ZColumn<EecUnparsedLine>[]>(() => [
  { key: 'page', title: t(`${P}.ed.col.page`), dataIndex: 'page', width: 80 },
  { key: 'reason', title: t(`${P}.ed.col.reason`), width: 220 },
  { key: 'text', title: t(`${P}.ed.col.text`), width: 420 },
])
const flagEntries = computed(() => Object.entries(report.value?.footnoteFlags ?? {}).filter(([, v]) => v.length))

// ---- Списки кодов (новые в дереве, закрытые в дереве, висячие сноски): первые 60, остальное по кнопке ----
const LIST_LIMIT = 60
const expanded = ref(new Set<string>())
const listOf = (key: string, all: readonly string[]) => (expanded.value.has(key) ? all : all.slice(0, LIST_LIMIT))
const expand = (key: string) => { expanded.value = new Set([...expanded.value, key]) }
const lists = computed(() => {
  const d = diff.value
  if (!d) return []
  return [
    { key: 'newTreeCodes', items: d.newTreeCodes, codes: true },
    { key: 'endedInTree', items: d.endedInTree, codes: true },
    { key: 'missingFootnoteRefs', items: d.missingFootnoteRefs, codes: false },
    { key: 'newDecisions', items: d.newDecisions, codes: false },
  ].filter((l) => l.items.length)
})

// ---- Подтвердить / отклонить ----
const decidable = computed(() => !!ed.value && canDecide(ed.value.status))
const modal = ref<'apply' | 'reject' | null>(null)
const modalOpen = computed({ get: () => modal.value !== null, set: (v: boolean) => { if (!v) modal.value = null } })
const applyResult = shallowRef<EecApplyResult | null>(null)
const save = async (v: EecActionValue) => {
  const e = ed.value
  if (!e) return
  if (modal.value === 'apply') {
    const { data } = await tnvedEecApi.apply(e.id, v.note)
    applyResult.value = data
    message.success(t(`${P}.ed.applied`, { title: editionTitle(e, t) }))
  } else {
    await tnvedEecApi.reject(e.id, v.note)
    message.success(t(`${P}.ed.rejected`, { title: editionTitle(e, t) }))
  }
  await load()
}
const resultLine = computed(() => {
  const r = applyResult.value
  if (!r) return ''
  return isNotes.value
    ? t(`${P}.ed.resultNotes`, { added: r.footnotesAdded, changed: r.footnotesChanged, removed: r.footnotesRemoved, decisions: r.decisionsRegistered })
    : t(`${P}.ed.resultGroup`, {
        changed: r.ratesChanged, added: r.ratesAdded + r.ratesReturned, removed: r.ratesRemoved,
        tree: r.treeNodesAdded, ended: r.treeLeavesEnded,
      })
})
</script>

<template>
  <div class="flex flex-col gap-5" data-eec-edition-page>
    <ZBreadcrumbs :items="crumbs" />

    <div v-if="loading && !detail" class="flex flex-col gap-3 rounded-panel border border-line bg-surface px-5 py-5" data-eec-ed-loading>
      <ZSkeleton width="220px" height="26px" />
      <ZSkeleton :lines="4" />
    </div>
    <div v-else-if="error === 'notFound'" class="rounded-panel border border-dashed border-line-strong" data-eec-ed-not-found>
      <ZEmpty :title="t(`${P}.ed.notFound`)">
        <template #action><RouterLink to="/tnved/eec" class="text-sm text-zircon-ink underline-offset-2 hover:underline">{{ t(`${P}.ed.back`) }}</RouterLink></template>
      </ZEmpty>
    </div>
    <div v-else-if="error && !detail" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-eec-ed-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${P}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-eec-ed-retry @click="load">{{ t(`${P}.retry`) }}</ZButton>
    </div>

    <template v-else-if="ed && diff && report">
      <div class="flex flex-wrap items-start gap-x-3 gap-y-3">
        <div class="min-w-0 flex-1 basis-72">
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink" data-eec-ed-title>{{ title }}</h1>
            <ZTag :tone="editionTone(ed.status)" data-eec-ed-status>{{ editionStatusLabel(ed.status, t) }}</ZTag>
          </div>
          <p class="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3">
            <span v-if="ed.editionDate" data-eec-ed-date>{{ t(`${P}.ed.editionOf`, { date: formatDay(ed.editionDate) }) }}</span>
            <span class="font-mono text-xs leading-5 [overflow-wrap:anywhere]" data-eec-ed-file>{{ ed.fileName }}</span>
            <span>{{ t(`${P}.ed.pages`, { n: report.pageCount }) }}</span>
            <span v-if="report.detectedGroup && report.detectedGroup !== ed.group" class="text-tone-danger-fg">{{ t(`${P}.ed.detectedGroup`, { n: report.detectedGroup }) }}</span>
          </p>
          <p v-if="ed.statusChangedAtUtc" class="m-0 mt-1 text-xs text-ink-3" data-eec-ed-changed>
            {{ t(`${P}.ed.statusChanged`, { date: formatDateTime(utc(ed.statusChangedAtUtc), locale), by: ed.statusChangedBy || '—' }) }}
          </p>
        </div>
        <div v-if="decidable" class="flex flex-wrap gap-2 max-sm:w-full">
          <ZButton variant="danger-ghost" class="max-sm:h-11 max-sm:flex-1" data-eec-ed-reject @click="modal = 'reject'">{{ t(`${P}.ed.reject`) }}</ZButton>
          <ZButton variant="primary" class="max-sm:h-11 max-sm:flex-1" data-eec-ed-apply @click="modal = 'apply'">{{ t(`${P}.ed.apply`) }}</ZButton>
        </div>
      </div>

      <ZAlert v-if="applyResult" type="success" :message="t(`${P}.ed.appliedTitle`)" :description="resultLine" show-icon data-eec-ed-result />
      <ul v-if="applyResult?.warnings.length" class="m-0 flex list-none flex-col gap-1 rounded-row bg-tone-wait-bg px-4 py-2 text-sm text-tone-wait-fg" data-eec-ed-warnings>
        <li v-for="(w, i) in applyResult.warnings" :key="i">{{ w }}</li>
      </ul>

      <div v-if="ed.statusReason || detail?.suspicionReasons.length" class="rounded-panel border border-gold-line bg-gold-soft px-5 py-3 text-sm text-ink max-sm:px-4" data-eec-ed-reasons>
        <p class="m-0 font-semibold">{{ ed.status === 'held' ? t(`${P}.ed.heldWhy`) : t(`${P}.ed.reason`) }}</p>
        <p v-if="ed.statusReason" class="m-0 mt-1 text-ink-2 [overflow-wrap:anywhere]">{{ ed.statusReason }}</p>
        <ul v-if="detail?.suspicionReasons.length" class="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-ink-2">
          <li v-for="(r, i) in detail.suspicionReasons" :key="i" data-eec-ed-reason>{{ r }}</li>
        </ul>
      </div>
      <p v-if="diff.isBaseline" class="m-0 text-sm text-ink-3" data-eec-ed-baseline>{{ t(`${P}.ed.baseline`) }}</p>

      <dl class="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4 xl:grid-cols-7" data-eec-ed-stats>
        <div v-for="s in stats" :key="s.key" class="flex flex-col gap-0.5 bg-surface px-4 py-3" :data-stat="s.key">
          <dt class="text-xs text-ink-3">{{ t(`${P}.ed.stat.${s.key}`) }}</dt>
          <dd :class="['m-0 text-base font-semibold tabular-nums', s.warn ? 'text-tone-wait-fg' : 'text-ink']">{{ s.value }}</dd>
        </div>
      </dl>

      <!-- Изменения кодов (группа) -->
      <section v-if="!isNotes" class="flex flex-col gap-3" :aria-label="t(`${P}.ed.codesTitle`)">
        <h2 class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ t(`${P}.ed.codesTitle`) }}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <ListSearch :value="q" :placeholder="t(`${P}.ed.codesSearch`)" data-eec-ed-search @update:value="q = $event" />
          <ZSegmented
            :value="filter"
            :options="filterOptions"
            :aria-label="t(`${P}.ed.filterLabel`)"
            class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
            data-eec-ed-filter
            @update:value="filter = $event as ChangeFilter"
          />
        </div>
        <ZTable
          :columns="codeColumns"
          :data-source="shownCodes"
          row-key="code"
          :pagination="codePagination"
          :scroll="{ x: codesWidth }"
          :aria-label="t(`${P}.ed.codesTitle`)"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
          data-eec-ed-codes
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'code'" class="flex min-w-0 flex-col gap-0.5" :data-code="record.code">
              <RouterLink :to="treeTo(record.code)" class="w-fit font-mono text-sm font-semibold text-zircon-ink underline-offset-2 hover:underline max-sm:min-h-11">{{ formatTnvedCode(record.code) }}</RouterLink>
              <span v-if="nameOf(record)" class="line-clamp-2 text-xs text-ink-3" :title="nameOf(record)">{{ nameOf(record) }}</span>
            </span>
            <span v-else-if="column.key === 'kind'" class="flex flex-wrap gap-1" data-eec-ed-kind>
              <ZTag v-for="f in changeFlags(record.kind)" :key="f" size="sm" :tone="changeTone(f)" :data-flag="f">{{ t(`${P}.flagChange.${f}`) }}</ZTag>
            </span>
            <span v-else-if="column.key === 'before'" class="text-sm text-ink-2" data-eec-ed-before>{{ rateStateText(record.before, t) }}</span>
            <span v-else-if="column.key === 'after'" class="text-sm font-semibold text-ink" data-eec-ed-after>{{ rateStateText(record.after, t) }}</span>
            <span v-else-if="column.key === 'keden'" class="text-sm text-ink-2" data-eec-ed-keden>{{ record.kedenRate || record.after?.kedenRate || '—' }}</span>
          </template>
          <template #emptyText>
            <ZEmpty :title="codes.length ? t('broker.list.nothingFound') : t(`${P}.ed.noCodeChanges`)" />
          </template>
        </ZTable>
      </section>

      <!-- Изменения сносок (примечания) -->
      <section v-if="isNotes" class="flex flex-col gap-3" :aria-label="t(`${P}.ed.footnotesTitle`)">
        <h2 class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ t(`${P}.ed.footnotesTitle`) }}</h2>
        <ZTable
          :columns="footnoteColumns"
          :data-source="diff.footnotes"
          row-key="number"
          :scroll="{ x: footnotesWidth }"
          :aria-label="t(`${P}.ed.footnotesTitle`)"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
          data-eec-ed-footnotes
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'number'" class="font-mono text-sm font-semibold text-ink">{{ record.number }}</span>
            <ZTag v-else-if="column.key === 'kind'" size="sm" :tone="fnTone(record.kind)">{{ t(`${P}.fnChange.${record.kind}`) }}</ZTag>
            <span v-else-if="column.key === 'before'" class="block text-xs whitespace-pre-wrap text-ink-3 [overflow-wrap:anywhere]">{{ record.before || '—' }}</span>
            <span v-else-if="column.key === 'after'" class="block text-xs whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{{ record.after || '—' }}</span>
            <span v-else-if="column.key === 'codes'" class="text-sm tabular-nums text-ink-2">{{ num(record.codes) }}</span>
          </template>
          <template #emptyText><ZEmpty :title="t(`${P}.ed.noFootnoteChanges`)" /></template>
        </ZTable>
      </section>

      <!-- Списки кодов -->
      <section v-for="l in lists" :key="l.key" class="flex flex-col gap-2" :data-eec-ed-list="l.key">
        <h2 class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ t(`${P}.ed.list.${l.key}`, { n: num(l.items.length) }) }}</h2>
        <p class="m-0 text-xs text-ink-3">{{ t(`${P}.ed.listHint.${l.key}`) }}</p>
        <ul class="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-sm">
          <li v-for="c in listOf(l.key, l.items)" :key="c">
            <RouterLink v-if="l.codes" :to="treeTo(c)" class="font-mono text-zircon-ink underline-offset-2 hover:underline">{{ formatTnvedCode(c) }}</RouterLink>
            <span v-else class="font-mono text-ink">{{ c }}</span>
          </li>
        </ul>
        <ZButton
          v-if="l.items.length > LIST_LIMIT && !expanded.has(l.key)"
          variant="link"
          size="sm"
          class="w-fit max-sm:h-11"
          @click="expand(l.key)"
        >{{ t(`${P}.ed.showAll`, { n: num(l.items.length) }) }}</ZButton>
      </section>

      <!-- Флаги сносок -->
      <section v-if="flagEntries.length" class="flex flex-col gap-2" data-eec-ed-flags>
        <h2 class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ t(`${P}.ed.flagsTitle`) }}</h2>
        <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          <li v-for="[flag, numbers] in flagEntries" :key="flag" class="flex flex-wrap gap-x-2">
            <span class="font-mono text-xs leading-5 text-ink-3">{{ flag }}</span>
            <span class="text-ink [overflow-wrap:anywhere]">{{ numbers.join(', ') }}</span>
          </li>
        </ul>
      </section>

      <!-- Нераспознанные строки -->
      <section v-if="report.unparsed.length" class="flex flex-col gap-3" :aria-label="t(`${P}.ed.unparsedTitle`)" data-eec-ed-unparsed>
        <h2 class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ t(`${P}.ed.unparsedTitle`, { n: num(report.unparsed.length) }) }}</h2>
        <ZTable
          :columns="unparsedColumns"
          :data-source="report.unparsed"
          :row-key="(r: EecUnparsedLine, i: number) => `${r.page}-${i}`"
          :scroll="{ x: 720 }"
          :aria-label="t(`${P}.ed.unparsedTitle`, { n: report.unparsed.length })"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'reason'" class="text-sm text-ink-2" :title="record.reason">{{ unparsedLabel(record.reason, t) }}</span>
            <span v-else-if="column.key === 'text'" class="block font-mono text-xs whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{{ record.text }}</span>
          </template>
        </ZTable>
      </section>
    </template>

    <EecActionModal
      v-model:open="modalOpen"
      :title="modal === 'reject' ? t(`${P}.ed.rejectTitle`, { title }) : t(`${P}.ed.applyTitle`, { title })"
      :text="modal === 'reject' ? t(`${P}.ed.rejectText`) : t(`${P}.ed.applyText`)"
      :ok-text="modal === 'reject' ? t(`${P}.ed.reject`) : t(`${P}.ed.apply`)"
      :danger="modal === 'reject'"
      :note-label="modal === 'reject' ? t(`${P}.ed.rejectNote`) : t(`${P}.ed.applyNote`)"
      :save="save"
    />
  </div>
</template>
