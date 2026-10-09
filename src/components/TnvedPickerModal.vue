<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import TnvedTree from '@/views/broker/references/tnved/TnvedTree.vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNodeDto, TnvedRateDto } from '@/types/api'
import { cleanName, formatTnvedCode, httpStatus, isRateLimited } from '@/views/references/tnvedShared'

// Окно выбора кода ТН ВЭД (редизайн, волна 5а) — общее для товаров ДТ (редактор товара, GoodsCodeSection), товаров записи
// транзита (GoodsCard) и калькулятора продаж. Контракт прежний: v-model:open, initialQuery;
// select({ code, name }) — только для 10-значного кода, после него окно закрывается.
// Слева — дерево (ленивое) или результаты поиска, справа — ставки и нетарифные меры выбранного кода.
// Полный 10-значный код в запросе сразу раскрывается в дереве; результат поиска открывается на своём месте
// в дереве (видно соседние коды и всю ветку). При каждом открытии поиск и выбор сбрасываются.
// Ширина — до 1040px, на телефоне — весь экран. Чтения tnved/* ограничены 60 в минуту: поиск — по Enter/кнопке,
// ставки — только у 10-значного кода.
const { t } = useI18n()

const props = defineProps<{ open: boolean; initialQuery?: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'select', payload: { code: string; name: string }): void
}>()

type LoadState = 'idle' | 'loading' | 'done' | 'error' | 'limit'
const failState = (e: unknown): LoadState => (isRateLimited(e) ? 'limit' : 'error')

// ---- Поиск ----
const query = ref('')
const results = shallowRef<TnvedNodeDto[]>([])
const searchState = ref<LoadState>('idle')
const mode = ref<'tree' | 'results'>('tree')
const hasSearch = computed(() => searchState.value !== 'idle')
// Дерево создаём при первом открытии окна (не грузим корень, пока окно не нужно).
const mounted = ref(false)
const treeRef = ref<InstanceType<typeof TnvedTree> | null>(null)

// Защита от устаревших ответов: ответ учитывается, только если после него не начали новый поиск
// (и не сбросили поиск); так же — данные кода (detailSeq).
let searchSeq = 0
const clearSearch = () => {
  searchSeq += 1
  results.value = []
  searchState.value = 'idle'
  mode.value = 'tree'
}

const doSearch = async () => {
  const q = query.value.trim()
  if (!q) { clearSearch(); return }
  const my = ++searchSeq
  // Полный 10-значный код — сразу раскрываем его в дереве.
  const digits = q.replace(/\s/g, '')
  if (/^\d{10}$/.test(digits)) {
    const n = await treeRef.value?.reveal(digits)
    if (my !== searchSeq) return
    if (n) {
      clearSearch()
      void pickNode(n)
      void treeRef.value?.scrollToSelected()
      return
    }
  }
  searchState.value = 'loading'
  mode.value = 'results'
  try {
    const found = (await tnvedApi.search(q, false, 40, { silent: true })).data
    if (my !== searchSeq) return
    results.value = found
    searchState.value = 'done'
  } catch (e) {
    if (my !== searchSeq) return
    results.value = []
    searchState.value = failState(e)
  }
}
// Крестик в поле (или стёрли всё) — обратно к дереву.
watch(query, (v) => { if (!v.trim()) clearSearch() })

const showTree = async () => {
  mode.value = 'tree'
  await nextTick()
  void treeRef.value?.scrollToSelected()
}
const onMode = (v: unknown) => {
  if (v === 'tree') void showTree()
  else mode.value = 'results'
}

// Результат поиска показываем на своём месте в дереве — видно соседние коды и всю ветку.
const openResult = async (n: TnvedNodeDto) => {
  void pickNode(n)
  mode.value = 'tree'
  await treeRef.value?.reveal(n.code)
}

// ---- Выбранный код: ставки и нетарифные меры ----
const selected = ref<TnvedNodeDto | null>(null)
const rates = shallowRef<TnvedRateDto[]>([])
const measures = shallowRef<{ docType?: string; name?: string; description?: string }[]>([])
const detailState = ref<LoadState>('idle')
let detailSeq = 0

