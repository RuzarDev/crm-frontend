<script setup lang="ts">
import { computed, useId, watchEffect } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhPlus } from '@phosphor-icons/vue'
import ZAskBanner from '@/components/z/ZAskBanner.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { import40Api, type Import40CaseDto } from '@/api/import40'
import { billingApi } from '@/api/billing'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { useImport40Status } from '@/composables/useImport40Status'
import { homeAttention } from '@/shell/attention'
import { allSections, buildClientNav, navAccessFromStore, sectionHref } from '@/shell/navModel'
import { NAV_ICONS } from '@/components/shell/navIcons'
import { TOTAL_STEPS, stepForStatus } from '@/utils/import40Steps'
import { formatMoney } from '@/ui/number'
import { cn } from '@/ui/cn'
import {
  activeShipments, clientAsks, clientGreetingName, dayMonth, shipmentTone, unpaidInvoices, type ClientAsk,
} from '@/views/home/clientHome'
import { greetingKey } from '@/views/home/greeting'
import { useBlock } from '@/views/home/useBlock'

// «Мои поставки» — Главная клиента (макет Client.dc): что нужно от клиента, поставки в работе, счёт к оплате.
// Клиенту только транзита — приветствие и ссылки в его разделы, без запросов Импорта 40.
const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const profileStore = useProfileStore()
const registration = useClientRegistration()
const { statusLabel } = useImport40Status()

const imp = auth.clientHasModule('import40')
const cases = useBlock(imp, () => import40Api.list())
const invoices = useBlock(imp, () => billingApi.list({ kind: 'invoice' }))
void cases.load()
void invoices.load()

const ids = { asks: useId(), ships: useId(), bill: useId(), go: useId() }

// ---- Шапка ----
const part = greetingKey(new Date().getHours())
const name = computed(() => clientGreetingName(profileStore.profile?.displayName, profileStore.profile?.companyName))
const greeting = computed(() =>
  name.value ? t(`home.greeting.${part}`, { name: name.value }) : t(`home.greeting.${part}NoName`))
const company = computed(() => profileStore.profile?.companyName?.trim() ?? '')

// Пока регистрация не завершена, сервер заявку не примет — кнопка выключена, подсказка объясняет почему.
const locked = computed(() => registration.loaded.value && !registration.complete.value)
const newShipment = () => router.push('/import-40?new=1')

// ---- Нужно от вас ----
const MAX_ASKS = 3
const asks = computed(() => clientAsks(cases.data ?? []))
const shownAsks = computed(() => asks.value.slice(0, MAX_ASKS))
watchEffect(() => {
  if (imp && cases.data) homeAttention.value = asks.value.length
})
const askDescription = (a: ClientAsk) =>
  a.kind === 'problem' ? a.message || a.cargo
  : a.kind === 'draft' ? a.message || t('clientHome.ask.draftText')
  : t('clientHome.ask.payCheckText')
// Черновик дописывается в мастере — он живёт на списке заявок и открывается по ?continueId.
const openAsk = (a: ClientAsk) =>
  router.push(a.kind === 'draft' ? { path: '/import-40', query: { continueId: a.caseId } } : `/import-40/${a.caseId}`)

// ---- Поставки в работе ----
const MAX_CARDS = 6
const active = computed(() => activeShipments(cases.data ?? []))
const cards = computed(() => active.value.slice(0, MAX_CARDS))
// Отменённые не в счёт: «Поставок пока нет» — только если клиент ещё ничего не оформлял.
const hasAny = computed(() => (cases.data ?? []).some((c) => c.status !== 9))
const segment = (c: Import40CaseDto, i: number) => {
  const step = stepForStatus(c.status)
  return i < step - 1 ? 'bg-zircon' : i === step - 1 ? (c.isProblem ? 'bg-danger' : 'bg-zircon-ink') : 'bg-line'
}
const CARD_SKELETON = [['62%', '38%'], ['48%', '44%']]

// ---- Счёт к оплате ----
const unpaid = computed(() => unpaidInvoices(invoices.data ?? []))
const invoice = computed(() => unpaid.value[0] ?? null)
const showBottom = computed(() => invoices.loading || invoices.error || !!invoice.value)

// ---- Клиент только транзита ----
const TRANSIT_KEYS = ['transit', 'kedenStatuses', 'documents']
const goSections = computed(() =>
  imp ? [] : allSections(buildClientNav(navAccessFromStore(auth, false))).filter((s) => TRANSIT_KEYS.includes(s.key)))

