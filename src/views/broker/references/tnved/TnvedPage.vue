<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhSparkle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import TnvedTree from './TnvedTree.vue'
import TnvedSearchList from './TnvedSearchList.vue'
import TnvedCodeCard from './TnvedCodeCard.vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedNodeDto } from '@/types/api'
import {
  codeDigits, formatTnvedCode, hitFromMatch, hitFromNode, httpStatus, isCodeLike, isRateLimited, MIN_QUERY, type TnvedHit,
} from '@/views/references/tnvedShared'
import { createCodeCache, type TabKey } from './tnvedRules'

// «ТН ВЭД» сотрудника (редизайн, волна 5а, доска Tnved): слева поиск и дерево, справа карточка кода с вкладками.
// — Поиск: «Код, название или описание товара» с паузой 400 мс; «Подобрать по описанию» — тот же поле, подбор
//   (tnvedApi.classify) списком с вероятностью; «Только 10-значные» — для поиска. «Дерево / Поиск · n» — что слева.
// — Карточка: см. TnvedCodeCard (вкладки грузятся по открытию, кэш на экран).
// — Адрес: ?code= открывает код (дерево раскрывается до него), выбор кода пишет ?code= (replace).
// — Устаревшие ответы (быстрые клики, ввод) не перебивают новые: счётчики openSeq / searchSeq.
// Чтения tnved/* — 60 в минуту, подбор — 20: на 429 — «Слишком много запросов, подождите минуту» на месте, без тоста.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const DEBOUNCE_MS = 400
const cache = createCodeCache()
const treeRef = ref<InstanceType<typeof TnvedTree> | null>(null)

// ---- Поиск и подбор ----
type SearchState = 'idle' | 'loading' | 'done' | 'error' | 'limit'
const q = ref('')
const leafOnly = ref(false)
const mode = ref<'tree' | 'search'>('tree')
const hits = shallowRef<TnvedHit[]>([])
const searchState = ref<SearchState>('idle')
const source = ref<'search' | 'classify'>('search')
// Узлы из поиска: карточку можно показать сразу, не дожидаясь раскрытия дерева.
const nodesByCode = new Map<string, TnvedNodeDto>()
let searchSeq = 0
let timer: ReturnType<typeof setTimeout> | undefined

const failState = (e: unknown): SearchState => (isRateLimited(e) ? 'limit' : 'error')
const clearSearch = () => {
  clearTimeout(timer)
  searchSeq += 1
  hits.value = []
  searchState.value = 'idle'
  void showTree()
}

const runSearch = async () => {
  clearTimeout(timer)
  const term = q.value.trim()
  if (term.length < MIN_QUERY) { clearSearch(); return }
  const my = ++searchSeq
  source.value = 'search'
  searchState.value = 'loading'
  mode.value = 'search'
  try {
    const { data } = await tnvedApi.search(isCodeLike(term) ? codeDigits(term) : term, leafOnly.value, 30, { silent: true })
    if (my !== searchSeq) return
    for (const n of data) nodesByCode.set(n.code, n)
    hits.value = data.map(hitFromNode)
    searchState.value = 'done'
  } catch (e) {
    if (my !== searchSeq) return
    searchState.value = failState(e)
  }
}

const runClassify = async () => {
  clearTimeout(timer)
  const term = q.value.trim()
  if (term.length < MIN_QUERY) return
  const my = ++searchSeq
  source.value = 'classify'
  hits.value = []
  searchState.value = 'loading'
  mode.value = 'search'
  try {
    const { data } = await tnvedApi.classify(term, 10, { silent: true })
    if (my !== searchSeq) return
    hits.value = (data.matches ?? []).map(hitFromMatch)
    searchState.value = 'done'
  } catch (e) {
    if (my !== searchSeq) return
    searchState.value = failState(e)
  }
}
const retrySearch = () => (source.value === 'classify' ? runClassify() : runSearch())

// Ввод — поиск после паузы; поле уже другое — поздний ответ на прежний запрос не учитывается.
watch(q, (v) => {
  clearTimeout(timer)
  searchSeq += 1
  if (v.trim().length < MIN_QUERY) { clearSearch(); return }
  timer = setTimeout(() => { void runSearch() }, DEBOUNCE_MS)
}, { flush: 'sync' })
watch(leafOnly, () => { if (source.value === 'search' && q.value.trim().length >= MIN_QUERY) void runSearch() })
onBeforeUnmount(() => clearTimeout(timer))

