<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import type { TnvedCurrencyDto } from '@/types/api'
import { filterRates, rateRows, ratesUpdated } from './rates'

// Таблица «Курсы валют» (редизайн, волна 2b клиента → общая с сотрудником в 5а): курсы НБ РК в тенге за 1 ед.
// Все состояния — здесь: скелетон, ошибка с «Повторить» (429 — про лимит), пусто, «ничего не нашлось».
// Загрузку и поиск ведёт экран; частые валюты — сверху, остальные по коду.
const props = defineProps<{
  currencies: TnvedCurrencyDto[] | null
  loading: boolean
  error: boolean
  /** Ошибка — 429: «попробуйте через минуту». */
  limited?: boolean
  query: string
}>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()

const rows = computed(() => rateRows(props.currencies, locale.value))
const found = computed(() => filterRates(rows.value, props.query))
const updated = computed(() => ratesUpdated(props.currencies, locale.value))

const grid = 'grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-x-4 px-5 max-sm:gap-x-3 max-sm:px-4'
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
const SKELETON = ['46%', '38%', '52%', '30%', '44%', '36%']
</script>

<template>
  <section :aria-label="t('broker.references.rates.title')" :aria-busy="loading || undefined">
    <div v-if="loading" class="flex flex-col rounded-panel border border-line" data-rates-skeleton>
      <div v-for="(w, i) in SKELETON" :key="i" :class="[grid, 'border-b border-line py-3.5 last:border-b-0']">
        <ZSkeleton width="40px" height="14px" />
        <ZSkeleton :width="w" height="14px" />
        <ZSkeleton width="72px" height="14px" />
      </div>
    </div>

    <div v-else-if="error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-rates-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ limited ? t('broker.references.rates.limit') : t('broker.references.rates.loadError') }}</p>
      <ZButton size="sm" :class="retry" data-rates-retry @click="emit('retry')">{{ t('broker.references.rates.retry') }}</ZButton>
    </div>

    <div v-else-if="!rows.length" class="rounded-panel border border-dashed border-line-strong" data-rates-empty>
      <ZEmpty :title="t('broker.references.rates.empty')" :hint="t('broker.references.rates.emptyHint')" />
    </div>

    <div v-else-if="!found.length" class="rounded-panel border border-dashed border-line-strong" data-rates-nothing>
      <ZEmpty :title="t('broker.references.rates.nothing', { q: query.trim() })" :hint="t('broker.references.rates.nothingHint')" />
    </div>

    <template v-else>
      <div role="table" :aria-label="t('broker.references.rates.title')" class="flex flex-col overflow-hidden rounded-panel border border-line bg-surface">
        <div role="rowgroup" class="border-b border-line bg-canvas">
          <div role="row" :class="[grid, 'py-2.5 text-xs leading-4 font-medium text-muted']">
            <span role="columnheader">{{ t('broker.references.rates.col.code') }}</span>
            <span role="columnheader">{{ t('broker.references.rates.col.name') }}</span>
            <span role="columnheader" class="text-right">{{ t('broker.references.rates.col.rate') }}</span>
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
      <p v-if="updated" class="m-0 mt-3 text-[13px] leading-5 text-muted tabular-nums" data-rates-updated>{{ t('broker.references.rates.updated', { date: updated }) }}</p>
    </template>
  </section>
</template>
