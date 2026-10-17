<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { KzList, KzListRow } from '@/api/nationalLists'
import { almatyToday } from '@/utils/customsRequests'
import { safeUrl } from '@/views/references/regulations'
import { loadKzLists } from './kzListsCache'
import { d, filterRows, P } from './national'

// Вкладки «Маркировка» и «МУЦ»: перечень из таблиц владельца (docs/sources/kz-lists-2026-10) — акт, редакция, источник,
// оговорки и позиции с поиском по коду или наименованию. Маркировка: с какой даты обязательна, «из …» — только часть
// кода, позиции под вопросом после Приказа № 253-ОД. МУЦ: раздел перечня; это база НДС при ввозе из ЕАЭС (форма 328),
// не ДТ, цены — на kgd.gov.kz. Позиций до трёхсот — показываем по 50, дальше «Показать ещё».
const props = defineProps<{ listKey: 'marking' | 'muc' }>()
const { t } = useI18n()
const tl = (key: string, p?: Record<string, unknown>) => t(`${P}.list.${key}`, p ?? {})

const state = ref<'loading' | 'ready' | 'error'>('loading')
const list = ref<KzList | null>(null)
const load = async () => {
  state.value = 'loading'
  try {
    list.value = (await loadKzLists()).find((l) => l.key === props.listKey) ?? null
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const query = ref('')
const PAGE = 50
const limit = ref(PAGE)
watch(query, () => { limit.value = PAGE })
const found = computed(() => filterRows(list.value?.rows ?? [], query.value))
const shown = computed(() => found.value.slice(0, limit.value))

const today = almatyToday()
const required = (r: KzListRow) => !!r.startDate && r.startDate <= today
const sectionShort = (s: string | null) => (s?.includes('не производимые') ? tl('sectionNotMade') : tl('sectionMade'))
const hostOf = (u: string) => { try { return new URL(u).hostname } catch { return u } }
const link = 'rounded-field font-medium text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" :data-kz-list="listKey">
    <div v-if="state === 'error'" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-kz-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ tl('loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-kz-retry @click="load">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" class="rounded-panel border border-line bg-surface p-5"><ZSkeleton :lines="6" height="18px" /></div>
    <template v-else-if="list">
      <section class="flex flex-col gap-1.5 rounded-panel border border-line bg-surface px-4 py-3.5 sm:px-5" data-kz-act>
        <p class="m-0 text-[13px] leading-5 [overflow-wrap:anywhere]">
          <a :href="safeUrl(list.actUrl) ?? undefined" target="_blank" rel="noopener noreferrer" :class="link">
            {{ t(`${P}.act`, { name: list.actName, number: list.actNumber, date: d(list.actDate) }) }}<PhArrowSquareOut :size="13" class="ml-1 inline-block align-[-2px]" aria-hidden="true" /><span class="sr-only"> ({{ t(`${P}.opensInNewTab`) }})</span>
          </a>
        </p>
        <p class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]">{{ list.actTitle }}</p>
        <p class="m-0 text-xs text-muted">
          {{ tl('edition', { date: d(list.editionDate), from: d(list.effectiveFrom), n: list.rows.length }) }}
          <template v-if="list.amendments.length"> · {{ tl('amendments', { list: list.amendments.map((a) => `№ ${a.number} (${d(a.date)})`).join(', ') }) }}</template>
        </p>
        <p class="m-0 text-xs text-muted [overflow-wrap:anywhere]">
          {{ tl('source') }} <a :href="safeUrl(list.sourceUrl) ?? undefined" target="_blank" rel="noopener noreferrer" :class="link">{{ hostOf(list.sourceUrl) }}<span class="sr-only"> ({{ t(`${P}.opensInNewTab`) }})</span></a>
        </p>
        <p :class="['m-0 text-[13px] leading-5', listKey === 'muc' ? 'font-medium text-ink' : 'text-ink-2']" data-kz-note>{{ tl(`note.${listKey}`) }}</p>
      </section>

      <ZInput v-model:value="query" allow-clear :placeholder="tl('search')" :aria-label="tl('search')" class="max-w-[28rem] max-sm:h-11" data-kz-search>
        <template #prefix><PhMagnifyingGlass :size="15" aria-hidden="true" /></template>
      </ZInput>
      <p v-if="!found.length" class="m-0 text-sm text-muted" data-kz-empty>{{ tl('notFound') }}</p>

      <ul v-else role="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="r in shown"
          :key="r.number"
          :class="['min-w-0 rounded-row border px-3.5 py-2.5', r.excluded ? 'border-dashed border-line bg-sunken' : 'border-line bg-surface']"
          :data-kz-row="r.number"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-xs text-muted tabular-nums">{{ tl('position', { n: r.number }) }}</span>
            <span class="font-mono text-[13px] text-ink">{{ r.codeText }}</span>
            <ZTag v-if="r.excluded" tone="neutral" size="sm" data-kz-excluded>{{ tl('excluded') }}</ZTag>
            <template v-else-if="listKey === 'marking' && r.startDate">
              <ZTag :tone="required(r) ? 'danger' : 'wait'" size="sm" data-kz-start>{{ tl(required(r) ? 'requiredSince' : 'from', { date: d(r.startDate) }) }}</ZTag>
            </template>
            <ZTag v-if="r.partial" tone="info" size="sm" data-kz-partial>{{ tl('partial') }}</ZTag>
            <ZTag v-if="r.section" tone="neutral" size="sm" data-kz-section>{{ sectionShort(r.section) }}</ZTag>
          </div>
          <p class="m-0 mt-1 text-sm leading-5 text-ink [overflow-wrap:anywhere]">{{ r.name }}</p>
          <p v-if="r.excluded" class="m-0 mt-1 text-xs leading-5 text-ink-3 [overflow-wrap:anywhere]" data-kz-excluded-note>{{ r.excluded }}</p>
          <p v-if="r.check" class="m-0 mt-1 text-xs leading-5 text-gold-ink [overflow-wrap:anywhere]" data-kz-check>{{ tl('check') }} {{ r.check }}</p>
          <details v-if="r.condition" class="mt-1 text-xs leading-5 text-ink-2">
            <summary class="cursor-pointer text-ink-3 select-none">{{ tl('condition') }}</summary>
            <p class="m-0 mt-1 [overflow-wrap:anywhere]">{{ r.condition }}</p>
          </details>
        </li>
      </ul>
      <ZButton v-if="found.length > shown.length" class="self-start max-sm:h-11 max-sm:w-full" data-kz-more @click="limit += PAGE">
        {{ tl('more', { n: found.length - shown.length }) }}
      </ZButton>
    </template>
  </div>
</template>
