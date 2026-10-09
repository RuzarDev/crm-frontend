<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import TnvedCalculator from '@/views/client/tnved/TnvedCalculator.vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedCalculateResult, TnvedRateDto } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { formatMoneyIn } from '@/ui/number'
import { cn } from '@/ui/cn'
import {
  cleanName, codeDigits, formatTnvedCode, hitFromMatch, hitFromNode, httpStatus, isCodeLike, isRateLimited, MIN_QUERY, VAT_RATE,
  type TnvedHit,
} from '@/views/client/tnved/tnved'

// «Подбор кода ТН ВЭД» клиента (редизайн, волна 2b, доска Tools): одно поле — описание товара или код;
// слева подходящие коды, справа карточка выбранного: ставки и калькулятор платежей.
// Запрос и выбранный код живут в адресе (?q=, ?code=) — ссылку можно переслать; переходы — replace,
// чтобы «Назад» уводил с экрана, а не листал буквы и коды.
const { t, locale } = useI18n()
// Суммы — по языку интерфейса, как в строках калькулятора.
const formatMoney = (n: number) => formatMoneyIn(locale.value, n)
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canShip = computed(() => auth.clientHasModule('import40'))

const DEBOUNCE_MS = 400
// Примеры — данные поиска (классификатор ТН ВЭД русскоязычный): в словарях всех языков — по-русски.
// Подобраны так, чтобы поиск по ним что-то находил.
const EXAMPLE_KEYS = ['goods', 'pump', 'code'] as const
const examples = computed(() => EXAMPLE_KEYS.map((k) => t(`client.tnved.start.examples.${k}`)))

// ---- Поиск (?q=, replace; свои переходы не откатывают поле — как в «Моих поставках») ----
const queryQ = () => (typeof route.query.q === 'string' ? route.query.q : '')
const q = ref(queryQ())
let ownReplaces = 0
watch(() => route.query.q, () => {
  if (ownReplaces) return
  const v = queryQ()
  if (v !== q.value) q.value = v
})
const replaceQuery = async (patch: Record<string, string | undefined>) => {
  ownReplaces += 1
  try {
    await router.replace({ query: { ...route.query, ...patch } })
  } finally {
    ownReplaces -= 1
  }
}
const onSearch = (v: string) => {
  q.value = v
  void replaceQuery({ q: v.trim() ? v : undefined })
}

// ---- Выбранный код (?code=) ----
const code = computed(() => (typeof route.query.code === 'string' ? codeDigits(route.query.code) : ''))
const codeTo = (c: string) => ({ query: { ...route.query, code: c } })

// Что уже знаем о кодах из выдачи: название и ставка остаются, когда выдача сменилась, а код выбран.
const known = reactive<Record<string, { name: string; rateStr: string | null }>>({})
const remember = (c: string, name: string, rateStr: string | null) => {
  // Название из выдачи полнее короткого названия ветки из ставок — первое не перетираем.
  const prev = known[c]
  known[c] = { name: prev?.name || cleanName(name), rateStr: rateStr ?? prev?.rateStr ?? null }
}

// ---- Выдача: код → поиск по коду; текст → поиск по названиям, пусто — подбор по описанию ----
type SearchState = 'idle' | 'loading' | 'done' | 'error' | 'limit'
const hits = shallowRef<TnvedHit[]>([])
const state = ref<SearchState>('idle')
const source = ref<'search' | 'classify'>('search')
const searchedTerm = ref('')
const searchedCode = ref(false)
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

const run = async (text: string) => {
  clearTimeout(timer)
  const term = text.trim()
  const my = ++seq
  if (term.length < MIN_QUERY) {
    state.value = 'idle'
    hits.value = []
    return
  }
  const byCode = isCodeLike(term)
  state.value = 'loading'
  try {
    let list: TnvedHit[] = (await tnvedApi.search(byCode ? codeDigits(term) : term, true, 20, { silent: true })).data.map(hitFromNode)
    let from: 'search' | 'classify' = 'search'
    if (!list.length && !byCode) {
      if (my !== seq) return
      list = ((await tnvedApi.classify(term, 10, { silent: true })).data.matches ?? []).map(hitFromMatch)
      from = 'classify'
    }
    if (my !== seq) return
    for (const h of list) remember(h.code, h.name, h.rateStr)
    hits.value = list
    source.value = from
    searchedTerm.value = term
    searchedCode.value = byCode
    state.value = 'done'
    // Единственный код — сразу его карточка: не заставляем нажимать очевидное.
    if (list.length === 1 && !code.value) void router.replace(codeTo(list[0].code))
  } catch (e) {
    if (my !== seq) return
    state.value = isRateLimited(e) ? 'limit' : 'error'
  }
}
const schedule = (text: string) => {
  clearTimeout(timer)
  // Поле уже другое: поздний ответ на прежний запрос не должен подменить выдачу, пока ждём паузу ввода.
  seq += 1
  if (text.trim().length < MIN_QUERY) {
    void run(text)
    return
  }
  timer = setTimeout(() => { void run(text) }, DEBOUNCE_MS)
}
// sync: пример и Enter запускают поиск сразу — отложенный запуск от той же правки должен успеть отмениться.
watch(q, schedule, { flush: 'sync' })
if (q.value.trim().length >= MIN_QUERY) void run(q.value)
onBeforeUnmount(() => clearTimeout(timer))