const hasQuery = computed(() => q.value.trim().length >= MIN_QUERY)
const modeOptions = computed(() => [
  { value: 'tree', label: t('broker.references.tnved.modeTree') },
  {
    value: 'search',
    label: t('broker.references.tnved.modeSearch'),
    count: searchState.value === 'done' ? hits.value.length : undefined,
    disabled: searchState.value === 'idle',
  },
])
async function showTree() {
  mode.value = 'tree'
  await nextTick()
  void treeRef.value?.scrollToSelected()
}
const onMode = (v: unknown) => {
  if (v === 'tree') void showTree()
  else if (searchState.value !== 'idle') mode.value = 'search'
}
const statusText = computed(() => {
  if (searchState.value === 'done') return t('broker.references.tnved.found', { n: hits.value.length })
  if (searchState.value === 'limit') return t('broker.references.tnved.limit')
  if (searchState.value === 'error') return t('broker.references.tnved.loadError')
  return ''
})

// ---- Выбранный код ----
type CardState = 'idle' | 'loading' | 'ready' | 'notFound' | 'error' | 'limit'
const selected = shallowRef<TnvedNodeDto | null>(null)
const path = shallowRef<TnvedNodeDto[]>([])
const cardState = ref<CardState>('idle')
const pendingCode = ref('')
const tab = ref<TabKey>('rates')
let openSeq = 0

const show = (n: TnvedNodeDto) => {
  selected.value = n
  const p = treeRef.value?.pathOf(n.id) ?? []
  path.value = p.length && p[p.length - 1].id === n.id ? p.slice(0, -1) : []
  cardState.value = 'ready'
}

// ?code= — replace (как у клиента): «Назад» уводит с экрана, а не листает коды. Свои переходы не открывают код повторно.
let ownReplaces = 0
const writeCode = async (code: string) => {
  if (!code || route.query.code === code) return
  ownReplaces += 1
  try {
    await router.replace({ query: { ...route.query, code } })
  } finally {
    ownReplaces -= 1
  }
}
const normalize = (raw: string) => (isCodeLike(raw) ? codeDigits(raw) : raw.trim())

/** Открыть код: карточка (сразу, если узел известен), дерево раскрывается до него. Нет в дереве — спросить сервер. */
const openCode = async (raw: string, known?: TnvedNodeDto) => {
  const code = normalize(raw)
  if (!code) return
  const my = ++openSeq
  pendingCode.value = code
  if (known) show(known)
  else cardState.value = 'loading'
  void writeCode(code)
  const n = await treeRef.value?.reveal(code) ?? null
  if (my !== openSeq) return
  if (n) { show(n); return }
  if (known) return
  try {
    const { data } = await tnvedApi.node(code, { silent: true })
    if (my !== openSeq) return
    show(data)
  } catch (e) {
    if (my !== openSeq) return
    cardState.value = httpStatus(e) === 404 ? 'notFound' : failState(e) === 'limit' ? 'limit' : 'error'
  }
}

