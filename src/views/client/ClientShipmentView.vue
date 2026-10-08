<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhCaretLeft, PhDownloadSimple } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ShipmentAskPanel from '@/views/client/shipment/ShipmentAskPanel.vue'
import ShipmentDocuments from '@/views/client/shipment/ShipmentDocuments.vue'
import ShipmentHistory from '@/views/client/shipment/ShipmentHistory.vue'
import ShipmentTimeline from '@/views/client/shipment/ShipmentTimeline.vue'
import { import40Api, type Import40CaseDto, type Import40CaseInvoiceDto, type Import40FileDto } from '@/api/import40'
import { billingApi } from '@/api/billing'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'
import { shipmentTag, toShipmentSummary } from '@/views/client/shipment'
import { dayMonthOf, saveBlob } from '@/views/client/shipment/util'
import { countryName } from '@/utils/countries'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import type { ZTone } from '@/components/z/ZTag.vue'

// Карточка поставки клиента (/import-40/:id, редизайн, волна 2a, доски Shipment / ShipmentPhone).
// Данные — те же вызовы, что у прежней Import40CaseView для клиента: заявка, файлы, счета AQNIET, справочник стран.
const { t } = useI18n()
const route = useRoute()
const uid = useId()

const id = computed(() => String(route.params.id ?? ''))

type LoadState = 'loading' | 'ready' | 'notFound' | 'error'
const state = ref<LoadState>('loading')
const kase = shallowRef<Import40CaseDto | null>(null)
const files = ref<Import40FileDto[]>([])
const invoices = ref<Import40CaseInvoiceDto[]>([])
// Файлы и счета — отдельные блоки со своей ошибкой и «Повторить»: пустой список при ошибке врал бы
// («Документов пока нет», «Счёт выставим…», панель оплаты без учёта загруженного чека).
const filesError = ref(false)
const invoicesError = ref(false)

// Номера запросов: ответ прежней поставки (переход по уведомлению на другую) или устаревший повтор
// не перетирает текущее. caseId сверяем с адресом — блок не возьмёт файлы чужой поставки.
let seq = 0
let filesSeq = 0
let invoicesSeq = 0

const loadFiles = async (caseId: string) => {
  const my = ++filesSeq
  try {
    const list = await import40Api.listFiles(caseId, { silent: true })
    if (my !== filesSeq || caseId !== id.value) return
    files.value = list
    filesError.value = false
  } catch {
    if (my !== filesSeq || caseId !== id.value) return
    files.value = []
    filesError.value = true
  }
}
const loadInvoices = async (caseId: string) => {
  const my = ++invoicesSeq
  try {
    const list = await import40Api.listBrokerInvoices(caseId, { silent: true })
    if (my !== invoicesSeq || caseId !== id.value) return
    invoices.value = list
    invoicesError.value = false
  } catch {
    if (my !== invoicesSeq || caseId !== id.value) return
    invoices.value = []
    invoicesError.value = true
  }
}

/**
 * initial — первый показ поставки (и смена :id): скелетон, прежние данные сбрасываются, ошибка заявки —
 * «не найдена»/«повторить» без тоста. Перечитывание после действия — без silent: при сбое общий
 * перехватчик покажет тост, а на экране останется последнее известное состояние.
 */
const load = async (initial: boolean) => {
  const caseId = id.value
  const my = ++seq
  if (initial) {
    state.value = 'loading'
    kase.value = null
    files.value = []
    invoices.value = []
    filesError.value = false
    invoicesError.value = false
  }
  let c: Import40CaseDto
  try {
    c = await import40Api.get(caseId, initial ? { silent: true } : undefined)
  } catch (e: unknown) {
    if (my !== seq) return
    const code = (e as { response?: { status?: number } })?.response?.status
    if (initial) state.value = code === 404 || code === 403 || code === 400 ? 'notFound' : 'error'
    return
  }
  await Promise.all([loadFiles(caseId), loadInvoices(caseId)])
  if (my !== seq) return
  kase.value = c
  state.value = 'ready'
}
watch(id, () => { void load(true) }, { immediate: true })
const reload = () => load(false)
const retryFiles = () => loadFiles(id.value)
const retryInvoices = () => loadInvoices(id.value)

// Справочник стран — только для названия страны отправителя (как в прежней карточке); лениво, без тоста и без ошибки на экране.
const countries = ref<RefCodeItem[]>([])
void referencesApi.listCountries({ silent: true }).then((r) => { countries.value = r }).catch(() => {})

// ---- Шапка ----
const summary = computed(() => (kase.value ? toShipmentSummary(kase.value, files.value) : null))
const tag = computed(() => (summary.value ? shipmentTag(summary.value) : null))
const metaParts = computed(() => {
  const c = kase.value
  if (!c) return []
  const parts: string[] = []
  const country = c.clientSenderCountryCode ? countryName(c.clientSenderCountryCode, countries.value) : ''
  if (country) parts.push(country)
  if (c.post) parts.push(t('client.card.post', { post: c.post }))
  const created = dayMonthOf(c.createdAtUtc)
  if (created) parts.push(t('client.card.created', { date: created }))
  return parts
})
const crumbs = computed(() => [
  { label: t('client.list.title'), to: '/import-40' },
  { label: kase.value?.number ?? '' },
])

