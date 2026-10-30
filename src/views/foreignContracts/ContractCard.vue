<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhArrowLeft, PhFileXls, PhPencilSimple, PhPlus, PhTrash, PhWarning } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import {
  foreignContractsApi, type ContractPaymentFields, type ForeignContractCard, type ForeignContractFields,
} from '@/api/foreignContracts'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'
import { countryName } from '@/utils/countries'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import ContractModal from './ContractModal.vue'
import PaymentModal from './PaymentModal.vue'
import { DEADLINE_TONE, day, deadlineHint, deliveredPercent, fieldsOf, money } from './contracts'

// Карточка внешнеторгового контракта (17.10, задача 3): условия, баланс «оплачено / поставлено» в валюте контракта,
// сроки (репатриация, окончание, снятие УНК), поставки по ДТ (курс НБ РК на дату ДТ), оплаты поставщику, Excel.
// Общая для клиента (/contracts/:id) и сотрудника (/clients/:client/contracts/:id); readonly — без правки.
const props = withDefaults(defineProps<{
  clientId: string
  contractId: string
  /** null — «Назад» по истории браузера. */
  backTo: string | null
  /** Подпись ссылки «Назад» (по умолчанию «Все контракты»): из заявки — «К заявке» (30.10.2026, аудит S-6/C-15). */
  backLabel?: string
  readonly?: boolean
  /** Ссылка на ДТ (сотруднику); у клиента — только на поставку. */
  dtLinks?: boolean
}>(), { backLabel: undefined, readonly: false, dtLinks: false })
const { t, locale } = useI18n()
const { confirm } = useConfirm()
const router = useRouter()

const card = shallowRef<ForeignContractCard | null>(null)
const state = ref<'loading' | 'error' | 'notFound' | 'ready'>('loading')
let seq = 0
const load = async () => {
  const my = ++seq
  if (!card.value) state.value = 'loading'
  try {
    const res = await foreignContractsApi.card(props.clientId, props.contractId)
    if (my !== seq) return
    card.value = res
    state.value = 'ready'
  } catch (e) {
    if (my !== seq) return
    const code = (e as { response?: { status?: number } })?.response?.status
    state.value = code === 404 ? 'notFound' : 'error'
  }
}
watch(() => [props.clientId, props.contractId], () => { card.value = null; void load() }, { immediate: true })

const countries = shallowRef<RefCodeItem[]>([])
void referencesApi.listCountries({ silent: true }).then((c) => { countries.value = c }).catch(() => { /* страна — кодом */ })

const c = computed(() => card.value?.contract ?? null)
const editable = computed(() => !props.readonly && !!c.value && !c.value.isArchived)
const m = (n: number | null | undefined, cur?: string | null) => money(locale.value, n, cur ?? c.value?.currency)

const details = computed(() => {
  const x = c.value
  if (!x) return []
  return [
    { key: 'supplier', label: t('foreignContracts.field.supplierName'), value: x.supplierName },
    { key: 'country', label: t('foreignContracts.field.supplierCountry'), value: countryName(x.supplierCountryCode, countries.value) || x.supplierCountryCode },
    { key: 'amount', label: t('foreignContracts.field.amount'), value: m(x.amount) },
    { key: 'validUntil', label: t('foreignContracts.field.validUntil'), value: x.validUntil ? day(x.validUntil) : t('foreignContracts.unlimited') },
    { key: 'incoterms', label: t('foreignContracts.field.incoterms'), value: [x.incoterms, x.incotermsPlace].filter(Boolean).join(' ') || '—' },
    { key: 'paymentTerms', label: t('foreignContracts.field.paymentTerms'), value: x.paymentTerms || '—' },
    { key: 'unk', label: t('foreignContracts.field.unkNumber'), value: x.unkNumber ? `${x.unkNumber}${x.unkDate ? ` ${t('foreignContracts.from', { date: day(x.unkDate) })}` : ''}` : t('foreignContracts.noUnk') },
    ...(x.unkNumber ? [{ key: 'unkBank', label: t('foreignContracts.field.unkBank'), value: x.unkBank || '—' }] : []),
    ...(x.unkRemovedOn ? [{ key: 'unkRemovedOn', label: t('foreignContracts.field.unkRemovedOn'), value: day(x.unkRemovedOn) }] : []),
    { key: 'contractDoc', label: t('foreignContracts.field.contractDocument'), value: x.contractDocument ? docRef(x.contractDocument) : '—' },
    ...(x.unkNumber ? [{ key: 'unkDoc', label: t('foreignContracts.field.unkDocument'), value: x.unkDocument ? docRef(x.unkDocument) : '—' }] : []),
  ]
})
const docRef = (d: { number: string; issuedOn: string | null; isArchived: boolean; fileCount: number }) =>
  `${d.number}${d.issuedOn ? ` · ${day(d.issuedOn)}` : ''} · ${t('foreignContracts.form.files', { n: d.fileCount })}${d.isArchived ? ` · ${t('foreignContracts.archivedTag')}` : ''}`

