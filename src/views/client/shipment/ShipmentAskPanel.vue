<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  PhCheckCircle, PhDownloadSimple, PhHourglassMedium, PhPaperclip, PhPencilSimpleLine, PhProhibit, PhUploadSimple, PhWarningCircle,
} from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { import40Api, type Import40CaseDto, type Import40FileDto } from '@/api/import40'
import type { ClientShipment } from '@/api/clientShipments'
import { askFor } from '@/views/client/shipment'
import { dayMonthOf, saveBlob } from '@/views/client/shipment/util'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// Панель «что сейчас» карточки поставки (доска Shipment): ход клиента по askFor — оплата склада, ответ на
// вопрос AQNIET, черновик/возврат; иначе — нейтральная плашка этапа (чек на проверке, склад оплачен, отмена).
// Сама зовёт API и сообщает changed — карточка перечитывает заявку. Ошибки API показывает общий перехватчик.
// Окно отмены черновика — отдельным корнем, вне панели: в разметке оно не должно стать ячейкой её сетки.
const props = defineProps<{
  shipment: ClientShipment
  caseDto: Import40CaseDto
  files: Import40FileDto[]
  /** По поставке уже есть счёт AQNIET (для ссылки на «Счета» на этапе 6). */
  hasServiceInvoice: boolean
  /** Файлы не загрузились: загружен ли чек — неизвестно, поэтому панель оплаты и «чек на проверке» не показываем. */
  filesUnknown?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const titleId = `ship-ask-${useId()}`

const status = computed(() => props.shipment.status)
// «Оплатите склад» зависит от файлов (есть ли чек) — без них не гадаем (то же правило у тега и полосы).
const ask = computed(() => askFor(props.shipment, { filesUnknown: props.filesUnknown }))
// Чек можно загрузить (и заменить) на всём этапе оплаты склада — сервер раздел payment-check по статусу не ограничивает.
const svhPayStage = computed(() => status.value === 6)
// Клиент отменяет только свой черновик (статус 0) — и с открытым вопросом AQNIET тоже.
const isDraft = computed(() => status.value === 0)

// Форматы и размер — как проверяет сервер (ReestrDocumentRules, MaxFileSizeBytes = 25 МБ).
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const MAX_MB = 25

// ---- Оплата склада ----
const svhSum = computed(() => (props.shipment.svhInvoiceAmount != null ? formatMoney(props.shipment.svhInvoiceAmount) : ''))
const svhInvoiceLabel = computed(() => {
  const n = props.shipment.svhInvoiceNumber
  const date = dayMonthOf(props.caseDto.svhInvoiceDate)
  if (n && date) return t('client.card.pay.invoiceFull', { n, date })
  if (n) return t('client.card.pay.invoiceNo', { n })
  if (date) return t('client.card.pay.invoiceDate', { date })
  return t('client.card.pay.invoiceBare')
})
// Последний загруженный файл счёта СВХ — его и скачивает клиент.
const svhFile = computed(() => {
  const list = props.files.filter((f) => f.section === 'svh-invoice')
  return list.length ? [...list].sort((a, b) => a.createdAtUtc.localeCompare(b.createdAtUtc))[list.length - 1] : null
})
const downloadingSvh = ref(false)
const downloadSvh = async () => {
  const f = svhFile.value
  if (!f || downloadingSvh.value) return
  downloadingSvh.value = true
  try {
    saveBlob(await import40Api.downloadFile(props.caseDto.id, f.id), f.originalFileName)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    downloadingSvh.value = false
  }
}

// ---- Загрузка файла (чек / документ к ответу) ----
const uploading = ref<'payment-check' | 'documents' | null>(null)
const upload = async (section: 'payment-check' | 'documents', file: File) => {
  if (uploading.value) return
  uploading.value = section
  try {
    await import40Api.uploadFile(props.caseDto.id, section, file, section === 'documents' ? 'other' : undefined)
    message.success(section === 'payment-check' ? t('client.card.pay.uploaded') : t('client.card.problem.attached'))
    emit('changed')
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    uploading.value = null
  }
}

// ---- Ответ на вопрос AQNIET (аудит 5.8): уходит в историю и уведомляет исполнителя ----
const reply = ref('')
const replying = ref(false)
const sendReply = async () => {
  const text = reply.value.trim()
  if (!text || replying.value) return
  replying.value = true
  try {
    await import40Api.action(props.caseDto.id, 'client-reply', text)
    reply.value = ''
    message.success(t('import40Case.problemReplySent'))
    emit('changed')
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    replying.value = false
  }
}

// ---- Отмена черновика: сервер требует причину ----
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelling = ref(false)
const promptCancel = () => {
  cancelReason.value = ''
  cancelOpen.value = true
}
const confirmCancel = async () => {
  const reason = cancelReason.value.trim()
  if (!reason || cancelling.value) return
  cancelling.value = true
  try {
    await import40Api.action(props.caseDto.id, 'cancel', reason)
    cancelOpen.value = false
    message.success(t('client.card.draft.cancelled'))
    emit('changed')
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    cancelling.value = false
  }
}

// ---- Нейтральные плашки ----
const notice = computed<'check' | 'paid' | 'cancelled' | null>(() => {
  if (ask.value) return null
  if (status.value === 9) return 'cancelled'
  if (status.value === 6 && props.shipment.paymentCheckUploaded && !props.filesUnknown) return 'check'
  if (status.value === 7) return 'paid'
  return null
})

// ---- Классы (статические строки — сканер Tailwind видит их целиком) ----
const panel = 'flex flex-col gap-2.5 rounded-panel border p-4 sm:px-[22px] sm:py-5'
const badge = 'hidden size-9 shrink-0 items-center justify-center rounded-[10px] sm:flex'
const h2 = 'm-0 text-base leading-6 font-semibold text-ink'
const text = 'm-0 text-sm leading-[1.45] text-ink-2'
// Главная кнопка панели: 42px на компьютере, на телефоне — во всю ширину и 48px.
const mainBtn = 'h-[42px] rounded-row px-[18px] text-[14.5px] max-sm:h-12 max-sm:w-full max-sm:rounded-[12px] max-sm:text-[15px]'
const secondBtn = 'h-[42px] rounded-row px-4 text-[14.5px] max-sm:h-12 max-sm:w-full max-sm:rounded-[12px] max-sm:text-[15px]'
// ZUpload кладёт class на обёртку — размер кнопки задаём через дочерний селектор.
const uploadMain = 'max-sm:block max-sm:w-full [&>button]:h-[42px] [&>button]:rounded-row [&>button]:px-[18px] [&>button]:text-[14.5px] max-sm:[&>button]:h-12 max-sm:[&>button]:w-full max-sm:[&>button]:rounded-[12px] max-sm:[&>button]:text-[15px]'
const uploadSecond = 'max-sm:block max-sm:w-full [&>button]:h-[42px] [&>button]:rounded-row [&>button]:px-4 [&>button]:text-[14.5px] max-sm:[&>button]:h-12 max-sm:[&>button]:w-full max-sm:[&>button]:rounded-[12px] max-sm:[&>button]:text-[15px]'
const linkBtn = 'inline-flex items-center justify-center gap-2 font-sans font-semibold whitespace-nowrap no-underline outline-hidden transition-colors duration-150 ease-out focus-visible:shadow-focus motion-reduce:transition-none'
</script>

<template>
  <section
    v-if="ask === 'paySvh'"
    :aria-labelledby="titleId"
    :class="cn(panel, 'border-gold-line bg-gold-soft sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:gap-y-2')"
    data-ask="paySvh"
  >
    <div class="flex min-w-0 items-start gap-3.5">
      <span aria-hidden="true" :class="cn(badge, 'bg-gold text-base font-extrabold text-navy')">₸</span>
      <div class="flex min-w-0 flex-col gap-2.5 sm:gap-[3px]">
        <h2 :id="titleId" :class="h2">
          <span class="sm:hidden">{{ t('client.ask.paySvh.title') }}</span>
          <span class="max-sm:hidden">{{ t('client.ask.paySvh.panelTitle') }}</span>
        </h2>
        <p :class="text" data-pay-text>
          {{ svhInvoiceLabel }}<template v-if="svhSum"><span class="max-sm:hidden"> — <b class="font-semibold tabular-nums text-ink">{{ svhSum }}</b></span></template><span class="max-sm:hidden">. {{ t('client.card.pay.after') }}</span>
        </p>
        <p v-if="svhSum" class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] tabular-nums text-ink sm:hidden">{{ svhSum }}</p>
      </div>
    </div>
    <ZUpload
      :accept="ACCEPT"
      :max-size-mb="MAX_MB"
      :loading="uploading === 'payment-check'"
      button-variant="primary"
      :class="cn(uploadMain, 'mt-1 sm:col-start-2 sm:mt-0', svhFile ? 'sm:row-[1/span_2]' : 'sm:row-start-1')"
      :custom-request="({ file }) => upload('payment-check', file)"
      data-pay-upload
    >
      <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
      {{ t('client.card.pay.upload') }}
    </ZUpload>
    <button
      v-if="svhFile"
      type="button"
      :aria-busy="downloadingSvh || undefined"
      :class="cn(
        'cursor-pointer border-0 font-sans outline-hidden focus-visible:shadow-focus aria-busy:cursor-progress',
        'flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-surface text-[15px] font-medium text-ink',
        'sm:col-start-1 sm:row-start-2 sm:ml-[50px] sm:h-auto sm:w-auto sm:justify-self-start sm:rounded-field sm:bg-transparent sm:p-0 sm:text-[13.5px] sm:font-semibold sm:text-zircon-ink sm:hover:text-ink',
      )"
      data-pay-download
      @click="downloadSvh"
    >
      <PhDownloadSimple :size="15" aria-hidden="true" class="sm:hidden" />
      {{ t('client.card.pay.download') }}
    </button>
  </section>

  <section
    v-else-if="ask === 'problem'"
    :aria-labelledby="titleId"
    :class="cn(panel, 'border-danger/20 bg-tone-danger-bg sm:gap-3.5')"
    data-ask="problem"
  >
    <div class="flex min-w-0 items-start gap-3.5">
      <span aria-hidden="true" :class="cn(badge, 'bg-danger text-white')"><PhWarningCircle :size="20" weight="bold" /></span>
      <div class="flex min-w-0 flex-col gap-1">
        <h2 :id="titleId" :class="h2">{{ t('client.ask.problem.title') }}</h2>
        <p :class="cn(text, 'whitespace-pre-line [overflow-wrap:anywhere]')" data-problem-text>{{ shipment.problemClientMessage || t('client.card.problem.fallback') }}</p>
      </div>
    </div>
    <div class="flex flex-col gap-2.5 sm:pl-[50px]">
      <ZField :label="t('client.card.problem.replyLabel')">
        <ZTextarea
          v-model:value="reply"
          :rows="3"
          auto-grow
          :placeholder="t('import40Case.problemReplyPh')"
          class="max-sm:text-[15px]"
          data-problem-reply
        />
      </ZField>
      <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <ZButton
          variant="primary"
          :class="mainBtn"
          :disabled="!reply.trim()"
          :loading="replying"
          data-problem-send
          @click="sendReply"
        >{{ t('import40Case.problemReplySend') }}</ZButton>
        <ZUpload
          :accept="ACCEPT"
          :max-size-mb="MAX_MB"
          :loading="uploading === 'documents'"
          button-variant="secondary"
          :class="cn(uploadSecond, '[&>button]:bg-surface')"
          :custom-request="({ file }) => upload('documents', file)"
          data-problem-attach
        >
          <template #icon><PhPaperclip :size="16" aria-hidden="true" /></template>
          {{ t('client.card.problem.attach') }}
        </ZUpload>
        <ZUpload
          v-if="svhPayStage"
          :accept="ACCEPT"
          :max-size-mb="MAX_MB"
          :loading="uploading === 'payment-check'"
          button-variant="secondary"
          :class="cn(uploadSecond, '[&>button]:bg-surface')"
          :custom-request="({ file }) => upload('payment-check', file)"
          data-problem-check
        >
          <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
          {{ t('client.card.problem.uploadCheck') }}
        </ZUpload>
      </div>
      <div v-if="isDraft" class="mt-1 flex flex-col gap-2.5 border-t border-danger/15 pt-3.5 sm:flex-row sm:flex-wrap sm:items-center">
        <RouterLink
          :to="`/import-40/new/${shipment.id}`"
          :class="cn(linkBtn, secondBtn, 'bg-surface text-ink hover:bg-sunken')"
          data-draft-continue
        >{{ t('client.card.draft.continue') }}</RouterLink>
        <ZButton variant="ghost" :class="cn(secondBtn, 'max-sm:bg-surface')" data-draft-cancel @click="promptCancel">
          {{ t('client.card.draft.cancel') }}
        </ZButton>
      </div>
    </div>
  </section>

  <section
    v-else-if="ask === 'returned' || ask === 'draft'"
    :aria-labelledby="titleId"
    :class="cn(panel, 'border-gold-line bg-gold-soft sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5')"
    :data-ask="ask"
  >
    <div class="flex min-w-0 items-start gap-3.5">
      <span aria-hidden="true" :class="cn(badge, 'bg-gold text-navy')"><PhPencilSimpleLine :size="18" weight="bold" /></span>
      <div class="flex min-w-0 flex-col gap-1">
        <h2 :id="titleId" :class="h2">{{ t(`client.ask.${ask}.title`) }}</h2>
        <p :class="cn(text, 'whitespace-pre-line [overflow-wrap:anywhere]')">{{ ask === 'returned' ? shipment.returnReason : t('client.ask.draft.text') }}</p>
      </div>
    </div>
    <div class="mt-1 flex flex-col gap-2.5 sm:mt-0 sm:flex-row-reverse sm:items-center">
      <RouterLink
        :to="`/import-40/new/${shipment.id}`"
        :class="cn(linkBtn, mainBtn, 'bg-navy text-white hover:bg-navy-hover')"
        data-draft-continue
      >{{ t('client.card.draft.continue') }}</RouterLink>
      <ZButton variant="ghost" :class="cn(secondBtn, 'max-sm:bg-surface')" data-draft-cancel @click="promptCancel">
        {{ t('client.card.draft.cancel') }}
      </ZButton>
    </div>
  </section>

  <section
    v-else-if="notice"
    :aria-labelledby="titleId"
    :class="cn(panel, 'border-line bg-canvas sm:py-4')"
    :data-notice="notice"
  >
    <div class="flex min-w-0 items-start gap-3.5">
      <span aria-hidden="true" :class="cn(badge, 'bg-sunken text-ink-2')">
        <PhHourglassMedium v-if="notice === 'check'" :size="18" />
        <PhCheckCircle v-else-if="notice === 'paid'" :size="18" />
        <PhProhibit v-else :size="18" />
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <h2 :id="titleId" :class="h2">{{ t(`client.card.${notice}.title`) }}</h2>
        <p v-if="notice === 'check'" :class="text">{{ t('client.card.check.text') }}</p>
        <ZUpload
          v-if="notice === 'check'"
          :accept="ACCEPT"
          :max-size-mb="MAX_MB"
          :loading="uploading === 'payment-check'"
          button-variant="secondary"
          :class="cn(uploadSecond, 'mt-1.5 [&>button]:bg-surface sm:[&>button]:h-9 sm:[&>button]:text-sm')"
          :custom-request="({ file }) => upload('payment-check', file)"
          data-check-again
        >
          <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
          {{ t('client.card.pay.uploadAnother') }}
        </ZUpload>
        <p v-else-if="notice === 'paid'" :class="text">
          {{ hasServiceInvoice ? t('client.card.paid.textInvoiced') : t('client.card.paid.text') }}
        </p>
        <p v-else-if="caseDto.cancelReason" :class="cn(text, 'whitespace-pre-line [overflow-wrap:anywhere]')">{{ caseDto.cancelReason }}</p>
        <RouterLink
          v-if="notice === 'paid' && hasServiceInvoice"
          to="/billing"
          class="mt-1 inline-flex min-h-11 items-center self-start rounded-field text-sm font-semibold text-zircon-ink no-underline outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-0"
          data-paid-link
        >{{ t('client.card.paid.link') }}</RouterLink>
      </div>
    </div>
  </section>

  <ZModal
    v-if="isDraft"
    v-model:open="cancelOpen"
    :title="t('client.card.draft.cancelTitle')"
    :ok-text="t('client.card.draft.cancelOk')"
    :cancel-text="t('client.card.draft.keep')"
    :ok-button-props="{ danger: true, disabled: !cancelReason.trim() }"
    :confirm-loading="cancelling"
    :width="480"
    @ok="confirmCancel"
  >
    <template #description>{{ t('import40Case.cancelHintClient') }}</template>
    <ZField :label="t('client.card.draft.reason')" required class="mt-3">
      <ZTextarea v-model:value="cancelReason" :rows="3" :placeholder="t('import40Case.cancelPh')" data-cancel-reason />
    </ZField>
  </ZModal>
</template>