// 404 — данных по коду нет (не ошибка): ставки/справка ещё не загружены синхронизацией.
const pickNode = async (n: TnvedNodeDto) => {
  const my = ++detailSeq
  selected.value = n
  rates.value = []
  measures.value = []
  detailState.value = 'idle'
  if (!n.is10) return
  detailState.value = 'loading'
  const [rateRes, refRes] = await Promise.allSettled([tnvedApi.rates(n.code, { silent: true }), tnvedApi.reference(n.code, { silent: true })])
  if (my !== detailSeq) return
  const failed = [rateRes, refRes].filter((x): x is PromiseRejectedResult => x.status === 'rejected' && httpStatus(x.reason) !== 404)
  if (rateRes.status === 'fulfilled') rates.value = Array.isArray(rateRes.value.data) ? rateRes.value.data : [rateRes.value.data].filter(Boolean)
  if (refRes.status === 'fulfilled') measures.value = refRes.value.data?.nonTariffMeasures ?? []
  detailState.value = failed.length ? failState(failed[0].reason) : 'done'
}
const retryDetail = () => { if (selected.value) void pickNode(selected.value) }

const choose = () => {
  if (!selected.value?.is10) return
  emit('select', { code: selected.value.code, name: selected.value.name || selected.value.treeName || '' })
  emit('update:open', false)
}

watch(() => props.open, (v) => {
  if (!v) return
  // Сброс и загрузка корня при открытии.
  query.value = ''
  clearSearch()
  detailSeq += 1
  selected.value = null
  rates.value = []
  measures.value = []
  detailState.value = 'idle'
  treeRef.value?.clearSelection()
  mounted.value = true
  // Начальный запрос (напр. неполный 6-значный код) — сразу ищем.
  const iq = (props.initialQuery || '').trim()
  if (iq) { query.value = iq; void nextTick(doSearch) }
}, { immediate: true }) // окно может смонтироваться уже открытым (GoodsCard: v-if и open в одном такте)

const modeOptions = computed(() => [
  { value: 'tree', label: t('broker.references.picker.tree') },
  { value: 'results', label: t('broker.references.picker.results'), count: searchState.value === 'done' ? results.value.length : undefined },
])
const detailName = computed(() => cleanName(selected.value?.name || selected.value?.treeName))
const sectionTitle = 'm-0 mb-1.5 mt-4 text-xs font-semibold tracking-[0.04em] text-ink-3 uppercase'
</script>