const useExample = (text: string) => {
  onSearch(text)
  void run(text)
}

const active = computed(() => q.value.trim().length >= MIN_QUERY)
const showStart = computed(() => !active.value && !code.value)
const firstLoad = computed(() => state.value === 'loading' && !hits.value.length)
const refreshing = computed(() => state.value === 'loading' && hits.value.length > 0)
const nothing = computed(() => state.value === 'done' && !hits.value.length)
const statusText = computed(() => {
  if (state.value === 'done') return hits.value.length ? t('client.tnved.found', { n: hits.value.length }) : t('client.tnved.nothing', { q: searchedTerm.value })
  if (state.value === 'limit') return t('client.tnved.limit')
  if (state.value === 'error') return t('client.tnved.error')
  return ''
})
const percent = (p: number) => `${Math.round(p * 100)}%`
const dutyOf = (h: TnvedHit) => h.rateStr ?? known[h.code]?.rateStr ?? null

// ---- Карточка кода: ставки (404 — кода нет или он не конечный) ----
type RatesState = 'idle' | 'loading' | 'done' | 'error' | 'limit' | 'missing'
const rates = shallowRef<TnvedRateDto | null>(null)
const ratesState = ref<RatesState>('idle')
const calc = shallowRef<TnvedCalculateResult | null>(null)
let rseq = 0
const loadRates = async () => {
  const c = code.value
  const my = ++rseq
  rates.value = null
  if (!c) {
    ratesState.value = 'idle'
    return
  }
  ratesState.value = 'loading'
  try {
    const { data } = await tnvedApi.rates(c, { silent: true })
    if (my !== rseq) return
    rates.value = data
    remember(c, data?.treeName ?? '', data?.rateStr ?? null)
    ratesState.value = 'done'
  } catch (e) {
    if (my !== rseq) return
    ratesState.value = httpStatus(e) === 404 ? 'missing' : isRateLimited(e) ? 'limit' : 'error'
  }
}
watch(code, () => {
  calc.value = null
  void loadRates()
}, { immediate: true })

const cardName = computed(() => known[code.value]?.name || cleanName(rates.value?.treeName ?? calc.value?.codeName ?? ''))
const duty = computed(() => calc.value?.rateStr || rates.value?.rateStr || known[code.value]?.rateStr || null)
const excise = computed(() => {
  const r = calc.value
  if (!r) return null
  return (r.exciseOptions?.length ?? 0) > 0 || r.exciseKzt > 0
})
// Длинная ставка («10%, но не менее 0,5 евро за 1 кг») — мельче и в несколько строк, а не обрезанная.
const dutyLong = computed(() => (duty.value?.length ?? 0) > 9)
const onResult = (r: TnvedCalculateResult | null) => { calc.value = r }

// Телефон: карточка под списком — после выбора показываем её, а не оставляем за краем экрана.
const card = ref<HTMLElement | null>(null)
const cardHeading = ref<HTMLElement | null>(null)
const pick = async (navigate: (e?: MouseEvent) => unknown, e: MouseEvent) => {
  await navigate(e)
  await nextTick()
  const el = card.value
  if (!el || typeof el.getBoundingClientRect !== 'function') return
  if (el.getBoundingClientRect().top < window.innerHeight * 0.8) return
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  cardHeading.value?.focus({ preventScroll: true })
}

