<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedCurrencyDto } from '@/types/api'
import { useBlock } from '@/views/home/useBlock'
import { isRateLimited } from '@/views/client/tnved/tnved'

// «Курсы валют» клиента (редизайн, волна 2b): курсы Нацбанка РК в тенге за единицу, поиск по коду и названию.
// Частые валюты — сверху, остальные по коду. Поиск — в адресе (?q=, replace), как в других списках клиента.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

// 429 отличаем от прочих ошибок: «попробуйте через минуту», а не «не удалось».
const limited = ref(false)
const block = useBlock(true, async () => {
  limited.value = false
  try {
    return (await tnvedApi.currencies({ silent: true })).data ?? []
  } catch (e) {
    limited.value = isRateLimited(e)
    throw e
  }
})
void block.load()

// ---- Поиск (?q=) ----
const queryQ = () => (typeof route.query.q === 'string' ? route.query.q : '')
const q = ref(queryQ())
let ownReplaces = 0
watch(() => route.query.q, () => {
  if (ownReplaces) return
  const v = queryQ()
  if (v !== q.value) q.value = v
})
const onSearch = async (v: string) => {
  q.value = v
  ownReplaces += 1
  try {
    await router.replace({ query: { ...route.query, q: v.trim() ? v : undefined } })
  } finally {
    ownReplaces -= 1
  }
}

// ---- Строки ----
const POPULAR = ['USD', 'EUR', 'RUB', 'CNY']
const LOCALE_TAG: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const rank = (code: string) => {
  const i = POPULAR.indexOf(code)
  return i < 0 ? POPULAR.length : i
}
// По-русски — название Нацбанка (с сервера); на kk/en — Intl, без него — серверное.
const displayNames = computed(() => {
  try {
    return new Intl.DisplayNames([LOCALE_TAG[locale.value] || 'ru-RU'], { type: 'currency' })
  } catch {
    return null
  }
})
const nameOf = (c: TnvedCurrencyDto): string => {
  if (locale.value === 'ru') return c.name
  let intl = ''
  try {
    intl = displayNames.value?.of(c.codeLat) ?? ''
  } catch {
    intl = ''
  }
  return intl && intl !== c.codeLat ? intl : c.name
}
const rateFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const formatRate = (n: number) => rateFormat.format(n).replace(/[  ]/g, ' ')

interface RateRow { code: string; name: string; serverName: string; rate: string }
const rows = computed<RateRow[]>(() =>
  [...(block.data ?? [])]
    .sort((a, b) => rank(a.codeLat) - rank(b.codeLat) || a.codeLat.localeCompare(b.codeLat))
    .map((c) => ({ code: c.codeLat, name: nameOf(c), serverName: c.name, rate: formatRate(c.rate) })),
)
const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()
const needle = computed(() => norm(q.value))
const found = computed(() => {
  const n = needle.value
  if (!n) return rows.value
  return rows.value.filter((r) => [r.code, r.name, r.serverName].some((f) => norm(f).includes(n)))
})

// «Обновлено» — по самому свежему курсу, в местном времени.
const pad = (n: number) => String(n).padStart(2, '0')
const updated = computed(() => {
  const times = (block.data ?? []).map((c) => Date.parse(c.updatedAtUtc)).filter((n) => Number.isFinite(n))
  if (!times.length) return ''
  const d = new Date(Math.max(...times))
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const grid = 'grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-x-4 px-5 max-sm:gap-x-3 max-sm:px-4'
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
const SKELETON = ['46%', '38%', '52%', '30%', '44%', '36%']
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-rates>
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('client.rates.title') }}</h1>
        <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('client.rates.subtitle') }}</p>
      </div>
      <ZInput
        :value="q"
        type="search"
        allow-clear
        autocomplete="off"
        :placeholder="t('client.rates.search')"
        :aria-label="t('client.rates.searchLabel')"
        class="w-full max-sm:h-11 max-sm:text-base sm:ml-auto sm:w-[300px]"
        data-rates-search
        @update:value="onSearch"
      />
    </div>

    <section :aria-label="t('client.rates.title')" :aria-busy="block.loading || undefined">
      <div v-if="block.loading" class="flex flex-col rounded-panel border border-line" data-rates-skeleton>
        <div v-for="(w, i) in SKELETON" :key="i" :class="[grid, 'border-b border-line py-3.5 last:border-b-0']">
          <ZSkeleton width="40px" height="14px" />
          <ZSkeleton :width="w" height="14px" />
          <ZSkeleton width="72px" height="14px" />
        </div>
      </div>

      <div v-else-if="block.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-rates-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ limited ? t('client.tnved.limit') : t('client.rates.loadError') }}</p>
        <ZButton size="sm" :class="retry" data-rates-retry @click="block.load()">{{ t('home.retry') }}</ZButton>
      </div>

      <div v-else-if="!rows.length" class="rounded-panel border border-dashed border-line-strong" data-rates-empty>
        <ZEmpty :title="t('client.rates.empty')" :hint="t('client.rates.emptyHint')" />
      </div>

      <div v-else-if="!found.length" class="rounded-panel border border-dashed border-line-strong" data-rates-nothing>
        <ZEmpty :title="t('client.rates.nothing', { q: q.trim() })" :hint="t('client.rates.nothingHint')" />
      </div>

      <template v-else>
        <div role="table" :aria-label="t('client.rates.title')" class="flex flex-col overflow-hidden rounded-panel border border-line bg-surface">
          <div role="rowgroup" class="border-b border-line bg-canvas">
            <div role="row" :class="[grid, 'py-2.5 text-xs leading-4 font-medium text-muted']">
              <span role="columnheader">{{ t('client.rates.col.code') }}</span>
              <span role="columnheader">{{ t('client.rates.col.name') }}</span>
              <span role="columnheader" class="text-right">{{ t('client.rates.col.rate') }}</span>
            </div>
          </div>
          <div role="rowgroup">
            <div
              v-for="r in found"
              :key="r.code"
              role="row"
              :class="[grid, 'min-h-12 border-b border-line py-3 last:border-b-0']"
              :data-rate-row="r.code"
            >
              <span role="cell" class="font-mono text-sm font-medium tabular-nums text-ink" data-rate-code>{{ r.code }}</span>
              <span role="cell" class="min-w-0 truncate text-base text-ink-2" :title="r.name" data-rate-name>{{ r.name }}</span>
              <span role="cell" class="text-right text-[15px] font-medium tabular-nums text-ink" data-rate-value>{{ r.rate }}</span>
            </div>
          </div>
        </div>
        <p v-if="updated" class="m-0 mt-3 text-[13px] leading-5 text-muted tabular-nums" data-rates-updated>{{ t('client.rates.updated', { date: updated }) }}</p>
      </template>
    </section>
  </div>
</template>
