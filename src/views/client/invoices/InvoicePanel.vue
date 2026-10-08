<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhReceipt } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { billingApi, type BillingRequisites, type BrokerInvoice, type PaymentCheckFile } from '@/api/billing'
import { invoiceNo, invoiceState, isPayable, localDate, requisiteRows } from '@/views/client/invoices/invoices'
import { saveBlob } from '@/ui/download'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// Панель выбранного счёта (доска Invoices): сумма, реквизиты и назначение платежа с копированием,
// загрузка чека, PDF. Реквизиты — общий блок экрана (один запрос), здесь только показ и «Повторить».
const props = defineProps<{
  invoice: BrokerInvoice
  requisites: BillingRequisites | null
  requisitesLoading: boolean
  requisitesError: boolean
}>()
const emit = defineEmits<{ updated: [invoice: BrokerInvoice]; retryRequisites: [] }>()
const { t } = useI18n()
const titleId = `invoice-panel-${useId()}`

const inv = computed(() => props.invoice)
const isAct = computed(() => inv.value.kind === 'act')
const payable = computed(() => isPayable(inv.value))
const no = computed(() => invoiceNo(inv.value))
const docTitle = computed(() => t(isAct.value ? 'client.invoices.actNo' : 'client.invoices.invoiceNo', { no: no.value }))
const issued = computed(() => localDate(inv.value.issuedAtUtc))
const title = computed(() => (issued.value ? t('client.invoices.titleOn', { doc: docTitle.value, date: issued.value }) : docTitle.value))

const state = computed(() => invoiceState(inv.value))
const tagText = computed(() => {
  const s = state.value
  const key = s.date || (s.key !== 'paid' && s.key !== 'act') ? s.key : `${s.key}NoDate`
  return t(`client.invoices.tag.${key}`, { date: s.date })
})
const vatText = computed(() => (inv.value.vatRate > 0
  ? t('client.invoices.vat', { rate: inv.value.vatRate, sum: formatMoney(inv.value.vatAmount) })
  : t('client.invoices.noVat')))

// ---- Реквизиты и назначение платежа ----
const rows = computed(() => requisiteRows(props.requisites))
const purpose = computed(() => t(inv.value.vatRate > 0 ? 'client.invoices.purpose' : 'client.invoices.purposeNoVat', {
  no: no.value,
  date: localDate(inv.value.issuedAtUtc, true),
  rate: inv.value.vatRate,
}))

// Короткая отметка «Скопировано» на самой кнопке + тост (один, с ключом — серия копирований не плодит плашки).
const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const copy = async (key: string, text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Нет доступа к буферу (http, запрет браузера) — значения выделяются целиком, подсказываем скопировать вручную.
    message.warning({ content: t('client.invoices.copyFailed'), key: 'invoice-copy' })
    return
  }
  message.success({ content: t('client.invoices.copied'), key: 'invoice-copy', duration: 1.5 })
  copied.value = key
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = null }, 1600)
}
onBeforeUnmount(() => clearTimeout(copiedTimer))

// ---- Действия: чек и PDF. Состояние — по id счёта: панель переиспользуется при выборе другого счёта ----
const uploadingId = ref<string | null>(null)
const uploading = computed(() => uploadingId.value === inv.value.id)
const checks = computed<PaymentCheckFile[]>(() =>
  [...(inv.value.paymentChecks ?? [])].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc)))

const upload = async ({ file }: { file: File }) => {
  const id = inv.value.id
  uploadingId.value = id
  try {
    emit('updated', await billingApi.uploadPaymentCheck(id, file))
    message.success(t('client.invoices.uploaded'))
  } catch (e: unknown) {
    // HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только сбой без ответа.
    if (!(e as { response?: unknown })?.response) message.error(t('client.invoices.uploadError'))
  } finally {
    if (uploadingId.value === id) uploadingId.value = null
  }
}

const pdfBusyId = ref<string | null>(null)
const downloadPdf = async () => {
  const i = inv.value
  if (pdfBusyId.value) return
  pdfBusyId.value = i.id
  try {
    saveBlob(await billingApi.pdf(i.id), `${i.kind === 'act' ? 'Акт' : 'Счёт'}-${i.number || i.id}.pdf`)
  } catch (e: unknown) {
    if (!(e as { response?: unknown })?.response) message.error(t('client.invoices.pdfError'))
  } finally {
    pdfBusyId.value = null
  }
}

