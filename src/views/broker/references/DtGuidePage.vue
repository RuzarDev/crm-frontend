<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { referencesApi } from '@/api/references'
import type { DtGuideEntry } from '@/types/api'
import { sanitizeHtml } from '@/ui/sanitizeHtml'
import { useBlock } from '@/views/home/useBlock'
import { filterGuide, tidyGuideHtml } from '@/views/references/dtGuide'

// «Порядок заполнения ДТ» (редизайн, волна 5а, доска DtGuide): слева поиск и список граф, справа текст выбранной графы.
// — Поиск: по номеру (точное совпадение — первым) и названию; текст и разметка графы в поиске не участвуют.
// — Адрес: ?graph= открывает графу, выбор пишет ?graph= (replace). Нет такой графы — первая.
// — Фильтр скрыл открытую графу: она остаётся открытой, а в списке закреплена сверху и подсвечена.
// — До 768px список — выпадающий выбор над текстом. Текст графы — только очищенный HTML (sanitizeHtml).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const block = useBlock<DtGuideEntry[]>(true, async () => {
  const data = await referencesApi.getDtGuide()
  return Array.isArray(data) ? data : []
})
void block.load()
const entries = computed(() => block.data ?? [])

// ---- Поиск ----
const q = ref('')
const matches = computed(() => filterGuide(entries.value, q.value))

// ---- Выбранная графа и ?graph= ----
const selectedKey = ref('')
const current = computed(() => entries.value.find((e) => e.graph === selectedKey.value) ?? null)
const graphParam = () => (typeof route.query.graph === 'string' ? route.query.graph : '')
let ownReplaces = 0
const writeGraph = async (graph: string) => {
  if (route.query.graph === graph) return
  ownReplaces += 1
  try {
    await router.replace({ query: { ...route.query, graph } })
  } finally {
    ownReplaces -= 1
  }
}
const pick = (graph: string) => {
  selectedKey.value = graph
  void writeGraph(graph)
}
/** Графа из адреса, а без неё (или неизвестная) — первая: адрес исправляется. */
const syncFromRoute = () => {
  if (!entries.value.length) return
  const want = graphParam()
  const hit = entries.value.find((e) => e.graph === want)
  if (hit) selectedKey.value = hit.graph
  else pick(entries.value[0].graph)
}
watch(entries, syncFromRoute, { immediate: true })
watch(() => route.query.graph, () => { if (!ownReplaces) syncFromRoute() })

// В списке: подходящие, а открытая графа, если фильтр её скрыл, — закреплена сверху.
const pinned = computed(() => !!current.value && !matches.value.includes(current.value))
const listItems = computed(() => (pinned.value && current.value ? [current.value, ...matches.value] : matches.value))
const selectOptions = computed(() =>
  listItems.value.map((e) => ({ value: e.graph, label: `${t('broker.references.dtGuide.graphShort', { n: e.graph })} · ${e.title}` })))

// Открытая графа должна быть видна в длинном списке (адрес с ?graph=47).
const listEl = ref<HTMLElement | null>(null)
watch(selectedKey, async () => {
  await nextTick()
  const el = listEl.value?.querySelector<HTMLElement>('[aria-current="true"]')
  el?.scrollIntoView?.({ block: 'nearest' })
}, { flush: 'post' })

const bodyHtml = computed(() => tidyGuideHtml(sanitizeHtml(current.value?.html)))
const SKELETON = ['88%', '72%', '80%', '64%', '76%']
</script>

