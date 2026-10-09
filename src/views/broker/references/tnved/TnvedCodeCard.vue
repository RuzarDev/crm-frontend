<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretRight, PhCopy } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTabs, { type ZTabItem } from '@/components/z/ZTabs.vue'
import ZTag from '@/components/z/ZTag.vue'
import TnvedCalculator from '@/views/client/tnved/TnvedCalculator.vue'
import TnvedRatesTab from './TnvedRatesTab.vue'
import TnvedNotesTab from './TnvedNotesTab.vue'
import TnvedMeasuresTab from './TnvedMeasuresTab.vue'
import TnvedExportTab from './TnvedExportTab.vue'
import type { TnvedNodeDto } from '@/types/api'
import { message } from '@/ui/message'
import { cleanName, formatTnvedCode } from '@/views/references/tnvedShared'
import { hasRates, nextTab, tabEnabled, TABS, type CodeCache, type CodeData, type DataKind, type Loaded, type TabKey } from './tnvedRules'

// Карточка кода ТН ВЭД (доска Tnved, справа): код крупно, теги, название, путь в дереве (кликабельный),
// предупреждение об устаревшем коде, «Скопировать код» и вкладки. Данные вкладки грузятся, когда её открыли
// (кэш общий на экран: повторный выбор кода — без запросов). Ответ по прежнему коду не попадает в карточку нового.
const props = defineProps<{
  node: TnvedNodeDto
  /** Предки кода от раздела (без него самого); пусто — путь неизвестен (код открыт не из дерева). */
  path: TnvedNodeDto[]
  cache: CodeCache
}>()
const emit = defineEmits<{ 'open-node': [n: TnvedNodeDto]; 'open-code': [code: string] }>()
const tab = defineModel<TabKey>('tab', { required: true })
const { t } = useI18n()

// ---- Данные вкладок текущего кода ----
const states = reactive<{ [K in DataKind]?: Loaded<CodeData[K]> }>({})
const TAB_DATA: Partial<Record<TabKey, DataKind>> = { rates: 'rates', notes: 'notes', measures: 'measures', export: 'export' }
const needs = (kind: DataKind, n: TnvedNodeDto): boolean => {
  if (kind === 'rates' || kind === 'transition') return hasRates(n)
  if (kind === 'notes') return !!n.code
  return n.is10
}
// Типизированная запись состояния вкладки (TS не сводит индексацию по обобщённому ключу — одно приведение здесь).
const setState = <K extends DataKind>(kind: K, v: Loaded<CodeData[K]>) => {
  (states as Record<DataKind, unknown>)[kind] = v
}
let seq = 0
const ensure = async <K extends DataKind>(kind: K) => {
  const n = props.node
  if (!needs(kind, n)) return
  const hit = props.cache.peek(kind, n.code)
  if (hit) {
    setState(kind, hit)
    return
  }
  if (states[kind]?.status === 'loading') return
  const my = seq
  setState(kind, { status: 'loading', data: null })
  const r = await props.cache.load(kind, n.code)
  if (my !== seq) return
  setState(kind, r)
}
const retry = (kind: DataKind) => {
  delete states[kind]
  void ensure(kind)
}

// Калькулятор создаём при первом открытии вкладки и дальше не пересоздаём: поля (стоимость, валюта…)
// остаются при переходах между вкладками и кодами.
const calcMounted = ref(false)
const openTab = (k: TabKey) => {
  if (k === 'calc') {
    calcMounted.value = true
    // По ставке калькулятор решает, нужен ли объём двигателя (ставка в см³) — до первого расчёта.
    // Вкладка остаётся открытой при смене кода, поэтому ставки грузим и здесь (один запрос, из кэша).
    void ensure('rates')
  }
  const kind = TAB_DATA[k]
  if (kind) void ensure(kind)
}

watch(() => props.node, (n) => {
  seq += 1
  for (const k of Object.keys(states) as DataKind[]) delete states[k]
  const next = nextTab(tab.value, n)
  if (next !== tab.value) tab.value = next
  void ensure('transition')
  openTab(tab.value)
}, { immediate: true })
watch(tab, openTab)

// ---- Шапка ----
const name = computed(() => cleanName(props.node.name || props.node.treeName))
const shownCode = computed(() => (props.node.code ? formatTnvedCode(props.node.code) : '—'))
const transition = computed(() => (states.transition?.status === 'done' ? states.transition.data : null))
const deprecated = computed(() => !!transition.value?.isDeprecated)
const deprecatedText = computed(() => {
  const tr = transition.value
  if (!tr) return ''
  const code = formatTnvedCode(tr.oldCode || props.node.code)
  return tr.sourceVersion
    ? t('broker.references.tnved.card.deprecatedSince', { code, version: tr.sourceVersion })
    : t('broker.references.tnved.card.deprecated', { code })
})

const copy = async () => {
  const shown = formatTnvedCode(props.node.code)
  try {
    await navigator.clipboard.writeText(props.node.code)
    message.success(t('broker.references.tnved.card.copied', { code: shown }))
  } catch {
    message.error(t('broker.references.tnved.card.copyFailed'))
  }
}