const zipping = ref(false)
const downloadAll = async () => {
  if (!kase.value || zipping.value) return
  zipping.value = true
  try {
    const r = await import40Api.downloadAllDocuments(kase.value.id)
    if ('error' in r) message.error(r.error)
    else saveBlob(r.blob, r.fileName)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    zipping.value = false
  }
}

// ---- Таймлайн и документы ----
// ДТ, заменённые разделением ЕТТ/ВТО, клиенту не показываем — их место заняли дочерние.
const liveDeclarations = computed(() => (kase.value?.declarations ?? []).filter((d) => !d.isSplitReplaced))
const dtNumbers = computed(() => liveDeclarations.value.map((d) => d.declarationNumber).filter((n): n is string => !!n))
// Бланк ДТ — документ AQNIET только после подачи в таможню (статус ≥ 3); пока ДТ заполняется, её нет.
const docDeclarations = computed(() => ((kase.value?.status ?? 0) >= 3 ? liveDeclarations.value : []))
const docsCount = computed(() => (filesError.value ? null : files.value.filter((f) => f.section === 'documents').length))

// ---- Услуги AQNIET: счета и акты по поставке ----
const invoiceTitle = (inv: Import40CaseInvoiceDto) =>
  `${inv.kind === 'act' ? t('billing.act') : t('billing.invoice')} ${inv.number ? `№ ${inv.number}/${inv.year}` : t('billing.draftNo')}`
const invoiceStatus = (s: number): { text: string; tone: ZTone } =>
  s === 2 ? { text: t('billing.paidStatus'), tone: 'done' }
  : s === 1 ? { text: t('billing.issuedStatus'), tone: 'wait' }
  : s === 3 ? { text: t('billing.cancelled'), tone: 'neutral' }
  : { text: t('billing.draftNo'), tone: 'neutral' }
const pdfBusy = ref<string | null>(null)
const downloadInvoicePdf = async (inv: Import40CaseInvoiceDto) => {
  if (pdfBusy.value) return
  pdfBusy.value = inv.id
  try {
    saveBlob(await billingApi.pdf(inv.id), `${inv.kind === 'act' ? 'Акт' : 'Счёт'}-${inv.number || 'черновик'}.pdf`)
  } catch (e: unknown) {
    if (!(e as { response?: unknown })?.response) message.error(t('billing.actionError'))
  } finally {
    pdfBusy.value = null
  }
}
const hasServiceInvoice = computed(() => invoices.value.some((i) => i.kind === 'invoice' && (i.status === 1 || i.status === 2)))

const servicesId = `ship-services-${uid}`
const card = 'rounded-panel border border-line px-[18px] py-4'
// «Повторить» — sm на компьютере, на телефоне — палец (44px).
const retry = 'max-sm:h-11 max-sm:px-4 max-sm:text-sm'
const TIMELINE_SKELETON = [62, 48, 70, 54, 44, 58]
</script>