<template>
  <ZModal
    :open="open"
    :title="t('sales.spravochnikTnVedVybor')"
    :width="1040"
    class="max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:translate-x-0 max-sm:rounded-none"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <div class="flex flex-col gap-3 md:h-[min(540px,calc(76vh-152px))]">
      <ZInput
        v-model:value="query"
        type="search"
        allow-clear
        :enter-button="t('misc.nayti')"
        :placeholder="t('sales.poiskPoNaimenovaniyuIli')"
        :aria-label="t('broker.references.picker.searchLabel')"
        @search="doSearch"
      />

      <div class="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <!-- Слева: дерево или результаты поиска -->
        <section class="flex min-h-0 flex-col overflow-hidden rounded-panel border border-line max-md:h-[52vh]">
          <div class="flex min-h-11 flex-wrap items-center gap-2 border-b border-line px-2 py-1.5">
            <ZSegmented
              v-if="hasSearch"
              :value="mode"
              :options="modeOptions"
              @update:value="onMode"
            />
            <span class="flex-1" />
            <ZButton v-if="mode === 'tree'" variant="ghost" size="sm" class="max-sm:h-11" @click="treeRef?.collapseAll()">
              {{ t('sales.svernutVse') }}
            </ZButton>
          </div>

          <div v-if="mode === 'results'" data-picker-results class="min-h-0 flex-1 overflow-y-auto p-1">
            <div v-if="searchState === 'loading'" class="p-2"><ZSkeleton :lines="6" /></div>
            <p v-else-if="searchState === 'limit'" role="alert" class="m-0 px-3 py-4 text-sm text-ink-2">{{ t('broker.references.picker.limit') }}</p>
            <div v-else-if="searchState === 'error'" role="alert" class="flex flex-col items-start gap-2 px-3 py-4 text-sm text-ink-2">
              <span>{{ t('broker.references.picker.loadError') }}</span>
              <ZButton size="sm" @click="doSearch">{{ t('broker.references.picker.retry') }}</ZButton>
            </div>
            <p v-else-if="!results.length" class="m-0 px-3 py-4 text-sm text-ink-3">{{ t('sales.nichegoNeNaydeno') }}</p>
            <ul v-else class="m-0 list-none p-0">
              <li v-for="n in results" :key="n.id">
                <button
                  type="button"
                  data-picker-result
                  :class="[
                    'flex min-h-8 w-full cursor-pointer items-baseline gap-2.5 rounded-row border-0 bg-transparent px-2 py-1.5 text-left font-sans text-sm text-ink-2 outline-hidden max-sm:min-h-11',
                    'transition-colors duration-150 hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none',
                    selected?.id === n.id && 'bg-zircon-soft text-zircon-ink hover:bg-zircon-soft',
                  ]"
                  @click="openResult(n)"
                >
                  <span class="min-w-[104px] shrink-0 font-mono font-semibold whitespace-nowrap text-ink tabular-nums">{{ formatTnvedCode(n.code) }}</span>{{ ' ' }}<span class="min-w-0 flex-1">{{ cleanName(n.name || n.treeName) }}</span>
                </button>
              </li>
            </ul>
          </div>
          <TnvedTree v-if="mounted" v-show="mode === 'tree'" ref="treeRef" class="min-h-0 flex-1" @select="pickNode" />
        </section>

        <!-- Справа: выбранный код -->
        <section class="min-h-0 overflow-y-auto rounded-panel border border-line px-4 py-3.5">
          <p v-if="!selected" data-picker-detail-empty class="m-0 py-2 text-sm text-ink-3">{{ t('sales.vyberiteTovarPokazhuStavki') }}</p>
          <div v-else data-picker-detail aria-live="polite">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-lg font-semibold text-ink tabular-nums">{{ selected.code ? formatTnvedCode(selected.code) : '—' }}</span>
              <ZTag v-if="selected.is10" tone="info" size="sm">{{ t('broker.references.picker.digits10') }}</ZTag>
              <ZTag v-if="selected.unitShort" size="sm">{{ selected.unitShort }}</ZTag>
            </div>
            <p class="m-0 mt-1 text-sm text-ink-2">{{ detailName }}</p>

            <p v-if="!selected.is10" class="m-0 mt-3 rounded-row bg-sunken px-3 py-2.5 text-sm text-ink-2">{{ t('sales.gruppaRaskroyte') }}</p>
            <template v-else>
              <div v-if="detailState === 'loading'" class="mt-4"><ZSkeleton :lines="4" /></div>
              <div v-else-if="detailState === 'error' || detailState === 'limit'" role="alert" class="mt-4 flex flex-col items-start gap-2 text-sm text-ink-2">
                <span>{{ detailState === 'limit' ? t('broker.references.picker.limit') : t('broker.references.picker.loadError') }}</span>
                <ZButton size="sm" data-picker-retry @click="retryDetail">{{ t('broker.references.picker.retry') }}</ZButton>
              </div>
              <template v-else>
                <h3 :class="sectionTitle">{{ t('sales.stavkiToTt') }}</h3>
                <p v-if="!rates.length" class="m-0 text-sm text-ink-3">{{ t('sales.stavkiNeNaydeny') }}</p>
                <div v-for="r in rates" v-else :key="r.code" class="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <ZTag v-if="r.rateStr" tone="wait">{{ r.rateStr }}</ZTag>
                  <span v-else class="text-ink-3">—</span>
                  <ZTag v-if="r.vtoStatus" tone="submitted">{{ t('sales.vto', { s: r.vtoStatus }) }}</ZTag>
                </div>

                <h3 :class="sectionTitle">{{ t('sales.razreshitelnyeDokumentyNetarifnyeMery') }}</h3>
                <p v-if="!measures.length" class="m-0 text-sm text-ink-3">{{ t('sales.neTrebuyutsyaNetDannyh') }}</p>
                <ul v-else class="m-0 pl-[18px] text-sm text-ink-2">
                  <li v-for="(m, i) in measures" :key="i" class="my-0.5">{{ m.docType ? m.docType + ': ' : '' }}{{ m.name || m.description }}</li>
                </ul>
              </template>
            </template>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <ZButton variant="ghost" class="max-sm:h-11" @click="emit('update:open', false)">{{ t('common.cancel') }}</ZButton>
      <ZButton variant="primary" class="max-sm:h-11" :disabled="!selected?.is10" @click="choose">{{ t('sales.vybratEtotKod') }}</ZButton>
    </template>
  </ZModal>
</template>