const balanceRows = computed(() => {
  const b = c.value?.balance
  if (!b) return []
  return [
    { key: 'delivered', label: t('foreignContracts.balance.delivered'), value: b.delivered },
    { key: 'inProgress', label: t('foreignContracts.balance.inProgress'), value: b.inProgress },
    { key: 'remaining', label: t('foreignContracts.balance.remaining'), value: b.remaining, strong: true, bad: b.remaining < 0 },
    { key: 'paid', label: t('foreignContracts.balance.paid'), value: b.paid },
    { key: 'paidNotDelivered', label: t('foreignContracts.balance.paidNotDelivered'), value: b.paidNotDelivered, strong: true, bad: b.paidNotDelivered > 0 },
  ]
})

// ---- Правка, оплаты, архив, Excel ----
const editOpen = ref(false)
const editInitial = shallowRef<ForeignContractFields | null>(null)
const openEdit = () => { if (c.value) { editInitial.value = fieldsOf(c.value); editOpen.value = true } }
const saveEdit = async (fields: ForeignContractFields) => {
  card.value = await foreignContractsApi.update(props.clientId, props.contractId, fields)
  message.success(t('foreignContracts.saved'))
}
const payOpen = ref(false)
const paymentCurrencies = computed(() => [...new Set((card.value?.shipments ?? []).map((s) => s.currency).filter((x): x is string => !!x))])
const savePayment = async (fields: ContractPaymentFields) => {
  card.value = await foreignContractsApi.addPayment(props.clientId, props.contractId, fields)
  message.success(t('foreignContracts.payment.added'))
}
const busy = ref(false)
const removePayment = async (id: string) => {
  const ok = await confirm({
    title: t('foreignContracts.payment.deleteTitle'),
    content: t('foreignContracts.payment.deleteText'),
    okText: t('foreignContracts.payment.delete'),
    cancelText: t('foreignContracts.form.cancel'),
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    card.value = await foreignContractsApi.deletePayment(props.clientId, props.contractId, id)
  } catch { /* общий перехватчик */ } finally { busy.value = false }
}
const toggleArchive = async () => {
  const x = c.value
  if (!x) return
  if (!x.isArchived) {
    const ok = await confirm({
      title: t('foreignContracts.archiveTitle', { n: x.number }),
      content: t('foreignContracts.archiveText'),
      okText: t('foreignContracts.archive'),
      cancelText: t('foreignContracts.form.cancel'),
    })
    if (!ok) return
  }
  busy.value = true
  try {
    card.value = x.isArchived
      ? await foreignContractsApi.restore(props.clientId, props.contractId)
      : await foreignContractsApi.archive(props.clientId, props.contractId)
    message.success(t(card.value.contract.isArchived ? 'foreignContracts.archived' : 'foreignContracts.restored'))
  } catch { /* общий перехватчик */ } finally { busy.value = false }
}
const exporting = ref(false)
const exportXlsx = async () => {
  exporting.value = true
  try {
    const { blob, fileName } = await foreignContractsApi.xlsx(props.clientId, props.contractId, locale.value)
    saveBlob(blob, fileName)
  } catch { /* общий перехватчик */ } finally { exporting.value = false }
}

const caseHref = (caseId: string, dtId: string) =>
  props.dtLinks ? `/import-40/${encodeURIComponent(caseId)}/dt/${encodeURIComponent(dtId)}` : `/import-40/${encodeURIComponent(caseId)}`
const ruleKind = (rule: string) => rule.replace('contract-', '') === 'unk-removal' ? 'unkRemoval' : rule.replace('contract-', '')
const sentAt = (iso: string) => new Date(iso).toLocaleString(locale.value === 'en' ? 'en-GB' : locale.value === 'kk' ? 'kk-KZ' : 'ru-RU',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' })

const backClass = 'inline-flex min-h-11 w-fit items-center gap-1 rounded-[4px] text-sm font-medium text-zircon-ink no-underline outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-6'
const panel = 'flex flex-col gap-3 rounded-panel border border-line bg-surface px-6 py-[18px] max-sm:px-4'
const h2 = 'm-0 text-md font-semibold text-ink'
</script>

<template>
  <div class="flex flex-col gap-4" data-contract-card>
    <RouterLink v-if="backTo" :to="backTo" :class="backClass" data-contract-back>
      <PhArrowLeft :size="14" aria-hidden="true" />{{ backLabel ?? t('foreignContracts.back') }}
    </RouterLink>
    <button v-else type="button" :class="[backClass, 'cursor-pointer border-0 bg-transparent p-0 font-sans']" data-contract-back @click="router.back()">
      <PhArrowLeft :size="14" aria-hidden="true" />{{ t('foreignContracts.backHistory') }}
    </button>

    <div v-if="state === 'loading'" class="flex flex-col gap-3" aria-busy="true" data-contract-skeleton>
      <ZSkeleton height="40px" /><ZSkeleton height="160px" /><ZSkeleton height="120px" />
    </div>
    <ZEmpty v-else-if="state === 'notFound'" :title="t('foreignContracts.notFound')" data-contract-not-found />
    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-3 rounded-row border border-line px-4 py-3" role="alert" data-contract-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('foreignContracts.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" @click="load">{{ t('foreignContracts.retry') }}</ZButton>
    </div>

    <template v-else-if="card && c">
      <header class="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-72">
          <h1 class="m-0 text-[24px] leading-8 font-semibold tracking-[-0.02em] break-words text-ink" data-contract-title>
            {{ t('foreignContracts.numberFrom', { n: c.number, date: day(c.contractDate) }) }}
          </h1>
          <p class="m-0 mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <span class="min-w-0 break-words">{{ c.supplierName }}</span>
            <ZTag v-if="c.isArchived" tone="neutral" size="sm" data-contract-archived>{{ t('foreignContracts.archivedTag') }}</ZTag>
            <span class="text-xs text-muted">{{ t(c.addedByClient ? 'foreignContracts.addedByClient' : 'foreignContracts.addedByStaff') }}</span>
          </p>
        </div>
        <div class="flex w-full flex-wrap gap-2 sm:w-auto">
          <ZButton v-if="editable" class="max-sm:h-11 max-sm:flex-1" data-contract-edit @click="openEdit">
            <template #icon><PhPencilSimple :size="16" aria-hidden="true" /></template>{{ t('foreignContracts.edit') }}
          </ZButton>
          <ZButton :loading="exporting" class="max-sm:h-11 max-sm:flex-1" data-contract-xlsx @click="exportXlsx">
            <template #icon><PhFileXls :size="16" aria-hidden="true" /></template>{{ t('foreignContracts.excel') }}
          </ZButton>
          <ZButton v-if="!readonly" :disabled="busy" class="max-sm:h-11 max-sm:flex-1" data-contract-archive @click="toggleArchive">
            <template #icon><PhArchive :size="16" aria-hidden="true" /></template>{{ t(c.isArchived ? 'foreignContracts.restore' : 'foreignContracts.archive') }}
          </ZButton>
        </div>
      </header>

      <!-- Сроки -->
      <section v-if="c.deadlines.length" :class="panel" aria-labelledby="contract-deadlines" data-contract-deadlines>
        <h2 id="contract-deadlines" :class="h2">{{ t('foreignContracts.deadlinesTitle') }}</h2>
        <ul role="list" class="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3">
          <li v-for="d in c.deadlines" :key="d.kind" class="flex flex-col gap-1 rounded-row border border-solid border-line px-3.5 py-2.5" :data-deadline="d.kind" :data-state="d.state">
            <span class="text-[13px] text-ink-3">{{ t(`foreignContracts.deadline.${d.kind}`) }}</span>
            <span class="text-[15px] font-semibold text-ink tabular-nums">{{ day(d.date) }}</span>
            <ZTag :tone="DEADLINE_TONE[d.state]" size="sm" class="w-fit">{{ deadlineHint(d, t) }}</ZTag>
          </li>
        </ul>
        <p v-if="c.deadlines.some((d) => d.kind === 'repatriation' && d.state !== 'done')" class="m-0 text-[13px] text-ink-3">{{ t('foreignContracts.repatriationHint') }}</p>
      </section>

      <!-- Баланс -->
      <section :class="panel" aria-labelledby="contract-balance" data-contract-balance>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="contract-balance" :class="h2">{{ t('foreignContracts.balanceTitle') }}</h2>
          <span class="text-sm text-ink-3 tabular-nums">{{ t('foreignContracts.ofAmount', { amount: m(c.amount) }) }}</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" :aria-valuenow="deliveredPercent(c)" aria-valuemin="0" aria-valuemax="100" :aria-label="t('foreignContracts.deliveredPct', { n: deliveredPercent(c) })">
          <div class="h-full rounded-full bg-zircon" :style="{ width: `${deliveredPercent(c)}%` }" />
        </div>
        <dl class="m-0 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <div v-for="r in balanceRows" :key="r.key" class="flex items-baseline justify-between gap-3 border-0 border-b border-dashed border-line py-1" :data-balance="r.key">
            <dt class="text-sm text-ink-3">{{ r.label }}</dt>
            <dd :class="cn('m-0 text-right text-sm tabular-nums', r.strong ? 'font-semibold' : '', r.bad ? 'text-tone-danger-fg' : 'text-ink')">{{ m(r.value) }}</dd>
          </div>
        </dl>
        <p v-if="c.balance.ratesMissing" class="m-0 flex items-start gap-1.5 text-[13px] text-gold-ink" data-balance-missing>
          <PhWarning :size="15" class="mt-0.5 shrink-0" aria-hidden="true" />{{ t('foreignContracts.ratesMissing') }}
        </p>
        <p v-else-if="c.balance.ratesApproximate" class="m-0 text-[13px] text-ink-3" data-balance-approx>{{ t('foreignContracts.ratesApproximate') }}</p>
        <p class="m-0 text-[13px] text-muted">{{ t('foreignContracts.balanceHint') }}</p>
      </section>

      <!-- Условия -->
      <section :class="panel" aria-labelledby="contract-terms" data-contract-terms>
        <h2 id="contract-terms" :class="h2">{{ t('foreignContracts.termsTitle') }}</h2>
        <dl class="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div v-for="r in details" :key="r.key" class="flex min-w-0 flex-col" :data-term="r.key">
            <dt class="text-xs text-muted">{{ r.label }}</dt>
            <dd class="m-0 text-sm break-words text-ink">{{ r.value }}</dd>
          </div>
        </dl>
        <p v-if="c.note" class="m-0 text-sm break-words text-ink-2">{{ c.note }}</p>
      </section>

      <!-- Поставки -->
      <section :class="panel" aria-labelledby="contract-shipments" data-contract-shipments>
        <h2 id="contract-shipments" :class="h2">{{ t('foreignContracts.shipmentsTitle', { n: card.shipments.length }) }}</h2>
        <p v-if="!card.shipments.length" class="m-0 text-sm text-ink-3">{{ t('foreignContracts.noShipments') }}</p>
        <ul v-else role="list" class="m-0 list-none rounded-row border border-solid border-line p-0">
          <li v-for="(s, i) in card.shipments" :key="s.declarationId" :class="cn('flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4', i > 0 && 'border-0 border-t border-solid border-line')" :data-shipment="s.declarationId">
            <div class="min-w-0 flex-1">
              <RouterLink :to="caseHref(s.caseId, s.declarationId)" class="text-sm font-semibold break-words text-zircon-ink no-underline outline-hidden hover:text-ink focus-visible:shadow-focus">
                {{ s.declarationNumber || t('foreignContracts.dtNoNumber') }}
              </RouterLink>
              <span class="block text-xs text-muted">{{ t('foreignContracts.shipmentCase', { n: s.caseNumber, date: day(s.dtDate) }) }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end sm:text-right">
              <ZTag :tone="s.released ? 'done' : 'wait'" size="sm">{{ t(s.released ? 'foreignContracts.released' : 'foreignContracts.inProgress') }}</ZTag>
              <span class="flex flex-col text-sm tabular-nums sm:items-end">
                <span class="font-semibold text-ink">{{ s.amountInContractCurrency != null ? m(s.amountInContractCurrency) : t('foreignContracts.noValue') }}</span>
                <span v-if="s.currency && s.currency !== c.currency && s.invoiceValue != null" class="text-xs text-muted">
                  {{ m(s.invoiceValue, s.currency) }}<template v-if="s.rate"> × {{ s.rate.toFixed(4) }}</template>
                </span>
              </span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Оплаты -->
      <section :class="panel" aria-labelledby="contract-payments" data-contract-payments>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="contract-payments" :class="h2">{{ t('foreignContracts.paymentsTitle', { n: card.payments.length }) }}</h2>
          <ZButton v-if="editable" size="sm" class="max-sm:h-11 max-sm:w-full" data-payment-add @click="payOpen = true">
            <template #icon><PhPlus :size="14" aria-hidden="true" /></template>{{ t('foreignContracts.payment.add') }}
          </ZButton>
        </div>
        <p v-if="!card.payments.length" class="m-0 text-sm text-ink-3">{{ t('foreignContracts.noPayments') }}</p>
        <ul v-else role="list" class="m-0 list-none rounded-row border border-solid border-line p-0">
          <li v-for="(p, i) in card.payments" :key="p.id" :class="cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-0 border-t border-solid border-line')" :data-payment="p.id">
            <div class="min-w-0 flex-1">
              <span class="block text-sm text-ink tabular-nums">{{ day(p.paidOn) }}</span>
              <span v-if="p.note" class="block text-xs break-words text-muted">{{ p.note }}</span>
            </div>
            <span class="flex flex-col text-right text-sm tabular-nums">
              <span class="font-semibold text-ink">{{ m(p.amount, p.currency) }}</span>
              <span v-if="p.currency !== c.currency" class="text-xs text-muted">{{ p.amountInContractCurrency != null ? `≈ ${m(p.amountInContractCurrency)}` : t('foreignContracts.noRate') }}</span>
            </span>
            <button
              v-if="editable"
              type="button"
              class="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 outline-hidden hover:text-danger focus-visible:shadow-focus disabled:cursor-progress sm:min-h-8 sm:min-w-8"
              :disabled="busy"
              :aria-label="t('foreignContracts.payment.deleteLabel', { date: day(p.paidOn) })"
              data-payment-delete
              @click="removePayment(p.id)"
            ><PhTrash :size="15" aria-hidden="true" /></button>
          </li>
        </ul>
      </section>

      <!-- Отправленные напоминания -->
      <section v-if="card.reminders.length" :class="panel" aria-labelledby="contract-reminders" data-contract-reminders>
        <h2 id="contract-reminders" :class="h2">{{ t('foreignContracts.remindersTitle') }}</h2>
        <ul role="list" class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="r in card.reminders" :key="`${r.rule}-${r.deadline}-${r.threshold}`" class="text-[13px] text-ink-2">
            {{ t('foreignContracts.reminderLine', { kind: t(`foreignContracts.deadline.${ruleKind(r.rule)}`), date: day(r.deadline), at: sentAt(r.sentAtUtc) }) }}
          </li>
        </ul>
      </section>

      <ContractModal v-model:open="editOpen" mode="edit" :client-id="clientId" :initial="editInitial" :save="saveEdit" />
      <PaymentModal v-model:open="payOpen" :contract-currency="c.currency" :currencies="paymentCurrencies" :save="savePayment" />
    </template>
  </div>
</template>