<template>
  <div class="flex flex-col gap-5" data-dtguide-page>
    <div>
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.references.dtGuide.title') }}</h1>
      <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.references.dtGuide.subtitle') }}</p>
    </div>

    <div v-if="block.error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-dtguide-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.references.dtGuide.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-dtguide-retry @click="block.load()">{{ t('broker.references.dtGuide.retry') }}</ZButton>
    </div>

    <div v-else class="grid items-start gap-4 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] md:gap-7" :aria-busy="block.loading || undefined">
      <!-- Слева: поиск и список граф (до 768px — поиск и выбор) -->
      <section class="flex min-w-0 flex-col gap-2.5 md:sticky md:top-4" :aria-label="t('broker.references.dtGuide.listLabel')">
        <ZInput
          v-model:value="q"
          type="search"
          allow-clear
          autocomplete="off"
          :placeholder="t('broker.references.dtGuide.search')"
          :aria-label="t('broker.references.dtGuide.searchLabel')"
          class="max-sm:h-11 max-sm:text-base"
          data-dtguide-search
        >
          <template #prefix><PhMagnifyingGlass :size="16" class="text-ink-3" aria-hidden="true" /></template>
        </ZInput>

        <ZSelect
          v-if="!block.loading && entries.length"
          :value="selectedKey"
          :options="selectOptions"
          :aria-label="t('broker.references.dtGuide.selectLabel')"
          class="md:hidden max-sm:*:h-11"
          data-dtguide-select
          @update:value="(v) => pick(String(v))"
        />

        <div v-if="block.loading" class="hidden flex-col gap-2 md:flex" data-dtguide-list-skeleton>
          <ZSkeleton v-for="i in 8" :key="i" height="16px" :width="i % 2 ? '86%' : '70%'" />
        </div>
        <template v-else>
          <p v-if="!entries.length" class="m-0 hidden text-sm text-ink-3 md:block" data-dtguide-empty>{{ t('broker.references.dtGuide.empty') }}</p>
          <nav v-else :aria-label="t('broker.references.dtGuide.listLabel')" class="hidden md:block">
            <ul ref="listEl" class="m-0 flex max-h-[calc(100dvh-260px)] min-h-40 list-none flex-col gap-px overflow-y-auto p-0 pr-1" data-dtguide-list>
              <li v-for="(e, i) in listItems" :key="e.graph">
                <button
                  type="button"
                  :aria-current="e.graph === selectedKey ? 'true' : undefined"
                  :data-guide-item="e.graph"
                  :data-pinned="pinned && i === 0 ? 'true' : undefined"
                  :class="[
                    'flex min-h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-row border-0 px-2.5 py-1.5 text-left text-[13px] leading-5 outline-hidden transition-colors duration-150 focus-visible:shadow-focus motion-reduce:transition-none',
                    e.graph === selectedKey ? 'bg-sunken font-semibold text-ink' : 'bg-transparent text-ink-2 hover:bg-canvas hover:text-ink',
                  ]"
                  @click="pick(e.graph)"
                >
                  <span class="w-7 shrink-0 font-mono tabular-nums" :class="e.graph === selectedKey ? 'text-ink-2' : 'text-muted'">{{ e.graph }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{{ e.title }}</span>
                    <span v-if="pinned && i === 0" class="block text-xs font-normal text-muted" data-dtguide-pinned>{{ t('broker.references.dtGuide.outsideFilter') }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </nav>
          <div v-if="entries.length && !matches.length" class="rounded-panel border border-dashed border-line-strong" data-dtguide-nothing>
            <ZEmpty :title="t('broker.references.dtGuide.nothing', { q: q.trim() })" :hint="t('broker.references.dtGuide.nothingHint')" />
          </div>
        </template>
      </section>

      <!-- Справа: текст графы -->
      <article class="min-w-0 rounded-panel border border-line bg-surface px-5 py-5 sm:px-7 sm:py-6" data-dtguide-text>
        <div v-if="block.loading" class="flex flex-col gap-3" aria-busy="true" data-dtguide-loading>
          <ZSkeleton width="120px" height="12px" />
          <ZSkeleton width="55%" height="24px" />
          <ZSkeleton v-for="(w, i) in SKELETON" :key="i" :width="w" height="14px" />
        </div>
        <template v-else-if="current">
          <div class="max-w-[720px]">
            <p class="m-0 text-xs font-medium tracking-wide text-muted uppercase" data-dtguide-kicker>{{ t('broker.references.dtGuide.graphTitle', { n: current.graph }) }}</p>
            <h2 class="m-0 mt-0.5 mb-3.5 text-[20px] leading-7 font-semibold text-ink" data-dtguide-title>{{ current.title }}</h2>
            <!-- eslint-disable-next-line vue/no-v-html -- очищено sanitizeHtml: белый список тегов, без скриптов и on* -->
            <div v-if="bodyHtml" class="dt-guide-html text-[14.5px] leading-[1.65] text-ink-2" data-dtguide-html v-html="bodyHtml" />
            <p v-else class="m-0 text-sm text-ink-3">{{ t('broker.references.dtGuide.textEmpty') }}</p>
            <p class="m-0 mt-4 rounded-row bg-tone-info-bg px-3.5 py-3 text-[13px] text-tone-info-fg">{{ t('broker.references.dtGuide.tip') }}</p>
          </div>
        </template>
        <p v-else class="m-0 py-10 text-center text-sm text-ink-3" data-dtguide-pick>{{ entries.length ? t('broker.references.dtGuide.pickHint') : t('broker.references.dtGuide.empty') }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* Разметка графы — из нормативного акта: абзацы, списки, таблицы. */
.dt-guide-html :deep(p) { margin: 0 0 12px; }
.dt-guide-html :deep(ul),
.dt-guide-html :deep(ol) { margin: 0 0 12px; padding-left: 22px; }
.dt-guide-html :deep(table) { border-collapse: collapse; width: 100%; margin: 0 0 12px; font-size: 13px; display: block; overflow-x: auto; }
.dt-guide-html :deep(td),
.dt-guide-html :deep(th) { border: 1px solid var(--color-line); padding: 4px 8px; vertical-align: top; }
.dt-guide-html :deep(a) { color: var(--color-zircon-ink); text-underline-offset: 2px; overflow-wrap: anywhere; }
.dt-guide-html { overflow-wrap: anywhere; }
</style>