const tile = 'flex min-w-0 flex-col rounded-row bg-canvas px-3.5 py-3 max-sm:px-3'
const tileDt = 'text-[12.5px] leading-[18px] text-muted'
const tileDd = 'm-0 mt-1 text-xl leading-7 font-semibold tabular-nums text-ink max-sm:text-lg max-sm:leading-6'
const tileSub = 'm-0 text-xs leading-4 tabular-nums text-ink-3'
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
const LIST_SKELETON = ['72%', '58%', '66%', '50%']
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-tnved>
    <div>
      <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('client.tnved.title') }}</h1>
      <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('client.tnved.subtitle') }}</p>
    </div>

    <ZInput
      :value="q"
      type="search"
      allow-clear
      autocomplete="off"
      enterkeyhint="search"
      :placeholder="t('client.tnved.search')"
      :aria-label="t('client.tnved.searchLabel')"
      class="h-[50px] w-full max-w-[760px] gap-2.5 rounded-row px-4 text-md"
      data-tnved-search
      @update:value="onSearch"
      @search="run"
    >
      <template #prefix><PhMagnifyingGlass :size="18" class="text-ink-2" aria-hidden="true" /></template>
    </ZInput>
    <p class="sr-only" role="status">{{ statusText }}</p>

    <!-- До поиска: что ввести, с примерами -->
    <section v-if="showStart" :aria-label="t('client.tnved.start.title')" class="max-w-[760px] rounded-panel border border-dashed border-line-strong px-6 py-7 max-sm:px-4" data-tnved-start>
      <p class="m-0 text-base font-semibold text-ink">{{ t('client.tnved.start.title') }}</p>
      <p class="m-0 mt-1 text-sm text-ink-3 text-pretty">{{ t('client.tnved.start.text') }}</p>
      <ul role="list" class="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
        <li v-for="ex in examples" :key="ex">
          <button
            type="button"
            class="inline-flex h-8 cursor-pointer items-center rounded-pill border-0 bg-sunken px-3.5 font-sans text-sm text-ink outline-hidden transition-colors duration-150 ease-out hover:bg-line-strong focus-visible:shadow-focus motion-reduce:transition-none max-sm:h-11 max-sm:px-4"
            :class="{ 'font-mono tabular-nums': isCodeLike(ex) }"
            data-tnved-example
            @click="useExample(ex)"
          >{{ ex }}</button>
        </li>
      </ul>
    </section>

    <div v-else class="flex flex-wrap items-start gap-6">
      <!-- Подходящие коды -->
      <section v-if="active" aria-labelledby="tnved-results" :aria-busy="state === 'loading' || undefined" class="min-w-0 flex-[1_1_380px]" data-tnved-results>
        <h2 id="tnved-results" class="m-0 mb-2.5 text-[13px] leading-5 font-semibold text-ink-2">{{ t('client.tnved.results') }}</h2>

        <ul v-if="firstLoad" role="list" class="m-0 flex list-none flex-col gap-2 p-0" data-tnved-skeleton>
          <li v-for="(w, i) in LIST_SKELETON" :key="i" class="flex flex-col gap-2 rounded-row border border-line px-4 py-3.5">
            <div class="flex items-center justify-between gap-3"><ZSkeleton width="120px" height="15px" /><ZSkeleton width="72px" height="12px" /></div>
            <ZSkeleton :width="w" height="12px" />
          </li>
        </ul>

        <div v-else-if="state === 'limit' || state === 'error'" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-tnved-error>
          <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ state === 'limit' ? t('client.tnved.limit') : t('client.tnved.error') }}</p>
          <ZButton size="sm" :class="retry" data-tnved-retry @click="run(q)">{{ t('home.retry') }}</ZButton>
        </div>

        <div v-else-if="nothing" class="rounded-panel border border-dashed border-line-strong" data-tnved-nothing>
          <ZEmpty
            :title="t('client.tnved.nothing', { q: searchedTerm })"
            :hint="searchedCode ? t('client.tnved.nothingCode') : t('client.tnved.nothingText')"
          />
        </div>

        <template v-else-if="hits.length">
          <p v-if="source === 'classify'" class="m-0 mb-2.5 text-[13px] leading-5 text-ink-3" data-tnved-classified>{{ t('client.tnved.byDescription') }}</p>
          <ul
            role="list"
            :class="cn('m-0 flex list-none flex-col gap-2 p-0 transition-opacity duration-150 ease-out motion-reduce:transition-none', refreshing && 'opacity-60')"
          >
            <li v-for="h in hits" :key="h.code">
              <RouterLink v-slot="{ href, navigate }" :to="codeTo(h.code)" replace custom>
                <a
                  :href="href"
                  :aria-current="h.code === code ? 'true' : undefined"
                  :class="cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 rounded-row border px-4 py-3.5 text-ink no-underline outline-hidden',
                    'transition-colors duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
                    h.code === code
                      ? 'border-navy shadow-[inset_0_0_0_0.5px_var(--color-navy)]'
                      : 'border-line hover:border-line-strong hover:bg-canvas',
                  )"
                  :data-tnved-hit="h.code"
                  @click="pick(navigate, $event)"
                >
                  <span class="font-mono text-[15px] font-medium tabular-nums" data-hit-code>{{ formatTnvedCode(h.code) }}</span>
                  <span class="text-[13px] tabular-nums text-ink-2" data-hit-duty>{{ dutyOf(h) ? t('client.tnved.duty', { rate: dutyOf(h) }) : '' }}</span>
                  <span class="col-span-full line-clamp-3 text-[13.5px] leading-5 text-ink-3" data-hit-name>{{ h.name }}</span>
                  <span v-if="h.probability !== null && source === 'classify'" class="col-span-full text-xs tabular-nums text-muted" data-hit-probability>
                    {{ t('client.tnved.probability', { n: percent(h.probability) }) }}
                  </span>
                </a>
              </RouterLink>
            </li>
          </ul>
        </template>
      </section>

      <!-- Карточка выбранного кода -->
      <section
        v-if="code"
        ref="card"
        aria-labelledby="tnved-card"
        class="flex min-w-0 flex-[999_1_480px] scroll-mt-4 flex-col gap-[18px] rounded-panel border border-line bg-surface px-6 py-[22px] max-sm:px-4 max-sm:py-5"
        :data-tnved-card="code"
      >
        <div>
          <p class="m-0 font-mono text-sm tabular-nums text-ink-3" data-card-code>{{ formatTnvedCode(code) }}</p>
          <h2
            id="tnved-card"
            ref="cardHeading"
            tabindex="-1"
            :class="cn('m-0 mt-1 text-lg leading-[26px] font-semibold text-ink outline-hidden text-pretty', !cardName && ratesState === 'loading' && 'sr-only')"
            data-card-name
          >{{ cardName || t('client.tnved.card.code', { code: formatTnvedCode(code) }) }}</h2>
          <ZSkeleton v-if="!cardName && ratesState === 'loading'" width="70%" height="18px" class="mt-1.5" />
        </div>

        <div v-if="ratesState === 'missing'" class="rounded-row bg-canvas px-4 py-3.5 text-base text-ink-2" data-card-missing>
          {{ t('client.tnved.card.missing') }}
        </div>

        <template v-else>
          <div v-if="ratesState === 'error' || ratesState === 'limit'" class="flex flex-wrap items-center gap-3 rounded-row bg-canvas px-4 py-3" data-card-error>
            <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ ratesState === 'limit' ? t('client.tnved.limit') : t('client.tnved.card.error') }}</p>
            <ZButton size="sm" :class="retry" data-card-retry @click="loadRates">{{ t('home.retry') }}</ZButton>
          </div>

          <dl class="m-0 grid grid-cols-3 gap-2.5 max-sm:gap-2" data-card-tiles>
            <div :class="tile" data-tile="duty">
              <dt :class="tileDt">{{ t('client.tnved.card.duty') }}</dt>
              <dd v-if="ratesState === 'loading' && !duty" class="m-0 mt-1.5"><ZSkeleton width="48px" height="22px" /></dd>
              <dd v-else :class="cn(tileDd, dutyLong && 'line-clamp-3 text-sm leading-5 break-words max-sm:text-[13px] max-sm:leading-[18px]')" data-tile-value>{{ duty ?? '—' }}</dd>
              <dd v-if="calc" :class="tileSub">{{ formatMoney(calc.importDutyKzt) }}</dd>
            </div>
            <div :class="tile" data-tile="vat">
              <dt :class="tileDt">{{ t('client.tnved.card.vat') }}</dt>
              <dd :class="tileDd" data-tile-value>{{ VAT_RATE }}</dd>
              <dd v-if="calc" :class="tileSub">{{ formatMoney(calc.vatKzt) }}</dd>
            </div>
            <div :class="tile" data-tile="excise">
              <dt :class="tileDt">{{ t('client.tnved.card.excise') }}</dt>
              <dd :class="tileDd" data-tile-value>{{ excise === null ? '—' : excise ? t('client.tnved.card.yes') : t('client.tnved.card.no') }}</dd>
              <dd v-if="calc && calc.exciseKzt > 0" :class="tileSub">{{ formatMoney(calc.exciseKzt) }}</dd>
            </div>
          </dl>

          <TnvedCalculator :code="code" :rate-text="rates?.rateStr" @result="onResult" />

          <div v-if="canShip" class="flex flex-wrap items-center gap-3 border-t border-line pt-[18px]">
            <RouterLink
              to="/import-40/new"
              class="inline-flex h-[42px] items-center justify-center gap-2 rounded-row bg-navy px-[18px] text-[14.5px] font-semibold text-white no-underline outline-hidden transition-colors duration-150 ease-out hover:bg-navy-hover focus-visible:shadow-focus motion-reduce:transition-none max-sm:h-11 max-sm:w-full"
              data-tnved-ship
            >
              {{ t('client.tnved.toShipment') }}<PhArrowRight :size="16" aria-hidden="true" />
            </RouterLink>
          </div>
        </template>
      </section>

      <div
        v-else-if="active && state === 'done' && hits.length > 1"
        class="flex min-h-40 min-w-0 flex-[999_1_480px] items-center justify-center rounded-panel border border-dashed border-line-strong px-6 py-8 text-center max-xl:hidden"
        data-tnved-pick
      >
        <p class="m-0 max-w-[320px] text-sm text-ink-3 text-pretty">{{ t('client.tnved.pick') }}</p>
      </div>
    </div>
  </div>
</template>