// ---- Вкладки ----
// Счётчик — когда справка по коду уже есть (открывали вкладку сейчас или раньше — из кэша, без запроса).
const measuresCount = computed(() => {
  const m = states.measures ?? props.cache.peek('measures', props.node.code)
  return m?.status === 'done' && m.data?.success ? m.data.nonTariffMeasures?.length ?? 0 : undefined
})
const tabItems = computed<ZTabItem[]>(() => TABS.map((k) => ({
  key: k,
  label: t(`broker.references.tnved.tabs.${k}`),
  count: k === 'measures' ? measuresCount.value : undefined,
  disabled: !tabEnabled(k, props.node),
})))
const tabLabel = computed(() => t(`broker.references.tnved.tabs.${tab.value}`))
// Ставка — из «Ставок» (обычно открыты первыми): по ней калькулятор решает, нужен ли объём двигателя.
const rateText = computed(() => states.rates?.data?.rateStr ?? props.cache.peek('rates', props.node.code)?.data?.rateStr ?? null)

const crumbBase = 'inline-flex min-h-7 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 text-[12.5px] text-muted outline-hidden transition-colors duration-150 hover:text-zircon-ink focus-visible:shadow-focus motion-reduce:transition-none max-sm:min-h-11'
// Код — моноширинный; группа без кода («– транспортные средства только с…») — один усечённый ряд обычным шрифтом, полный текст в title.
const crumbCode = `${crumbBase} font-mono tabular-nums`
const crumbText = `${crumbBase} max-w-[12rem] min-w-0 font-sans max-sm:max-w-[9rem]`
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-3.5 rounded-panel border border-line bg-surface px-5 py-[18px] max-sm:px-4"
    aria-labelledby="tnved-card-code"
    :data-tnved-card="node.code"
  >
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-[1_1_16rem]">
        <div class="flex flex-wrap items-center gap-2.5">
          <h2 id="tnved-card-code" class="m-0 font-mono text-xl leading-7 font-semibold tabular-nums text-ink" data-card-code>{{ shownCode }}</h2>
          <ZTag v-if="node.is10" tone="info" size="sm">{{ t('broker.references.tnved.card.digits10') }}</ZTag>
          <ZTag v-if="node.unitShort" size="sm">{{ node.unitShort }}</ZTag>
        </div>
        <p class="m-0 mt-1.5 text-sm text-ink-2 text-pretty" data-card-name>{{ name }}</p>
        <nav v-if="path.length" :aria-label="t('broker.references.tnved.card.path')" class="mt-1">
          <ol class="m-0 flex list-none flex-wrap items-center gap-x-0.5 p-0">
            <li v-for="(p, i) in path" :key="p.id" class="inline-flex items-center gap-0.5">
              <PhCaretRight v-if="i > 0" :size="11" class="text-muted" aria-hidden="true" />
              <button
                v-if="p.code"
                type="button"
                :class="crumbCode"
                :title="cleanName(p.name || p.treeName)"
                :data-card-crumb="p.code"
                @click="emit('open-node', p)"
              >{{ formatTnvedCode(p.code) }}</button>
              <button
                v-else
                type="button"
                :class="crumbText"
                :title="cleanName(p.name || p.treeName)"
                data-card-crumb-text
                @click="emit('open-node', p)"
              ><span class="truncate">{{ cleanName(p.treeName || p.name) }}</span></button>
            </li>
          </ol>
        </nav>
      </div>
      <ZButton v-if="node.code" variant="secondary" class="max-sm:h-11 max-sm:w-full" data-card-copy @click="copy">
        <template #icon><PhCopy :size="16" aria-hidden="true" /></template>
        {{ t('broker.references.tnved.card.copy') }}
      </ZButton>
    </div>

    <ZAlert v-if="deprecated" type="warning" show-icon :message="deprecatedText" data-card-deprecated>
      <template v-if="transition?.newCodes?.length" #default>
        <span class="mr-1">{{ t('broker.references.tnved.card.replacements') }}</span>
        <span class="inline-flex flex-wrap gap-1.5 align-middle">
          <button
            v-for="c in transition.newCodes"
            :key="c"
            type="button"
            class="inline-flex h-6 cursor-pointer items-center rounded-pill border border-gold-line bg-surface px-2 font-mono text-xs tabular-nums text-gold-ink outline-hidden hover:bg-gold-soft focus-visible:shadow-focus max-sm:h-11 max-sm:px-3"
            :data-card-replacement="c"
            @click="emit('open-code', c)"
          >{{ formatTnvedCode(c) }}</button>
        </span>
      </template>
    </ZAlert>

    <div class="overflow-x-clip">
      <ZTabs v-model:active-key="tab" variant="line" :items="tabItems" :aria-label="t('broker.references.tnved.card.tabsLabel')" data-card-tabs />
    </div>

    <div role="tabpanel" :aria-label="tabLabel" class="min-w-0" :data-tab-panel="tab">
      <TnvedRatesTab v-if="tab === 'rates'" :node="node" :state="states.rates" @retry="retry('rates')" />
      <TnvedNotesTab v-else-if="tab === 'notes'" :state="states.notes" @retry="retry('notes')" />
      <TnvedMeasuresTab v-else-if="tab === 'measures'" :state="states.measures" @retry="retry('measures')" />
      <TnvedExportTab v-else-if="tab === 'export'" :state="states.export" @retry="retry('export')" />
      <TnvedCalculator
        v-if="calcMounted"
        v-show="tab === 'calc'"
        :code="node.code"
        :rate-text="rateText"
        :unit="node.unitShort"
        extended
      />
    </div>
  </section>
</template>