const grid = 'grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]'
const card = 'rounded-[16px] border border-line bg-surface px-5 py-[18px]'
const link = 'rounded-[4px] text-sm font-medium text-zircon-ink no-underline outline-hidden transition-colors duration-150 hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'
const cta = 'h-[42px] rounded-row px-[18px] text-[14.5px] max-sm:w-full'
</script>

<template>
  <div class="flex flex-col gap-[22px]">
    <div class="flex flex-wrap items-center gap-4">
      <div class="min-w-0">
        <h1 class="m-0 text-2xl font-semibold tracking-[-0.02em] text-ink">{{ greeting }}</h1>
        <div v-if="imp && cases.loading" class="mt-1.5" data-client-skeleton>
          <ZSkeleton width="220px" height="14px" />
        </div>
        <p v-else-if="company || active.length" class="m-0 mt-1 text-base text-ink-3">
          <template v-if="company">{{ company }}</template>
          <template v-if="company && active.length"> · </template>
          <template v-if="active.length">{{ t('clientHome.inWork', { n: active.length }) }}</template>
        </p>
      </div>
      <ZTooltip v-if="imp" :title="locked ? t('clientHome.newLocked') : ''">
        <span :tabindex="locked ? 0 : undefined" class="ml-auto inline-flex rounded-row outline-hidden focus-visible:shadow-focus max-sm:w-full">
          <ZButton variant="primary" :class="cta" :disabled="locked" data-client-new @click="newShipment">
            <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
            {{ t('clientHome.new') }}
          </ZButton>
        </span>
      </ZTooltip>
    </div>

    <template v-if="imp">
      <section v-if="shownAsks.length" :aria-labelledby="ids.asks" class="flex flex-col gap-2.5">
        <h2 :id="ids.asks" class="sr-only">{{ t('clientHome.ask.heading') }}</h2>
        <ZAskBanner
          v-for="a in shownAsks"
          :key="a.caseId"
          data-client-ask
          :title="t(`clientHome.ask.${a.kind}`, { number: a.number })"
          :description="askDescription(a)"
          :action-text="t(a.kind === 'draft' ? 'clientHome.ask.continue' : 'clientHome.ask.open')"
          @action="openAsk(a)"
        />
        <RouterLink v-if="asks.length > MAX_ASKS" to="/import-40" :class="cn(link, 'self-start')">
          {{ t('clientHome.ask.more', { n: asks.length - MAX_ASKS }) }}
        </RouterLink>
      </section>

      <section :aria-labelledby="ids.ships" :aria-busy="cases.loading || undefined" class="flex flex-col gap-3">
        <div class="flex items-baseline gap-3">
          <h2 :id="ids.ships" class="m-0 text-sm font-semibold text-ink-2">{{ t('clientHome.shipments') }}</h2>
          <RouterLink v-if="active.length > MAX_CARDS" to="/import-40" :class="cn(link, 'ml-auto')">{{ t('clientHome.all') }}</RouterLink>
        </div>

        <div v-if="cases.loading" :class="grid" data-client-skeleton>
          <div v-for="(w, i) in CARD_SKELETON" :key="i" :class="cn(card, 'flex flex-col gap-3')">
            <div class="flex items-start gap-2.5">
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <ZSkeleton :width="w[0]" height="16px" />
                <ZSkeleton :width="w[1]" height="12px" />
              </div>
              <ZSkeleton width="84px" height="24px" class="shrink-0" />
            </div>
            <ZSkeleton height="6px" />
            <ZSkeleton width="52%" height="12px" />
          </div>
        </div>

        <div v-else-if="cases.error" :class="cn(card, 'flex flex-wrap items-center gap-3 py-4')">
          <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('clientHome.loadError') }}</p>
          <ZButton size="sm" @click="cases.load()">{{ t('home.retry') }}</ZButton>
        </div>

        <div v-else-if="!cards.length" class="rounded-[16px] border border-dashed border-line-strong">
          <ZEmpty
            :title="hasAny ? t('clientHome.noActive') : t('clientHome.emptyTitle')"
            :hint="hasAny ? undefined : t('clientHome.emptyText')"
          >
            <template #action>
              <div class="flex flex-col items-center gap-3">
                <ZTooltip :title="locked ? t('clientHome.newLocked') : ''">
                  <span :tabindex="locked ? 0 : undefined" class="inline-flex rounded-row outline-hidden focus-visible:shadow-focus">
                    <ZButton variant="primary" :class="cta" :disabled="locked" data-client-new @click="newShipment">
                      <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
                      {{ t('clientHome.new') }}
                    </ZButton>
                  </span>
                </ZTooltip>
                <RouterLink v-if="hasAny" to="/import-40" :class="link">{{ t('clientHome.all') }}</RouterLink>
              </div>
            </template>
          </ZEmpty>
        </div>

        <div v-else :class="grid">
          <RouterLink
            v-for="c in cards"
            :key="c.id"
            :to="`/import-40/${c.id}`"
            data-client-shipment
            :class="cn(
              card,
              'flex flex-col gap-3 text-ink no-underline outline-hidden',
              'transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong hover:shadow-raised',
              'focus-visible:shadow-focus motion-reduce:transition-none',
            )"
          >
            <span class="flex items-start gap-2.5">
              <span class="min-w-0 flex-1">
                <span class="line-clamp-2 break-words text-md font-semibold">{{ c.cargo || c.number }}</span>
                <span class="mt-0.5 block truncate text-sm text-ink-3">
                  <span class="font-mono">{{ c.number }}</span><template v-if="c.post"> · {{ c.post }}</template>
                </span>
              </span>
              <ZTag :tone="shipmentTone(c)" class="shrink-0">{{ statusLabel(c.status) }}</ZTag>
            </span>
            <ol
              :aria-label="t('clientHome.stepOf', { n: stepForStatus(c.status), total: TOTAL_STEPS })"
              class="m-0 flex list-none gap-1 p-0"
            >
              <li v-for="i in TOTAL_STEPS" :key="i" :class="cn('h-1.5 flex-1 rounded-pill', segment(c, i - 1))" />
            </ol>
            <span class="text-sm text-ink-2">{{ t('enum.stepClient.s' + stepForStatus(c.status)) }}</span>
          </RouterLink>
        </div>
      </section>

      <div v-if="showBottom" :class="grid">
        <div v-if="invoices.loading" :class="cn(card, 'flex items-center gap-3.5')" data-client-skeleton>
          <div class="flex min-w-0 flex-1 flex-col gap-2.5">
            <ZSkeleton width="46%" height="12px" />
            <ZSkeleton width="38%" height="22px" />
          </div>
          <ZSkeleton width="96px" height="40px" class="shrink-0" />
        </div>
        <div v-else-if="invoices.error" :class="cn(card, 'flex flex-wrap items-center gap-3 py-4')">
          <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('clientHome.invoicesError') }}</p>
          <ZButton size="sm" @click="invoices.load()">{{ t('home.retry') }}</ZButton>
        </div>
        <section
          v-else-if="invoice"
          :aria-labelledby="ids.bill"
          data-client-invoice
          :class="cn(card, 'flex flex-wrap items-center gap-3.5')"
        >
          <div class="min-w-0 flex-1">
            <h2 :id="ids.bill" class="m-0 text-[13px] font-semibold text-ink-3">
              {{ t('clientHome.invoice', { number: invoice.number, date: dayMonth(invoice.issuedAtUtc ?? invoice.createdAtUtc) }) }}
            </h2>
            <p class="m-0 mt-1 text-xl font-semibold tabular-nums text-ink">{{ formatMoney(invoice.total) }}</p>
            <p v-if="invoice.caseNumber" class="m-0 mt-0.5 text-sm text-ink-3">
              {{ t('clientHome.invoiceFor', { number: invoice.caseNumber }) }}
            </p>
            <p v-if="unpaid.length > 1" class="m-0 mt-0.5 text-sm text-ink-3">
              {{ t('clientHome.moreInvoices', { n: unpaid.length - 1 }) }}
            </p>
          </div>
          <RouterLink
            to="/billing"
            class="inline-flex h-10 items-center justify-center rounded-row bg-navy px-[18px] text-base font-semibold text-white no-underline outline-hidden transition-colors duration-150 ease-out hover:bg-navy-hover focus-visible:shadow-focus motion-reduce:transition-none max-sm:w-full"
          >{{ t('clientHome.pay') }}</RouterLink>
        </section>
      </div>
    </template>

    <section v-else :aria-labelledby="ids.go" class="flex flex-col gap-2.5">
      <h2 :id="ids.go" class="m-0 text-sm font-semibold text-ink-2">{{ t('clientHome.goTo') }}</h2>
      <ul class="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))]">
        <li v-for="s in goSections" :key="s.key">
          <RouterLink
            :to="sectionHref(s)"
            class="group flex items-center gap-3 rounded-row border border-line bg-surface px-4 py-3.5 text-ink no-underline outline-hidden transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-ink-2">
              <component :is="NAV_ICONS[s.icon]" :size="18" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1 truncate text-md font-semibold">{{ t(s.labelKey) }}</span>
            <PhArrowRight :size="15" aria-hidden="true" class="shrink-0 text-faint transition-colors duration-150 group-hover:text-ink-2" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
