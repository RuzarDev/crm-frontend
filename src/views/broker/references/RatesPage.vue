<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZInput from '@/components/z/ZInput.vue'
import RatesTable from '@/views/references/RatesTable.vue'
import { useRatesData } from '@/views/references/rates'

// «Курсы валют» сотрудника (редизайн, волна 5а): курсы НБ РК в тенге за 1 ед., частые валюты сверху, поиск (?q=),
// «Обновить» и «Обновлено». Таблица и загрузка — общие с кабинетом клиента (views/references).
const { t } = useI18n()
const { block, limited, q, onSearch, refresh } = useRatesData()
</script>

<template>
  <div class="flex flex-col gap-5" data-rates-page>
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-0">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.references.rates.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.references.rates.subtitle') }}</p>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <ZInput
          :value="q"
          type="search"
          allow-clear
          autocomplete="off"
          :placeholder="t('broker.references.rates.search')"
          :aria-label="t('broker.references.rates.searchLabel')"
          class="w-full max-sm:h-11 max-sm:text-base sm:w-[280px]"
          data-rates-search
          @update:value="onSearch"
        >
          <template #prefix><PhMagnifyingGlass :size="16" class="text-ink-3" aria-hidden="true" /></template>
        </ZInput>
        <ZButton class="max-sm:h-11 max-sm:w-full" :loading="block.loading" data-rates-refresh @click="refresh">
          <template #icon><PhArrowClockwise :size="15" aria-hidden="true" /></template>
          {{ t('broker.references.rates.refresh') }}
        </ZButton>
      </div>
    </div>

    <RatesTable :currencies="block.data" :loading="block.loading" :error="block.error" :limited="limited" :query="q" @retry="block.load()" />
  </div>
</template>