const checkBusyId = ref<string | null>(null)
const downloadCheck = async (f: PaymentCheckFile) => {
  if (checkBusyId.value) return
  checkBusyId.value = f.id
  try {
    saveBlob(await billingApi.downloadPaymentCheck(inv.value.id, f.id), f.fileName)
  } catch (e: unknown) {
    if (!(e as { response?: unknown })?.response) message.error(t('client.invoices.checkError'))
  } finally {
    checkBusyId.value = null
  }
}

const copyBtn = cn(
  'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border-0 bg-sunken px-2.5 font-sans text-[12.5px] font-medium whitespace-nowrap text-ink-2',
  'outline-hidden transition-colors duration-150 ease-out hover:bg-line-strong hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none',
  'max-sm:h-11 max-sm:px-3.5 max-sm:text-[13px]',
)
// Кнопки действий по доске — 42px, на телефоне 44px и во всю ширину. У ZUpload класс ложится на обёртку,
// поэтому размеры самой кнопки задаём через дочерний селектор.
const uploadCls = 'max-sm:w-full [&>button]:h-[42px] [&>button]:rounded-row [&>button]:px-[18px] [&>button]:text-[14.5px] max-sm:[&>button]:h-11 max-sm:[&>button]:w-full'
const pdfCls = 'h-[42px] rounded-row border border-line-strong bg-surface px-4 text-[14.5px] font-medium enabled:hover:bg-sunken max-sm:h-11 max-sm:w-full'
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="flex min-w-0 flex-col gap-5 rounded-panel border border-line bg-surface px-[26px] py-6 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0"
    data-invoice-panel
  >
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0">
        <h2 :id="titleId" class="m-0 text-lg font-semibold tracking-[-0.01em] text-ink">{{ title }}</h2>
        <p class="m-0 mt-1 text-base text-ink-3">
          <template v-if="inv.caseNumber">
            {{ t('client.invoices.subtitleCase') }} <span class="font-mono text-[13.5px] text-ink-2">{{ inv.caseNumber }}</span>
          </template>
          <template v-else>{{ t('client.invoices.subtitleNoCase') }}</template>
        </p>
      </div>
      <ZTag :tone="state.tone" class="sm:ml-auto" data-invoice-tag>{{ tagText }}</ZTag>
    </div>

    <p class="m-0 text-[30px] leading-9 font-semibold tracking-[-0.02em] tabular-nums text-ink" data-invoice-total>
      {{ formatMoney(inv.total) }}
      <span class="text-base font-normal tracking-normal text-ink-3 max-sm:mt-0.5 max-sm:block">{{ vatText }}</span>
    </p>

    <template v-if="payable">
      <div data-invoice-requisites>
        <h3 class="m-0 mb-2 text-base font-semibold text-ink">{{ t('client.invoices.req.title') }}</h3>

        <div v-if="requisitesLoading" class="flex flex-col gap-3 rounded-row border border-line p-3.5" aria-busy="true">
          <ZSkeleton v-for="w in ['72%', '48%', '64%', '86%', '40%', '28%']" :key="w" :width="w" height="14px" />
        </div>

        <div v-else-if="requisitesError" class="flex flex-wrap items-center gap-3 rounded-row border border-line px-3.5 py-3" data-requisites-error>
          <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('client.invoices.req.error') }}</p>
          <ZButton size="sm" :class="retry" data-requisites-retry @click="emit('retryRequisites')">{{ t('home.retry') }}</ZButton>
        </div>

        <p v-else-if="!rows" class="m-0 rounded-row border border-dashed border-line-strong px-3.5 py-3 text-sm text-ink-2" data-requisites-empty>
          {{ t('client.invoices.req.empty') }}
        </p>

        <dl v-else class="m-0 rounded-row border border-line text-base">
          <div
            v-for="(r, i) in rows"
            :key="r.key"
            :class="cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center sm:grid-cols-[160px_minmax(0,1fr)_auto]',
              i > 0 && 'border-t border-line',
            )"
            :data-requisite="r.key"
          >
            <dt class="col-start-1 row-start-1 px-3.5 pt-2.5 text-[13px] text-ink-3 sm:py-2.5 sm:text-base">{{ t(`client.invoices.req.${r.key}`) }}</dt>
            <dd class="col-start-1 row-start-2 m-0 px-3.5 pt-0.5 pb-2.5 font-mono text-[13.5px] text-ink select-all [overflow-wrap:anywhere] sm:col-start-2 sm:row-start-1 sm:px-0 sm:py-2.5">{{ r.value }}</dd>
            <dd class="col-start-2 row-span-2 row-start-1 m-0 py-1.5 pr-2.5 pl-1 sm:col-start-3 sm:row-span-1">
              <button
                type="button"
                :aria-label="t('client.invoices.copyLabel', { what: t(`client.invoices.req.${r.key}`) })"
                :class="copyBtn"
                :data-copy="r.key"
                @click="copy(r.key, r.value)"
              >
                <PhCheck v-if="copied === r.key" :size="13" weight="bold" class="text-tone-done-fg" aria-hidden="true" />
                {{ copied === r.key ? t('client.invoices.copied') : t('client.invoices.copy') }}
              </button>
            </dd>
          </div>
        </dl>
      </div>

      <div class="flex items-start gap-3 rounded-row border border-line bg-canvas py-3.5 pr-2.5 pl-4" data-invoice-purpose>
        <div class="min-w-0 flex-1">
          <p class="m-0 text-[12.5px] text-muted">{{ t('client.invoices.purposeTitle') }}</p>
          <p class="m-0 mt-1 text-base text-ink select-all">{{ purpose }}</p>
        </div>
        <button
          type="button"
          :aria-label="t('client.invoices.copyLabel', { what: t('client.invoices.purposeTitle') })"
          :class="copyBtn"
          data-copy="purpose"
          @click="copy('purpose', purpose)"
        >
          <PhCheck v-if="copied === 'purpose'" :size="13" weight="bold" class="text-tone-done-fg" aria-hidden="true" />
          {{ copied === 'purpose' ? t('client.invoices.copied') : t('client.invoices.copy') }}
        </button>
      </div>
    </template>

    <div class="flex flex-wrap items-center gap-3">
      <ZUpload
        v-if="payable"
        accept=".pdf,.jpg,.jpeg,.png"
        :max-size-mb="25"
        button-variant="primary"
        :loading="uploading"
        :custom-request="upload"
        :class="uploadCls"
        data-invoice-upload
      >{{ checks.length ? t('client.invoices.uploadMore') : t('client.invoices.upload') }}</ZUpload>
      <ZButton variant="secondary" :loading="pdfBusyId === inv.id" :class="pdfCls" data-invoice-pdf @click="downloadPdf">
        {{ isAct ? t('client.invoices.pdfAct') : t('client.invoices.pdfInvoice') }}
      </ZButton>
      <p v-if="payable" class="m-0 min-w-[200px] flex-1 text-[13px] leading-5 text-muted" data-invoice-hint>{{ t('client.invoices.checkHint') }}</p>
    </div>

    <div v-if="checks.length" data-invoice-checks>
      <h3 class="m-0 mb-1 text-base font-semibold text-ink">{{ t('client.invoices.checksTitle') }}</h3>
      <ul role="list" class="m-0 flex list-none flex-col p-0">
        <li v-for="f in checks" :key="f.id" class="flex items-center gap-3 border-b border-line py-1.5 last:border-b-0" data-invoice-check>
          <PhReceipt :size="18" class="shrink-0 text-ink-3" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-ink" :title="f.fileName">{{ f.fileName }}</span>
            <span class="block text-xs text-muted">{{ t('client.invoices.checkUploadedAt', { date: localDate(f.createdAtUtc) }) }}</span>
          </span>
          <button
            type="button"
            :aria-label="t('client.invoices.checkDownloadLabel', { name: f.fileName })"
            :aria-busy="checkBusyId === f.id || undefined"
            class="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-field border-0 bg-transparent px-2 font-sans text-sm font-medium text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus aria-busy:cursor-progress sm:min-h-8"
            data-check-download
            @click="downloadCheck(f)"
          >{{ t('client.invoices.checkDownload') }}</button>
        </li>
      </ul>
    </div>
  </section>
</template>
