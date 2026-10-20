<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhArrowLeft, PhDownloadSimple, PhPencilSimple, PhPlus, PhTrash, PhWarning } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { carriersApi, type CarrierCard, type CarrierFields, type CarrierInvoice, type CarrierInvoiceFields } from '@/api/carriers'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'
import { countryName } from '@/utils/countries'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { formatMoneyIn, formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { formatDay } from '@/views/broker/list'
import CarrierModal from './CarrierModal.vue'
import InvoiceModal from './InvoiceModal.vue'
import { CONTRACT_TONE, KZ_CODE, carrierFieldsOf, invoiceFieldsOf, invoiceTotals } from './carriers'
import { contractHint } from './contractHint'

// Карточка перевозчика клиента (очередь 4, задача 2): реквизиты и контакты, договор перевозки (из реестра документов,
// срок и статус), счета перевозчика (фрахт) — сумма в валюте и ≈ в тенге по курсу НБ РК на дату счёта, оплачен или нет,
// поставка, файл. Общая для клиента (/carriers/:id) и сотрудника (/clients/:client/carriers/:id); readonly — без правки.
const props = withDefaults(defineProps<{
  clientId: string
  carrierId: string
  /** null — «Назад» по истории браузера. */
  backTo: string | null
  readonly?: boolean
  /** Ссылка на поставку: клиенту — /import-40/:id (его поставка), сотруднику — карточка заявки (тот же путь). */
  caseHref?: (caseId: string) => string
}>(), { readonly: false, caseHref: (id: string) => `/import-40/${encodeURIComponent(id)}` })
const { t, locale } = useI18n()
const { confirm } = useConfirm()
const router = useRouter()

const card = shallowRef<CarrierCard | null>(null)
const state = ref<'loading' | 'error' | 'notFound' | 'ready'>('loading')
let seq = 0
const load = async () => {
  const my = ++seq
  if (!card.value) state.value = 'loading'
  try {
    const res = await carriersApi.card(props.clientId, props.carrierId)
    if (my !== seq) return
    card.value = res
    state.value = 'ready'
  } catch (e) {
    if (my !== seq) return
    const code = (e as { response?: { status?: number } })?.response?.status
    state.value = code === 404 ? 'notFound' : 'error'
  }
}
watch(() => [props.clientId, props.carrierId], () => { card.value = null; void load() }, { immediate: true })

const countries = shallowRef<RefCodeItem[]>([])
void referencesApi.listCountries({ silent: true }).then((c) => { countries.value = c }).catch(() => { /* страна — кодом */ })

const c = computed(() => card.value?.carrier ?? null)
const editable = computed(() => !props.readonly && !!c.value && !c.value.isArchived)
const money = (n: number, cur: string) => `${formatNumberIn(locale.value, n, 2, 2)} ${cur}`
const kzt = (n: number) => formatMoneyIn(locale.value, n)

const details = computed(() => {
  const x = c.value
  if (!x) return []
  return [
    { key: 'country', label: t('carriers.field.country'), value: countryName(x.countryCode, countries.value) || x.countryCode },
    { key: 'reg', label: t(x.countryCode === KZ_CODE ? 'carriers.field.bin' : 'carriers.field.regNumber'), value: x.regNumber || '—', mono: !!x.regNumber },
    { key: 'contact', label: t('carriers.field.contactName'), value: x.contactName || '—' },
    { key: 'phone', label: t('carriers.field.phone'), value: x.phone || '—' },
    { key: 'email', label: t('carriers.field.email'), value: x.email || '—' },
    { key: 'address', label: t('carriers.field.address'), value: x.address || '—' },
  ]
})
const totals = computed(() => invoiceTotals(card.value?.invoices ?? []))

// ---- Перевозчик: правка и архив ----
const editOpen = ref(false)
const editInitial = shallowRef<CarrierFields | null>(null)
const openEdit = () => { if (c.value) { editInitial.value = carrierFieldsOf(c.value); editOpen.value = true } }
const saveEdit = async (fields: CarrierFields) => {
  card.value = await carriersApi.update(props.clientId, props.carrierId, fields)
  message.success(t('carriers.saved'))
}
const busy = ref<string | null>(null)
const toggleArchive = async () => {
  const x = c.value
  if (!x) return
  if (!x.isArchived) {
    const ok = await confirm({
      title: t('carriers.archiveTitle', { name: x.name }),
      content: t('carriers.archiveText'),
      okText: t('carriers.archive'),
      cancelText: t('carriers.form.cancel'),
    })
    if (!ok) return
  }
  busy.value = 'archive'
  try {
    card.value = x.isArchived
      ? await carriersApi.restore(props.clientId, props.carrierId)
      : await carriersApi.archive(props.clientId, props.carrierId)
    message.success(t(card.value.carrier.isArchived ? 'carriers.archived' : 'carriers.restored'))
  } catch { /* общий перехватчик */ } finally { busy.value = null }
}

// ---- Счета ----
const invOpen = ref(false)
const invMode = ref<'create' | 'edit'>('create')
const invInitial = shallowRef<CarrierInvoiceFields | null>(null)
const invEditing = ref<string | null>(null)
// Поставка, уже привязанная к счёту: в выборе — её номер, даже если её нет в списке (отменена или старше 300 последних).
const invCase = shallowRef<{ id: string; number: string } | null>(null)
const openAddInvoice = () => { invMode.value = 'create'; invInitial.value = null; invEditing.value = null; invCase.value = null; invOpen.value = true }
const openEditInvoice = (i: CarrierInvoice) => {
  invMode.value = 'edit'; invInitial.value = invoiceFieldsOf(i); invEditing.value = i.id
  invCase.value = i.caseId ? { id: i.caseId, number: i.caseNumber ?? '' } : null
  invOpen.value = true
}
const saveInvoice = async (fields: CarrierInvoiceFields, file: File | null) => {
  card.value = invMode.value === 'edit' && invEditing.value
    ? await carriersApi.updateInvoice(props.clientId, props.carrierId, invEditing.value, fields)
    : await carriersApi.addInvoice(props.clientId, props.carrierId, fields, file)
  message.success(t(invMode.value === 'edit' ? 'carriers.invoice.saved' : 'carriers.invoice.added'))
}
const removeInvoice = async (i: CarrierInvoice) => {
  const ok = await confirm({
    title: t('carriers.invoice.deleteTitle', { n: i.number }),
    content: t('carriers.invoice.deleteText'),
    okText: t('carriers.invoice.delete'),
    cancelText: t('carriers.form.cancel'),
    danger: true,
  })
  if (!ok) return
  busy.value = i.id
  try {
    card.value = await carriersApi.deleteInvoice(props.clientId, props.carrierId, i.id)
  } catch { /* общий перехватчик */ } finally { busy.value = null }
}
const replaceFile = async (i: CarrierInvoice, file: File) => {
  busy.value = i.id
  try {
    card.value = await carriersApi.replaceInvoiceFile(props.clientId, props.carrierId, i.id, file)
    message.success(t('carriers.invoice.fileSaved'))
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
    if (res?.status === 400) message.error(res.data?.error || t('carriers.saveError'))
  } finally { busy.value = null }
}
const download = async (i: CarrierInvoice) => {
  if (!i.file) return
  busy.value = i.id
  try {
    saveBlob(await carriersApi.invoiceFile(props.clientId, props.carrierId, i.id), i.file.fileName)
  } catch { /* общий перехватчик */ } finally { busy.value = null }
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const backClass = 'inline-flex min-h-11 w-fit items-center gap-1 rounded-[4px] text-sm font-medium text-zircon-ink no-underline outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-6'
const panel = 'flex flex-col gap-3 rounded-panel border border-line bg-surface px-6 py-[18px] max-sm:px-4'
const h2 = 'm-0 text-md font-semibold text-ink'
const iconBtn = 'inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-ink-3 outline-hidden hover:text-ink focus-visible:shadow-focus disabled:cursor-progress sm:min-h-8 sm:min-w-8'
</script>

<template>
  <div class="flex flex-col gap-4" data-carrier-card>
    <RouterLink v-if="backTo" :to="backTo" :class="backClass" data-carrier-back>
      <PhArrowLeft :size="14" aria-hidden="true" />{{ t('carriers.back') }}
    </RouterLink>
    <button v-else type="button" :class="[backClass, 'cursor-pointer border-0 bg-transparent p-0 font-sans']" data-carrier-back @click="router.back()">
      <PhArrowLeft :size="14" aria-hidden="true" />{{ t('carriers.backHistory') }}
    </button>

    <div v-if="state === 'loading'" class="flex flex-col gap-3" aria-busy="true" data-carrier-skeleton>
      <ZSkeleton height="40px" /><ZSkeleton height="140px" /><ZSkeleton height="120px" />
    </div>
    <ZEmpty v-else-if="state === 'notFound'" :title="t('carriers.notFound')" data-carrier-not-found />
    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-3 rounded-row border border-line px-4 py-3" role="alert" data-carrier-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('carriers.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" @click="load">{{ t('carriers.retry') }}</ZButton>
    </div>

    <template v-else-if="card && c">
      <header class="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-72">
          <h1 class="m-0 text-[24px] leading-8 font-semibold tracking-[-0.02em] break-words text-ink" data-carrier-title>{{ c.name }}</h1>
          <p class="m-0 mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <ZTag v-if="c.isArchived" tone="neutral" size="sm" data-carrier-archived>{{ t('carriers.archivedTag') }}</ZTag>
            <span class="text-xs text-muted">{{ t(c.addedByClient ? 'carriers.addedByClient' : 'carriers.addedByStaff') }}</span>
          </p>
        </div>
        <div class="flex w-full flex-wrap gap-2 sm:w-auto">
          <ZButton v-if="editable" class="max-sm:h-11 max-sm:flex-1" data-carrier-edit @click="openEdit">
            <template #icon><PhPencilSimple :size="16" aria-hidden="true" /></template>{{ t('carriers.edit') }}
          </ZButton>
          <ZButton v-if="!readonly" :disabled="!!busy" class="max-sm:h-11 max-sm:flex-1" data-carrier-archive @click="toggleArchive">
            <template #icon><PhArchive :size="16" aria-hidden="true" /></template>{{ t(c.isArchived ? 'carriers.restore' : 'carriers.archive') }}
          </ZButton>
        </div>
      </header>

      <!-- Реквизиты и договор -->
      <section :class="panel" aria-labelledby="carrier-details" data-carrier-details>
        <h2 id="carrier-details" :class="h2">{{ t('carriers.detailsTitle') }}</h2>
        <dl class="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div v-for="r in details" :key="r.key" class="flex min-w-0 flex-col" :data-detail="r.key">
            <dt class="text-xs text-muted">{{ r.label }}</dt>
            <dd :class="cn('m-0 text-sm break-words text-ink', r.mono && 'font-mono')">{{ r.value }}</dd>
          </div>
          <div class="flex min-w-0 flex-col sm:col-span-2" data-detail="contract">
            <dt class="text-xs text-muted">{{ t('carriers.field.contract') }}</dt>
            <dd class="m-0 flex flex-wrap items-center gap-2 text-sm text-ink">
              <template v-if="c.contractDocument">
                <span class="break-words">{{ c.contractDocument.number || c.contractDocument.title || '—' }}</span>
                <ZTag :tone="CONTRACT_TONE[c.contractDocument.status]" size="sm" data-carrier-contract-status>{{ contractHint(c.contractDocument, t) }}</ZTag>
                <span class="text-xs text-muted">{{ t('carriers.contractInRegistry', { n: c.contractDocument.fileCount }) }}</span>
              </template>
              <span v-else class="text-ink-3">{{ t('carriers.noContract') }}</span>
            </dd>
          </div>
        </dl>
        <p v-if="c.note" class="m-0 text-sm break-words text-ink-2">{{ c.note }}</p>
      </section>

      <!-- Счета перевозчика -->
      <section :class="panel" aria-labelledby="carrier-invoices" data-carrier-invoices>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="carrier-invoices" :class="h2">{{ t('carriers.invoice.title', { n: card.invoices.length }) }}</h2>
          <ZButton v-if="editable" size="sm" class="max-sm:h-11 max-sm:w-full" data-invoice-add @click="openAddInvoice">
            <template #icon><PhPlus :size="14" aria-hidden="true" /></template>{{ t('carriers.invoice.add') }}
          </ZButton>
        </div>
        <p class="m-0 text-[13px] text-ink-3">{{ t('carriers.invoice.hint') }}</p>
        <p v-if="!card.invoices.length" class="m-0 text-sm text-ink-3" data-invoices-empty>{{ t('carriers.invoice.empty') }}</p>
        <template v-else>
          <p class="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2 tabular-nums" data-invoice-totals>
            <span>{{ t('carriers.invoice.total', { sum: kzt(totals.totalKzt) }) }}</span>
            <span v-if="totals.unpaidKzt" class="text-gold-ink">{{ t('carriers.invoice.unpaidTotal', { sum: kzt(totals.unpaidKzt) }) }}</span>
          </p>
          <ul role="list" class="m-0 list-none rounded-row border border-solid border-line p-0">
            <li
              v-for="(i, idx) in card.invoices"
              :key="i.id"
              :class="cn('flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3', idx > 0 && 'border-0 border-t border-solid border-line')"
              :data-invoice="i.id"
            >
              <div class="min-w-0 flex-1">
                <p class="m-0 flex flex-wrap items-center gap-2">
                  <span class="text-sm font-semibold break-words text-ink">{{ t('carriers.invoice.numberFrom', { n: i.number, date: formatDay(i.invoiceDate) }) }}</span>
                  <ZTag :tone="i.isPaid ? 'done' : 'wait'" size="sm" data-invoice-status>
                    {{ i.isPaid ? (i.paidOn ? t('carriers.invoice.paidOnTag', { date: formatDay(i.paidOn) }) : t('carriers.invoice.paidTag')) : t('carriers.invoice.unpaidTag') }}
                  </ZTag>
                </p>
                <p class="m-0 mt-0.5 text-xs break-words text-muted">
                  <RouterLink v-if="i.caseId" :to="caseHref(i.caseId)" class="text-zircon-ink no-underline hover:underline focus-visible:shadow-focus" data-invoice-case>
                    {{ t('carriers.invoice.forCase', { n: i.caseNumber ?? '—' }) }}
                  </RouterLink>
                  <span v-else>{{ t('carriers.invoice.noCaseShort') }}</span>
                  <template v-if="i.note"> · {{ i.note }}</template>
                </p>
              </div>
              <div class="flex items-center gap-1 sm:justify-end">
                <span class="mr-auto flex flex-col text-sm tabular-nums sm:mr-2 sm:items-end">
                  <span class="font-semibold text-ink">{{ money(i.amount, i.currency) }}</span>
                  <span v-if="i.currency !== 'KZT'" class="text-xs text-muted" data-invoice-kzt>
                    <template v-if="i.amountKzt != null">≈ {{ kzt(i.amountKzt) }}</template>
                    <span v-else class="inline-flex items-center gap-1 text-gold-ink"><PhWarning :size="12" aria-hidden="true" />{{ t('carriers.invoice.noRate') }}</span>
                  </span>
                </span>
                <button
                  v-if="i.file"
                  type="button"
                  :class="iconBtn"
                  :disabled="busy === i.id"
                  :aria-label="t('carriers.invoice.download', { name: i.file.fileName })"
                  data-invoice-download
                  @click="download(i)"
                ><PhDownloadSimple :size="16" aria-hidden="true" /></button>
                <ZUpload
                  v-if="editable"
                  :accept="ACCEPT"
                  :max-size-mb="25"
                  :loading="busy === i.id"
                  button-variant="ghost"
                  button-size="sm"
                  :aria-label="t(i.file ? 'carriers.invoice.replaceFile' : 'carriers.invoice.attachFile', { n: i.number })"
                  data-invoice-upload
                  @select="$event[0] && replaceFile(i, $event[0])"
                >{{ t(i.file ? 'carriers.invoice.replaceShort' : 'carriers.invoice.attachShort') }}</ZUpload>
                <button
                  v-if="editable"
                  type="button"
                  :class="iconBtn"
                  :aria-label="t('carriers.invoice.editLabel', { n: i.number })"
                  data-invoice-edit
                  @click="openEditInvoice(i)"
                ><PhPencilSimple :size="15" aria-hidden="true" /></button>
                <button
                  v-if="editable"
                  type="button"
                  :class="cn(iconBtn, 'hover:text-danger')"
                  :disabled="busy === i.id"
                  :aria-label="t('carriers.invoice.deleteLabel', { n: i.number })"
                  data-invoice-delete
                  @click="removeInvoice(i)"
                ><PhTrash :size="15" aria-hidden="true" /></button>
              </div>
            </li>
          </ul>
          <p v-if="totals.noRate" class="m-0 text-[13px] text-gold-ink" data-invoices-no-rate>{{ t('carriers.invoice.noRateHint', { n: totals.noRate }) }}</p>
        </template>
      </section>

      <CarrierModal v-model:open="editOpen" mode="edit" :client-id="clientId" :initial="editInitial" :save="saveEdit" />
      <InvoiceModal v-model:open="invOpen" :mode="invMode" :client-id="clientId" :initial="invInitial" :current-case="invCase" :save="saveInvoice" />
    </template>
  </div>
</template>
