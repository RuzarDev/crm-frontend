<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPrinter } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCollapse from '@/components/z/ZCollapse.vue'
import ZCollapseItem from '@/components/z/ZCollapseItem.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { SALES_QUOTE_STATUS_CODES, salesApi, type SalesQuoteDto, type SalesQuoteListItem } from '@/api/sales'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'
import { printQuote } from './printQuote'
import { quoteStatusKey, quoteTone } from './sales'

// Панель КП (редизайн, волна 3б, доска Quotes): сначала данные строки списка, затем getQuote (строки услуг и товаров).
// Статус меняется сразу (changeStatus, тост); при ошибке значение откатывается, тост показал перехватчик.
// «Открыть в расчёте» с макета нет: КП не хранит исходные данные товаров (стоимость, валюту, страну).
const props = defineProps<{ open: boolean; row: SalesQuoteListItem | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [] }>()
const { t } = useI18n()

// ---- Данные: полная карточка поверх строки списка ----
const detail = shallowRef<SalesQuoteDto | null>(null)
const loading = ref(false)
const failed = ref(false)
let seq = 0
const load = async (id: string) => {
  const my = ++seq
  loading.value = true
  failed.value = false
  try {
    const d = await salesApi.getQuote(id, { silent: true })
    if (my === seq) detail.value = d
  } catch {
    if (my === seq) failed.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => [props.open, props.row?.id] as const, ([open, id]) => {
  if (!open || !id) return
  if (detail.value?.id !== id) detail.value = null
  void load(id)
}, { immediate: true })

const full = computed(() => (detail.value && detail.value.id === props.row?.id ? detail.value : null))
const skeleton = computed(() => loading.value && !full.value)

// ---- Статус ----
// Показанный статус: своё значение на время смены (и после отката), иначе — из карточки или строки.
const statusOverride = ref<{ id: string; status: number } | null>(null)
watch(() => props.row?.id, () => { statusOverride.value = null })
const status = computed(() => {
  const id = props.row?.id
  if (statusOverride.value && statusOverride.value.id === id) return statusOverride.value.status
  return full.value?.status ?? props.row?.status ?? 0
})
const statusOptions = computed(() => SALES_QUOTE_STATUS_CODES.map((code, value) => ({ value, label: t(`enum.salesQuoteStatus.${code}`) })))
const changing = ref(false)
const changeStatus = async (v: unknown) => {
  const row = props.row
  const next = Number(v)
  if (!row || changing.value || Number.isNaN(next) || next === status.value) return
  const prev = status.value
  statusOverride.value = { id: row.id, status: next }
  changing.value = true
  try {
    await salesApi.changeStatus(row.id, next)
    if (detail.value?.id === row.id) detail.value = { ...detail.value, status: next }
    message.success(t('sales.statusObnovlen'))
    emit('changed')
  } catch {
    // Тост показал перехватчик; возвращаем прежнее значение.
    if (statusOverride.value?.id === row.id) statusOverride.value = { id: row.id, status: prev }
  } finally {
    changing.value = false
  }
}

// ---- Строки ----
const sections = ref<string[]>([])
watch(() => props.row?.id, () => { sections.value = [] })
const serviceMeta = (s: SalesQuoteDto['serviceLines'][number]) => [
  t('broker.sales.drawer.serviceQty', { qty: s.quantity, unit: s.unit, price: formatMoney(s.unitPrice) }),
  s.discountPercent ? t('broker.sales.drawer.discount', { n: s.discountPercent }) : '',
].filter(Boolean).join(' · ')
const goodsMeta = (g: SalesQuoteDto['goodsLines'][number]) => [
  `${t('broker.sales.breakdown.duty')} ${formatMoney(g.importDutyKzt)}`,
  g.exciseKzt ? `${t('broker.sales.breakdown.excise')} ${formatMoney(g.exciseKzt)}` : '',
  `${t('broker.sales.breakdown.vat')} ${formatMoney(g.vatKzt)}`,
  `${t('broker.sales.breakdown.feeShort')} ${formatMoney(g.customsFeeKzt)}`,
].filter(Boolean).join(' · ')

const print = () => { if (full.value) printQuote({ ...full.value, status: status.value }) }
</script>

<template>
  <ZDrawer :open="open" :width="420" data-quote-drawer @update:open="emit('update:open', $event)">
    <template #title>
      <template v-if="row">
        <span class="block text-xs font-normal text-muted">{{ t('sales.kommercheskoePredlozhenie') }}</span>
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="text-lg leading-6 tabular-nums" data-quote-title>{{ t('misc.kpNomer', { n: row.number, y: row.year }) }}</span>
          <ZTag :tone="quoteTone(status)" data-quote-status-tag>{{ quoteStatusKey(status) ? t(quoteStatusKey(status)) : '—' }}</ZTag>
        </span>
        <span class="mt-0.5 block text-sm font-normal text-ink-3 [overflow-wrap:anywhere]" data-quote-client>
          {{ row.clientName }}<template v-if="full?.clientContact"> · {{ full.clientContact }}</template>
        </span>
      </template>
      <template v-else>{{ t('sales.kommercheskoePredlozhenie') }}</template>
    </template>

    <div v-if="row" class="flex flex-col gap-5">
      <ZField :label="t('sales.status')">
        <ZSelect
          :value="status"
          :options="statusOptions"
          :disabled="changing"
          :loading="changing"
          class="max-sm:h-11"
          data-quote-status
          @update:value="changeStatus"
        >
          <template #option="{ option }">
            <ZTag :tone="quoteTone(Number(option.value))" size="sm">{{ option.label }}</ZTag>
          </template>
        </ZSelect>
      </ZField>

      <dl class="m-0 flex flex-col gap-2 text-sm" data-quote-sums>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-ink-2">{{ t('broker.sales.servicesTotal') }}</dt>
          <dd class="m-0 whitespace-nowrap text-ink tabular-nums" data-quote-services-total>{{ full ? formatMoney(full.servicesTotal) : '—' }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-ink-2">{{ t('broker.sales.customsTotal') }}</dt>
          <dd class="m-0 whitespace-nowrap text-ink tabular-nums" data-quote-customs-total>{{ full ? formatMoney(full.tpinTotal) : '—' }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-3 border-t border-line pt-2">
          <dt class="font-semibold text-ink">{{ t('broker.sales.drawer.total') }}</dt>
          <dd class="m-0 font-semibold whitespace-nowrap text-ink tabular-nums" data-quote-grand-total>{{ formatMoney(full?.grandTotal ?? row.grandTotal) }}</dd>
        </div>
      </dl>

      <div v-if="failed && !full" class="flex flex-wrap items-center gap-3 rounded-row bg-sunken px-3.5 py-3" data-quote-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('broker.sales.drawer.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-quote-retry @click="load(row.id)">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZSkeleton v-else-if="skeleton" :lines="3" height="36px" data-quote-skeleton />
      <template v-else-if="full">
        <p v-if="full.comment" class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]" data-quote-comment>
          <span class="text-ink-3">{{ t('broker.sales.drawer.comment') }}</span> {{ full.comment }}
        </p>
        <ZCollapse :active-key="sections" class="border-t border-line" @update:active-key="sections = $event">
          <ZCollapseItem value="services" data-quote-services>
            <template #header>{{ t('broker.sales.drawer.services', { n: full.serviceLines.length }) }}</template>
            <p v-if="!full.serviceLines.length" class="m-0 text-sm text-muted">{{ t('broker.sales.drawer.noServices') }}</p>
            <ul v-else class="m-0 list-none p-0">
              <li v-for="(s, i) in full.serviceLines" :key="i" class="flex items-start gap-3 border-t border-line py-2 first:border-t-0" data-quote-service>
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-ink [overflow-wrap:anywhere]">{{ s.name }}</div>
                  <div class="text-xs text-muted tabular-nums">{{ serviceMeta(s) }}</div>
                </div>
                <span class="shrink-0 text-sm font-semibold whitespace-nowrap text-ink tabular-nums">{{ formatMoney(s.total) }}</span>
              </li>
            </ul>
          </ZCollapseItem>
          <ZCollapseItem value="goods" data-quote-goods>
            <template #header>{{ t('broker.sales.drawer.goods', { n: full.goodsLines.length }) }}</template>
            <p v-if="!full.goodsLines.length" class="m-0 text-sm text-muted">{{ t('broker.sales.drawer.noGoods') }}</p>
            <ul v-else class="m-0 list-none p-0">
              <li v-for="(g, i) in full.goodsLines" :key="i" class="flex items-start gap-3 border-t border-line py-2 first:border-t-0" data-quote-goods-line>
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-ink [overflow-wrap:anywhere]">{{ g.description || g.code }}</div>
                  <div class="font-mono text-xs text-ink-3">{{ g.code }}</div>
                  <div class="text-xs text-muted tabular-nums">{{ goodsMeta(g) }}</div>
                </div>
                <span class="shrink-0 text-sm font-semibold whitespace-nowrap text-ink tabular-nums">{{ formatMoney(g.tpinTotalKzt) }}</span>
              </li>
            </ul>
          </ZCollapseItem>
        </ZCollapse>
      </template>
    </div>

    <template v-if="row" #footer>
      <ZButton variant="primary" :disabled="!full" class="max-sm:h-11 max-sm:w-full" data-quote-print @click="print">
        <template #icon><PhPrinter :size="16" aria-hidden="true" /></template>
        {{ t('broker.sales.drawer.pdf') }}
      </ZButton>
    </template>
  </ZDrawer>
</template>