<template>
  <div class="flex flex-col gap-[18px] sm:gap-6" data-client-shipment>
    <!-- Путь: на компьютере — крошки, на телефоне — «назад» пальцем (44px) -->
    <template v-if="state !== 'notFound'">
      <ZBreadcrumbs v-if="state === 'ready'" :items="crumbs" class="-mb-2 max-sm:hidden" />
      <RouterLink
        to="/import-40"
        class="-mb-2 -ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-field px-2 text-sm text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus sm:hidden"
        data-ship-back
      >
        <PhCaretLeft :size="16" aria-hidden="true" />{{ t('client.list.title') }}
      </RouterLink>
    </template>

    <!-- Загрузка -->
    <div v-if="state === 'loading'" class="flex flex-col gap-[18px] sm:gap-6" aria-busy="true" data-ship-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="min(320px, 80%)" height="28px" />
        <ZSkeleton width="min(380px, 90%)" height="14px" />
      </div>
      <ZSkeleton height="96px" />
      <div class="flex flex-col gap-4">
        <div v-for="(w, i) in TIMELINE_SKELETON" :key="i" class="flex items-center gap-3.5">
          <span class="block size-[26px] shrink-0 animate-pulse rounded-pill bg-sunken motion-reduce:animate-none" />
          <ZSkeleton :width="`${w}%`" height="14px" class="flex-1" />
        </div>
      </div>
    </div>

    <!-- Не найдена -->
    <div v-else-if="state === 'notFound'" class="rounded-panel border border-dashed border-line-strong" data-ship-not-found>
      <ZEmpty :title="t('client.card.notFound')" :hint="t('client.card.notFoundHint')">
        <template #action>
          <RouterLink
            to="/import-40"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t('client.card.toList') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <!-- Ошибка загрузки -->
    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-ship-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('client.card.loadError') }}</p>
      <ZButton size="sm" :class="retry" data-ship-retry @click="load(true)">{{ t('home.retry') }}</ZButton>
    </div>

    <template v-else-if="kase && summary && tag">
      <!-- Шапка: груз, тег, номер · страна · пост · дата; справа — архив всех файлов -->
      <div class="flex flex-wrap items-start gap-4">
        <div class="min-w-0 flex-1">
          <!-- На телефоне тег над заголовком (доска ShipmentPhone); в DOM заголовок первым. -->
          <div class="flex flex-col-reverse items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <h1 class="m-0 min-w-0 text-[23px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink [overflow-wrap:anywhere] sm:text-[26px] sm:leading-8">
              {{ kase.cargo || t('client.row.noCargo') }}
            </h1>
            <ZTag :tone="tag.tone" data-ship-tag>{{ t(`client.tag.${tag.key}`) }}</ZTag>
          </div>
          <p class="m-0 mt-1.5 text-sm text-ink-3 sm:text-[15px]" data-ship-meta>
            <span class="font-mono text-[13.5px] text-ink-2 sm:text-sm">{{ kase.number }}</span>
            <template v-for="p in metaParts" :key="p"> · {{ p }}</template>
          </p>
        </div>
        <ZButton
          v-if="files.length"
          variant="secondary"
          :loading="zipping"
          class="ml-auto h-[38px] rounded-[9px] border border-line-strong bg-surface px-3.5 font-medium enabled:hover:bg-sunken max-sm:hidden"
          data-ship-zip
          @click="downloadAll"
        >
          <template #icon><PhDownloadSimple :size="15" aria-hidden="true" /></template>
          {{ t('client.card.zip') }}
        </ZButton>
      </div>

      <ShipmentAskPanel
        :shipment="summary"
        :case-dto="kase"
        :files="files"
        :has-service-invoice="hasServiceInvoice"
        :files-unknown="filesError"
        @changed="reload"
      />

      <div class="flex flex-wrap items-start gap-x-6 gap-y-[18px]">
        <div class="min-w-0 flex-[999_1_480px]">
          <ShipmentTimeline :shipment="summary" :docs-count="docsCount" :dt-numbers="dtNumbers" />
        </div>

        <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px]">
          <ShipmentDocuments
            :case-id="kase.id"
            :files="files"
            :declarations="docDeclarations"
            :svh-invoice-number="kase.svhInvoiceNumber"
            :error="filesError"
            @retry="retryFiles"
          />

          <section :aria-labelledby="servicesId" :class="cn(card, 'max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:px-0')" data-ship-services>
            <h2 :id="servicesId" class="m-0 mb-1.5 text-[15px] leading-6 font-semibold text-ink">{{ t('client.card.servicesTitle') }}</h2>
            <div v-if="invoicesError" class="flex flex-wrap items-center gap-x-3 gap-y-2" data-services-error>
              <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('client.card.servicesError') }}</p>
              <ZButton size="sm" :class="retry" data-services-retry @click="retryInvoices">{{ t('home.retry') }}</ZButton>
            </div>
            <p v-else-if="!invoices.length" class="m-0 text-sm text-ink-3" data-services-empty>{{ t('client.card.servicesEmpty') }}</p>
            <ul v-else role="list" class="m-0 flex list-none flex-col p-0">
              <li
                v-for="inv in invoices"
                :key="inv.id"
                class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line py-2 last:border-b-0"
                data-service-row
              >
                <span class="min-w-0 flex-1 text-sm text-ink">{{ invoiceTitle(inv) }}</span>
                <ZTag :tone="invoiceStatus(inv.status).tone" size="sm">{{ invoiceStatus(inv.status).text }}</ZTag>
                <span class="text-sm tabular-nums text-ink-2">{{ formatMoney(inv.total) }}</span>
                <button
                  type="button"
                  :aria-label="t('client.card.servicesPdf', { title: invoiceTitle(inv) })"
                  :aria-busy="pdfBusy === inv.id || undefined"
                  class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent px-1.5 font-sans text-sm font-medium text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus aria-busy:cursor-progress sm:min-h-8 sm:min-w-0"
                  data-service-pdf
                  @click="downloadInvoicePdf(inv)"
                >PDF</button>
              </li>
            </ul>
          </section>

          <section v-if="kase.assignedDeclarantName" :class="cn(card, 'bg-canvas')" data-ship-declarant>
            <h2 class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ t('client.card.declarant', { name: kase.assignedDeclarantName }) }}</h2>
          </section>
        </div>
      </div>

      <ShipmentHistory :logs="kase.logs ?? []" />
    </template>
  </div>
</template>