// Телефон и узкий экран (одна колонка, от lg — две): карточка лежит под деревом — после выбора кода показываем её,
// а не оставляем за краем. В две колонки карточка рядом с деревом, ничего не листаем. Уже стоит у верхнего края — не трогаем.
const TWO_COLUMNS = '(min-width: 1024px)'
const cardWrap = ref<HTMLElement | null>(null)
const revealCard = async () => {
  await nextTick()
  const el = cardWrap.value
  if (!el || typeof el.getBoundingClientRect !== 'function') return
  if (typeof window.matchMedia === 'function' && window.matchMedia(TWO_COLUMNS).matches) return
  if (Math.abs(el.getBoundingClientRect().top) < 16) return
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

const onTreeSelect = (n: TnvedNodeDto) => {
  openSeq += 1
  show(n)
  void writeCode(n.code)
  void revealCard()
}
const onHit = (h: TnvedHit) => {
  void openCode(h.code, nodesByCode.get(h.code))
  void revealCard()
}
const onOpenNode = async (n: TnvedNodeDto) => {
  const my = ++openSeq
  show(n)
  void writeCode(n.code)
  await treeRef.value?.selectLoaded(n.id)
  if (my === openSeq) show(n)
}
const retryCard = () => { void openCode(pendingCode.value) }

const codeParam = () => (typeof route.query.code === 'string' ? route.query.code : '')
watch(() => route.query.code, () => {
  if (ownReplaces) return
  const c = codeParam()
  if (c && normalize(c) !== selected.value?.code) void openCode(c)
})
// Дерево нужно смонтированным: код из адреса раскрывается в нём.
onMounted(() => { if (codeParam()) void openCode(codeParam()) })

const notFoundHint = computed(() => t('broker.references.tnved.notFoundHint', { code: formatTnvedCode(pendingCode.value) }))
</script>

<template>
  <div class="flex flex-col gap-5" data-tnved-page>
    <div>
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.references.tnved.title') }}</h1>
      <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.references.tnved.subtitle') }}</p>
    </div>

    <div class="grid items-start gap-[18px] lg:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
      <!-- Слева: поиск, подбор, дерево -->
      <section
        :aria-label="t('broker.references.tnved.searchLabel')"
        class="flex h-[min(64vh,560px)] min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-surface lg:sticky lg:top-4 lg:h-[calc(100dvh-200px)] lg:min-h-[480px]"
        data-tnved-left
      >
        <div class="flex flex-col gap-2.5 border-b border-line p-3">
          <ZInput
            v-model:value="q"
            type="search"
            allow-clear
            autocomplete="off"
            enterkeyhint="search"
            :placeholder="t('broker.references.tnved.search')"
            :aria-label="t('broker.references.tnved.searchLabel')"
            class="max-sm:h-11"
            data-tnved-search
            @search="runSearch"
          >
            <template #prefix><PhMagnifyingGlass :size="16" class="text-ink-3" aria-hidden="true" /></template>
          </ZInput>
          <p class="sr-only" role="status">{{ statusText }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <ZSegmented :value="mode" :options="modeOptions" :aria-label="t('broker.references.tnved.modeLabel')" data-tnved-mode @update:value="onMode" />
            <ZButton
              variant="ghost"
              size="sm"
              class="ml-auto text-zircon-ink max-sm:h-11"
              :disabled="!hasQuery"
              :title="hasQuery ? undefined : t('broker.references.tnved.classifyNeedText')"
              data-tnved-classify
              @click="runClassify"
            >
              <template #icon><PhSparkle :size="15" aria-hidden="true" /></template>
              {{ t('broker.references.tnved.classify') }}
            </ZButton>
          </div>
          <div v-if="mode === 'tree' || source === 'search'" class="flex min-h-7 flex-wrap items-center gap-2">
            <ZSwitch
              v-if="mode === 'search'"
              v-model:checked="leafOnly"
              size="sm"
              class="max-sm:min-h-11"
              data-tnved-leaf-only
            >{{ t('broker.references.tnved.leafOnly') }}</ZSwitch>
            <ZButton
              v-if="mode === 'tree'"
              variant="ghost"
              size="sm"
              class="max-sm:h-11"
              data-tnved-collapse
              @click="treeRef?.collapseAll()"
            >{{ t('broker.references.tnved.collapseAll') }}</ZButton>
          </div>
        </div>

        <TnvedSearchList
          v-if="mode === 'search' && searchState !== 'idle'"
          :hits="hits"
          :state="searchState"
          :source="source"
          :selected-code="cardState === 'ready' ? selected?.code : null"
          class="min-h-0 flex-1 overflow-y-auto"
          @open="onHit"
          @retry="retrySearch"
        />
        <TnvedTree v-show="mode === 'tree'" ref="treeRef" class="min-h-0 flex-1 p-1" @select="onTreeSelect" />
      </section>

      <!-- Справа: карточка кода -->
      <div ref="cardWrap" class="min-w-0 scroll-mt-4" data-tnved-right>
        <!-- Карточка остаётся смонтированной (только скрыта), пока открывается другой код или он не найден:
             поля калькулятора (стоимость, валюта, количество…) переживают смену кода, как при клике в дереве. -->
        <TnvedCodeCard
          v-if="selected"
          v-show="cardState === 'ready'"
          v-model:tab="tab"
          :node="selected"
          :path="path"
          :cache="cache"
          @open-node="onOpenNode"
          @open-code="(c: string) => openCode(c)"
        />
        <div v-if="cardState === 'loading'" class="flex flex-col gap-3 rounded-panel border border-line bg-surface px-5 py-[18px]" aria-busy="true" data-card-loading>
          <ZSkeleton width="180px" height="24px" />
          <ZSkeleton width="70%" height="14px" />
          <ZSkeleton :lines="4" class="mt-3" />
        </div>
        <div v-else-if="cardState === 'notFound'" class="rounded-panel border border-dashed border-line-strong px-6 py-8 text-center" data-card-not-found>
          <p class="m-0 text-base font-semibold text-ink">{{ t('broker.references.tnved.notFound') }}</p>
          <p class="m-0 mt-1 text-sm text-ink-3 text-pretty">{{ notFoundHint }}</p>
        </div>
        <div v-else-if="cardState === 'error' || cardState === 'limit'" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-card-error>
          <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ cardState === 'limit' ? t('broker.references.tnved.limit') : t('broker.references.tnved.loadError') }}</p>
          <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-card-retry @click="retryCard">{{ t('broker.references.tnved.retry') }}</ZButton>
        </div>
        <div v-else-if="!selected" class="flex min-h-40 items-center justify-center rounded-panel border border-dashed border-line-strong px-6 py-8 text-center" data-card-empty>
          <p class="m-0 max-w-[320px] text-sm text-ink-3 text-pretty">{{ t('broker.references.tnved.pick') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
