<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCaretLeft } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import InvoicePanel from '@/views/client/invoices/InvoicePanel.vue'
import { billingApi, type BrokerInvoice } from '@/api/billing'
import {
  defaultInvoiceId, groupInvoices, invoiceNo, invoiceState, type InvoiceGroupKey, type InvoiceStateTone,
} from '@/views/client/invoices/invoices'
import { useBlock } from '@/views/home/useBlock'
import { formatMoney } from '@/ui/number'
import { cn } from '@/ui/cn'

// «Счета» клиента (/billing, редизайн, волна 2b, доска Invoices): слева счета и акты AQNIET группами,
// справа — выбранный счёт с реквизитами, назначением платежа и чеком. Выбор живёт в адресе (?id=).
// Телефон: без ?id= — только список; с ?id= — только панель с «‹ Все счета».
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Список и реквизиты — независимые блоки: ошибка реквизитов не прячет счета, и наоборот.
const list = useBlock(true, () => billingApi.list(undefined, { silent: true }))
const requisites = useBlock(true, () => billingApi.requisites({ silent: true }))
void list.load()
void requisites.load()

// Счёт после загрузки чека приходит в ответе — подменяем его в списке, не перечитывая всё.
const patched = ref<Record<string, BrokerInvoice>>({})
const onUpdated = (inv: BrokerInvoice) => { patched.value = { ...patched.value, [inv.id]: inv } }
const reloadList = () => {
  patched.value = {}
  return list.load()
}

const invoices = computed(() => (list.data ?? []).map((i) => patched.value[i.id] ?? i))
const groups = computed(() => groupInvoices(invoices.value))
const visible = computed(() => groups.value.flatMap((g) => g.items))

// ---- Выбор: ?id= из адреса (если такой счёт есть), иначе — по умолчанию (на компьютере) ----
const queryId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const selectedId = computed(() => (visible.value.some((i) => i.id === queryId.value) ? queryId.value : null))
const currentId = computed(() => selectedId.value ?? defaultInvoiceId(groups.value))
const current = computed(() => visible.value.find((i) => i.id === currentId.value) ?? null)

const cardTo = (id: string) => ({ query: { ...route.query, id } })
const listTo = computed(() => ({ query: { ...route.query, id: undefined } }))
// Первый выбор — новой записью (на телефоне системное «Назад» вернёт к списку), переключение между
// счетами — replace: «Назад» не листает просмотренные счета.
const replaceOnSelect = computed(() => !!selectedId.value)
// «‹ Все счета»: если пришли из списка — шаг назад по истории (без дубля записи), иначе — replace на список.
const backToList = () => {
  const back = (window.history.state as { back?: string } | null)?.back
  if (back && back === router.resolve(listTo.value).fullPath) router.back()
  else void router.replace(listTo.value)
}

// Телефон: панель открывается вместо списка — показываем её сначала; по возвращении — к той же карточке.
const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639.98px)').matches
watch(selectedId, async (id, prev) => {
  if (!isPhone()) return
  if (id && !prev) window.scrollTo({ top: 0 })
  else if (!id && prev) {
    await nextTick()
    document.querySelector(`[data-invoice-card="${CSS.escape(prev)}"]`)?.scrollIntoView({ block: 'center' })
  }
})

// ---- Карточка ----
const STATE_FG: Record<InvoiceStateTone, string> = {
  wait: 'font-semibold text-gold-ink',
  danger: 'font-semibold text-tone-danger-fg',
  pay: 'font-medium text-tone-pay-fg',
  done: 'text-tone-done-fg',
  neutral: 'text-muted',
}
const cardTitle = (i: BrokerInvoice) =>
  t(i.kind === 'act' ? 'client.invoices.actNo' : 'client.invoices.invoiceNo', { no: invoiceNo(i) })
const cardState = (i: BrokerInvoice) => {
  const s = invoiceState(i)
  const key = s.date || (s.key !== 'paid' && s.key !== 'act') ? s.key : `${s.key}NoDate`
  return { text: t(`client.invoices.state.${key}`, { date: s.date }), cls: STATE_FG[s.tone] }
}
const groupTitle = (key: InvoiceGroupKey, n: number) => t(`client.invoices.group.${key}`, { n })

