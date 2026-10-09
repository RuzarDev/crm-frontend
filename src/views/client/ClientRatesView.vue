<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZInput from '@/components/z/ZInput.vue'
import RatesTable from '@/views/references/RatesTable.vue'
import { useRatesData } from '@/views/references/rates'

// «Курсы валют» клиента (редизайн, волна 2b): курсы Нацбанка РК в тенге за единицу, поиск по коду и названию.
// Таблица и загрузка — общие с экраном сотрудника (views/references). Поиск — в адресе (?q=, replace), как в других списках клиента.
const { t } = useI18n()
const { block, limited, q, onSearch } = useRatesData()
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

    <RatesTable :currencies="block.data" :loading="block.loading" :error="block.error" :limited="limited" :query="q" @retry="block.load()" />
  </div>
</template>
