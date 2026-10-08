<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZSegmented from '@/components/z/ZSegmented.vue'
import { salesApi, type SalesQuoteListItem } from '@/api/sales'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import QuotesList from './QuotesList.vue'
import SalesCalculator from './SalesCalculator.vue'
import { seesAllQuotes } from './sales'

// «Продажи» (редизайн, волна 3б, доски Sales и Quotes): расчёт услуг и платежей и коммерческие предложения.
// Вкладка — в адресе (?tab=calc|quotes). Расчёт не размонтируется при смене вкладки: форма сохраняется, как раньше.
// Список КП грузится сразу (счётчик во вкладке); менеджер видит свои КП, руководитель и администратор — все (сервер).
type SalesTab = 'calc' | 'quotes'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const tab = computed<SalesTab>(() => (route.query.tab === 'quotes' ? 'quotes' : 'calc'))
const setTab = (k: SalesTab) => { void router.replace({ query: { ...route.query, tab: k } }) }

const quotes = useBlock(true, () => salesApi.listQuotes({ silent: true }))
onMounted(() => { void quotes.load() })
const rows = computed<SalesQuoteListItem[]>(() => quotes.data ?? [])

const allQuotes = computed(() => seesAllQuotes(auth.role, auth.hasBusinessRole('rop')))
const tabOptions = computed(() => [
  { value: 'calc', label: t('broker.sales.tab.calc') },
  { value: 'quotes', label: allQuotes.value ? t('sales.vseKp') : t('sales.moiKp'), count: quotes.data ? quotes.data.length : undefined },
])

const onSaved = async () => {
  setTab('quotes')
  await quotes.load()
}
</script>

<template>
  <div class="flex flex-col gap-4" data-sales>
    <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.sales.title') }}</h1>
    <ZSegmented
      :value="tab"
      :options="tabOptions"
      :aria-label="t('broker.sales.tab.label')"
      class="max-w-full self-start overflow-x-auto [&_button]:whitespace-nowrap"
      data-sales-tabs
      @update:value="setTab($event as SalesTab)"
    />
    <SalesCalculator v-show="tab === 'calc'" @saved="onSaved" />
    <QuotesList
      v-if="tab === 'quotes'"
      :rows="rows"
      :loading="quotes.loading"
      :error="quotes.error"
      :loaded="!!quotes.data"
      @reload="quotes.load()"
      @new-calc="setTab('calc')"
    />
  </div>
</template>