const LIST_SKELETON = [['46%', '62%'], ['40%', '54%'], ['50%', '58%']]
// «Повторить» — sm на компьютере, на телефоне — палец (44px).
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-invoices>
    <div :class="cn(selectedId && 'max-sm:hidden')">
      <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('client.invoices.title') }}</h1>
      <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('client.invoices.subtitle') }}</p>
    </div>

    <!-- Загрузка: скелетоны списка и панели -->
    <div v-if="list.loading" class="flex flex-wrap items-start gap-6" aria-busy="true" data-invoices-skeleton>
      <div class="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
        <ZSkeleton width="96px" height="13px" />
        <div v-for="(w, i) in LIST_SKELETON" :key="i" class="flex flex-col gap-2.5 rounded-panel border border-line px-[18px] py-4">
          <div class="flex justify-between gap-4"><ZSkeleton :width="w[0]" height="15px" /><ZSkeleton width="72px" height="15px" /></div>
          <div class="flex justify-between gap-4"><ZSkeleton :width="w[1]" height="12px" /><ZSkeleton width="48px" height="12px" /></div>
        </div>
      </div>
      <div class="flex min-w-0 flex-[999_1_520px] flex-col gap-5 rounded-panel border border-line px-[26px] py-6 max-sm:hidden">
        <div class="flex flex-col gap-2"><ZSkeleton width="min(280px, 70%)" height="20px" /><ZSkeleton width="min(320px, 80%)" height="13px" /></div>
        <ZSkeleton width="200px" height="30px" />
        <ZSkeleton height="210px" />
        <ZSkeleton height="64px" />
      </div>
    </div>

    <!-- Ошибка списка -->
    <div v-else-if="list.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-invoices-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('client.invoices.loadError') }}</p>
      <ZButton size="sm" :class="retry" data-invoices-retry @click="reloadList">{{ t('home.retry') }}</ZButton>
    </div>

    <!-- Пусто -->
    <div v-else-if="!visible.length" class="rounded-panel border border-dashed border-line-strong" data-invoices-empty>
      <ZEmpty :title="t('client.invoices.empty')" :hint="t('client.invoices.emptyHint')">
        <template #action>
          <RouterLink
            to="/import-40"
            class="inline-flex h-10 items-center rounded-row bg-sunken px-4 text-sm font-semibold text-ink no-underline outline-hidden hover:bg-line-strong focus-visible:shadow-focus max-sm:h-11"
          >{{ t('client.invoices.toShipments') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else class="flex flex-wrap items-start gap-6">
      <section
        :aria-label="t('client.invoices.listLabel')"
        :class="cn('flex min-w-0 flex-[1_1_360px] flex-col gap-2.5', selectedId && 'max-sm:hidden')"
        data-invoices-list
      >
        <template v-for="(g, gi) in groups" :key="g.key">
          <h2 :class="cn('m-0 text-[13px] leading-5 font-semibold text-ink-2', gi > 0 && 'mt-3')" :data-invoice-group="g.key">
            {{ groupTitle(g.key, g.items.length) }}
          </h2>
          <ul role="list" class="m-0 flex list-none flex-col gap-2.5 p-0">
            <li v-for="i in g.items" :key="i.id">
              <RouterLink v-slot="{ href, navigate }" :to="cardTo(i.id)" :replace="replaceOnSelect" custom>
                <a
                  :href="href"
                  :aria-current="i.id === currentId ? 'true' : undefined"
                  :data-invoice-card="i.id"
                  :class="cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1.5 rounded-panel border bg-surface px-[18px] text-ink no-underline outline-hidden',
                    'transition-[border-color,box-shadow] duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none',
                    g.key === 'toPay' ? 'py-4' : 'py-3.5',
                    i.id === currentId
                      ? 'border-navy shadow-[0_0_0_0.5px_var(--color-navy)] max-sm:border-line max-sm:shadow-none'
                      : 'border-line hover:border-line-strong hover:shadow-raised',
                  )"
                  @click="navigate"
                >
                  <span :class="cn('truncate text-[15px] leading-[22px]', g.key === 'toPay' ? 'font-semibold' : 'font-medium')">{{ cardTitle(i) }}</span>
                  <span :class="cn('text-right text-[15px] leading-[22px] tabular-nums', g.key === 'toPay' ? 'font-semibold' : 'text-ink-2')">{{ formatMoney(i.total) }}</span>
                  <span class="truncate text-[13.5px] leading-5 text-ink-3">{{ i.caseNumber || t('client.invoices.noCase') }}</span>
                  <span :class="cn('text-right text-[13px] leading-5 whitespace-nowrap', cardState(i).cls)" data-invoice-state>{{ cardState(i).text }}</span>
                </a>
              </RouterLink>
            </li>
          </ul>
        </template>
      </section>

      <div v-if="current" :class="cn('flex min-w-0 flex-[999_1_520px] flex-col gap-2', !selectedId && 'max-sm:hidden')">
        <RouterLink v-slot="{ href }" :to="listTo" custom>
          <a
            :href="href"
            class="-mt-1 -ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-field px-2 text-sm text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus sm:hidden"
            data-invoices-back
            @click.prevent="backToList"
          >
            <PhCaretLeft :size="16" aria-hidden="true" />{{ t('client.invoices.back') }}
          </a>
        </RouterLink>
        <InvoicePanel
          :invoice="current"
          :requisites="requisites.data"
          :requisites-loading="requisites.loading"
          :requisites-error="requisites.error"
          @updated="onUpdated"
          @retry-requisites="requisites.load()"
        />
      </div>
    </div>
  </div>
</template>
