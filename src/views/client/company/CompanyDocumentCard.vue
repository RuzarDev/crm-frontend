<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretRight, PhCheckCircle, PhDownloadSimple, PhFileText } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { ZTone } from '@/components/z/ZTag.vue'
import ClientSigexModal from '@/components/client/ClientSigexModal.vue'
import { import40ContractApi, isDocumentEffective, type Import40DocumentDto } from '@/api/import40Contract'
import { extractServerText } from '@/api/client'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { saveBlob } from '@/views/client/shipment/util'
import {
  currentDoc, endOfDayUtc, historyDocs, historyStatus, isOpen, localDate, todayYmd, validDate,
  type DocKind, type HistoryStatus,
} from './company'

// Раздел «Договор» / «Доверенность» (доска Company): актуальный документ — номер, срок, «Скачать .docx» и
// плашки подписи («Ваша подпись»: eGov по QR или загрузка .cms; «Подпись AQNIET» — только у договора).
// Нет документа — «Сформировать» (с разовым и сроком под details). Прежние и отозванные — в «Истории».
// Действия — здесь (ошибки на месте, без тоста перехватчика). После успеха — refresh() экрана: кнопка остаётся
// занятой, пока данные не перечитаны, — повторный клик не сформирует второй документ.
const props = defineProps<{
  kind: DocKind
  docs: Import40DocumentDto[]
  clientId: string
  profileComplete: boolean
  /** Перечитать профиль, документы и регистрацию (экран). */
  refresh: () => Promise<unknown>
  /** Документ действует, но сервер (can-create) не принимает его для новой поставки — нужен новый. */
  needNew?: boolean
  /** Причина от сервера (can-create reason). */
  needNewReason?: string | null
}>()
const emit = defineEmits<{ goProfile: [] }>()
const { t } = useI18n()
const uid = useId()
const titleId = `company-doc-${uid}`

const k = (key: string) => `client.company.${props.kind}.${key}`
const current = computed(() => currentDoc(props.docs))
const history = computed(() => historyDocs(props.docs))
const hasProvider = computed(() => props.kind === 'contract')

const docTitle = (d: Import40DocumentDto) => t(k('title'), { no: `${d.number}/${d.year}` })
const metaParts = (d: Import40DocumentDto) => [
  t(d.isSingleUse ? 'client.company.doc.single' : 'client.company.doc.multi'),
  d.validUntilUtc ? t('client.company.doc.validUntil', { date: validDate(d.validUntilUtc) }) : null,
  t('client.company.doc.generated', { date: localDate(d.generatedAtUtc) }),
].filter(Boolean).join(' · ')

const signedText = (at: string | null, method: string | null) => {
  const date = localDate(at)
  const key = method === 'egov' ? 'signedEgov' : method === 'upload' ? 'signedFile' : 'signed'
  return date ? t(`client.company.doc.${key}`, { date }) : t('client.company.doc.signedNoDate')
}

// ---- Скачать .docx ----
const downloadingId = ref<string | null>(null)
const download = async (d: Import40DocumentDto) => {
  if (downloadingId.value) return
  downloadingId.value = d.id
  try {
    saveBlob(await import40ContractApi.downloadDocument(props.clientId, d.id), `${t(k('file'))}-${d.number}-${d.year}.docx`)
  } catch (e: unknown) {
    // HTTP-ошибку уже показал общий перехватчик — здесь только сбой без ответа.
    if (!(e as { response?: unknown })?.response) message.error(t('client.company.doc.downloadError'))
  } finally {
    downloadingId.value = null
  }
}

// Перечитывание после действия: пока идёт, действия с документом недоступны.
const refreshing = ref(false)
const refreshAfter = async () => {
  refreshing.value = true
  try {
    await props.refresh()
  } finally {
    refreshing.value = false
  }
}

const errText = (e: unknown, fallback: string) =>
  extractServerText((e as { response?: { data?: unknown } })?.response?.data) ?? fallback

// ---- Подпись: загрузка подписанного файла ----
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const uploadError = ref('')
const pickFile = () => {
  if (uploading.value || refreshing.value) return
  uploadError.value = ''
  fileInput.value?.click()
}
const onFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  const doc = current.value
  input.value = ''
  if (!file || !doc) return
  uploading.value = true
  uploadError.value = ''
  try {
    await import40ContractApi.signDocument(props.clientId, doc.id, 'client', file, { silent: true })
    message.success(t('client.company.doc.uploaded'))
    await refreshAfter()
  } catch (err) {
    uploadError.value = errText(err, t('client.company.doc.uploadError'))
  } finally {
    uploading.value = false
  }
}

// ---- Подпись через eGov ----
const sigexOpen = ref(false)
const sigexDocId = ref<string | null>(null)
const openSigex = () => {
  if (refreshing.value || uploading.value) return
  sigexDocId.value = current.value?.id ?? null
  sigexOpen.value = true
}
const onSigned = () => {
  sigexOpen.value = false
  message.success(t('client.company.doc.signedToast'))
  void refreshAfter()
}

// ---- Сформировать: разовый и срок действия ----
// Многоразовый договор у клиента один: пока есть действующий или ждущий подписи, сервер второй не выпустит —
// остаётся только разовый (флажок включён и закреплён). У доверенности такого правила нет.
const multiBlocked = computed(() => props.kind === 'contract'
  && props.docs.some((d) => !d.isSingleUse && (isDocumentEffective(d) || isOpen(d))))
const singleUse = ref(false)
const validUntil = ref<string | null>(null)
const isSingle = computed(() => multiBlocked.value || singleUse.value)
const generating = ref(false)
const generateError = ref('')
watch(() => props.docs, () => { generateError.value = '' })

const generate = async () => {
  if (generating.value || refreshing.value || !props.profileComplete) return
  generating.value = true
  generateError.value = ''
  try {
    await import40ContractApi.generateDocument(props.clientId, {
      kind: props.kind,
      isSingleUse: isSingle.value,
      validUntilUtc: validUntil.value ? endOfDayUtc(validUntil.value) : null,
    }, { silent: true })
    message.success(t(k('generated')))
    singleUse.value = false
    validUntil.value = null
    await refreshAfter()
  } catch (err) {
    // 409 «второй многоразовый» и прочие отказы сервера — его же текстом, на месте.
    generateError.value = errText(err, t('client.company.doc.generateError'))
  } finally {
    generating.value = false
  }
}
const minDate = todayYmd()
// Что будет без даты — по правилам сервера: многоразовый договор — год, разовый — без срока (до использования
// в поставке), доверенность — до конца года.
const validUntilHelp = computed(() => t(props.kind === 'poa'
  ? 'client.company.doc.validUntilHelpPoa'
  : isSingle.value ? 'client.company.doc.validUntilHelpContractSingle' : 'client.company.doc.validUntilHelpContract'))
// Календарь (Reka DatePicker, ~70 КБ) нужен редко — грузим, только когда клиент раскрыл параметры.
const ZDate = defineAsyncComponent(() => import('@/components/z/ZDate.vue'))
const optionsOpen = ref(false)

// ---- История ----
const HISTORY_TONE: Record<HistoryStatus, ZTone> = {
  effective: 'done', awaiting: 'wait', consumed: 'neutral', expired: 'neutral', revoked: 'danger',
}

const plate = 'flex min-w-0 flex-col gap-2.5 rounded-row border px-[18px] py-4'
const actionBtn = 'h-[38px] rounded-[9px] px-3.5 text-sm max-sm:h-11 max-sm:flex-1'
const summary = cn(
  'group/sum flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-field text-sm text-ink-2 outline-hidden',
  'hover:text-ink focus-visible:shadow-focus max-sm:min-h-11 [&::-webkit-details-marker]:hidden',
)
const caret = 'shrink-0 transition-transform duration-150 ease-out group-open/det:rotate-90 motion-reduce:transition-none'
</script>

<template>
  <section :aria-labelledby="titleId" class="flex flex-col gap-[18px] rounded-panel border border-line bg-surface px-6 py-[22px] max-sm:px-4 max-sm:py-5" :data-company-doc="kind">
    <input ref="fileInput" type="file" accept=".cms,.p7s,.sig" class="hidden" tabindex="-1" aria-hidden="true" data-sign-file @change="onFile" />

    <!-- Актуальный документ -->
    <template v-if="current">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 :id="titleId" class="m-0 text-lg leading-[26px] font-semibold tracking-[-0.01em] text-ink" data-doc-title>
            {{ docTitle(current) }}
          </h2>
          <p class="m-0 mt-1 text-base text-ink-3" data-doc-meta>{{ metaParts(current) }}</p>
        </div>
        <ZTag v-if="isDocumentEffective(current)" tone="done" class="mt-1">{{ t('client.company.doc.effective') }}</ZTag>
        <ZButton
          :loading="downloadingId === current.id"
          :class="cn(actionBtn, 'border border-solid border-line-strong bg-surface font-medium enabled:hover:bg-sunken max-sm:w-full')"
          data-doc-download
          @click="download(current)"
        >
          <PhDownloadSimple :size="16" aria-hidden="true" />{{ t('client.company.doc.download') }}
        </ZButton>
      </div>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 max-sm:grid-cols-1">
        <!-- Ваша подпись -->
        <div
          v-if="!current.clientSigned"
          :class="cn(plate, 'border-gold-line bg-gold-soft')"
          data-plate="client"
          data-plate-state="todo"
        >
          <span class="text-base font-semibold text-ink">{{ t('client.company.doc.yourSignature') }}</span>
          <span class="text-[13.5px] leading-5 text-ink-2">{{ t('client.company.doc.signHint') }}</span>
          <span class="mt-1 flex flex-wrap gap-2">
            <ZButton variant="primary" :loading="refreshing && !uploading" :class="actionBtn" data-sign-egov @click="openSigex">
              {{ t('client.company.doc.signEgov') }}
            </ZButton>
            <ZButton :loading="uploading" :class="cn(actionBtn, 'bg-surface font-medium enabled:hover:bg-line')" data-sign-upload @click="pickFile">
              {{ t('client.company.doc.uploadCms') }}
            </ZButton>
          </span>
          <p v-if="uploadError" role="alert" class="m-0 text-[13px] text-tone-danger-fg" data-upload-error>{{ uploadError }}</p>
        </div>
        <div v-else :class="cn(plate, 'border-line bg-canvas')" data-plate="client" data-plate-state="done">
          <span class="text-base font-semibold text-ink">{{ t('client.company.doc.yourSignature') }}</span>
          <span class="inline-flex items-center gap-1.5 text-[13.5px] leading-5 text-tone-done-fg">
            <PhCheckCircle :size="16" weight="fill" aria-hidden="true" />{{ signedText(current.clientSignedAtUtc, current.clientSignMethod) }}
          </span>
        </div>

        <!-- Подпись AQNIET — только у договора (доверенность — односторонний документ клиента) -->
        <div v-if="hasProvider" :class="cn(plate, 'border-line bg-canvas')" data-plate="provider">
          <span class="text-base font-semibold text-ink">{{ t('client.company.doc.providerSignature') }}</span>
          <span v-if="current.providerSigned" class="inline-flex items-center gap-1.5 text-[13.5px] leading-5 text-tone-done-fg">
            <PhCheckCircle :size="16" weight="fill" aria-hidden="true" />{{ signedText(current.providerSignedAtUtc, null) }}
          </span>
          <span v-else class="text-[13.5px] leading-5 text-ink-3">
            {{ t(current.clientSigned ? 'client.company.doc.providerSoon' : 'client.company.doc.providerAfter') }}
          </span>
        </div>
      </div>

      <!-- Действует, но для новой поставки не годится (разовый занят открытой поставкой) — нужен новый -->
      <div v-if="needNew" class="flex flex-col items-start gap-2.5 rounded-row border border-gold-line bg-gold-soft px-[18px] py-4" data-need-new>
        <span class="text-base font-semibold text-ink">{{ t('client.company.doc.needNewTitle') }}</span>
        <span class="text-[13.5px] leading-5 text-ink-2">{{ needNewReason || t(k('needNewHint')) }}</span>
        <ZButton
          v-if="profileComplete"
          variant="primary"
          :loading="generating"
          class="mt-1 h-10 px-5 max-sm:h-12 max-sm:w-full max-sm:text-base"
          data-doc-generate-new
          @click="generate"
        >
          {{ t(isSingle ? 'client.company.doc.generateSingle' : 'client.company.doc.generate') }}
        </ZButton>
      </div>
    </template>

    <!-- Документа нет -->
    <div v-else class="flex flex-col items-start gap-3" data-doc-empty>
      <span class="flex size-10 items-center justify-center rounded-row bg-sunken text-ink-3" aria-hidden="true">
        <PhFileText :size="20" />
      </span>
      <div>
        <h2 :id="titleId" class="m-0 text-lg leading-[26px] font-semibold tracking-[-0.01em] text-ink">
          {{ t(history.length ? k('noneTitle') : k('emptyTitle')) }}
        </h2>
        <p class="m-0 mt-1 max-w-[560px] text-base text-ink-3">
          {{ profileComplete ? t(history.length ? k('noneHint') : k('emptyHint')) : t('client.company.doc.fillFirst') }}
        </p>
      </div>
      <ZButton
        v-if="profileComplete"
        variant="primary"
        :loading="generating"
        class="h-10 px-5 max-sm:h-12 max-sm:w-full max-sm:text-base"
        data-doc-generate
        @click="generate"
      >
        {{ t(isSingle ? 'client.company.doc.generateSingle' : 'client.company.doc.generate') }}
      </ZButton>
      <ZButton
        v-else
        variant="primary"
        class="h-10 px-5 max-sm:h-12 max-sm:w-full max-sm:text-base"
        data-doc-go-profile
        @click="emit('goProfile')"
      >
        {{ t('client.company.doc.toProfile') }}
      </ZButton>
    </div>

    <ZAlert v-if="generateError" type="error" show-icon :message="generateError" data-generate-error />

    <!-- Разовый / срок действия: без документа — параметры кнопки «Сформировать», с документом — отдельное действие -->
    <details v-if="profileComplete" class="group/det" data-doc-options @toggle="(e: Event) => (optionsOpen = (e.target as HTMLDetailsElement).open)">
      <summary :class="summary">
        <PhCaretRight :size="14" :class="caret" aria-hidden="true" />
        {{ t(current ? k('optionsWithDoc') : k('options')) }}
      </summary>
      <div class="flex flex-col gap-3 pt-3 pl-5 max-sm:pl-0">
        <ZCheckbox
          :checked="isSingle"
          :disabled="multiBlocked"
          class="max-sm:min-h-11"
          data-opt-single
          @update:checked="(v: boolean) => (singleUse = v)"
        >
          {{ t(k('singleUse')) }}
        </ZCheckbox>
        <p v-if="multiBlocked" class="m-0 text-[13px] text-ink-3">{{ t('client.company.doc.multiBlocked') }}</p>
        <ZField :label="t('client.company.doc.validUntilLabel')" :help="validUntilHelp" class="max-w-[260px] max-sm:max-w-none">
          <ZDate v-if="optionsOpen" v-model:value="validUntil" :min="minDate" allow-clear class="max-sm:h-12" data-opt-until />
        </ZField>
        <ZButton
          v-if="current"
          :loading="generating"
          class="h-10 self-start px-4 max-sm:h-12 max-sm:w-full max-sm:text-base"
          data-doc-generate-more
          @click="generate"
        >
          {{ t(isSingle ? 'client.company.doc.generateSingle' : 'client.company.doc.generate') }}
        </ZButton>
      </div>
    </details>

    <!-- История -->
    <details v-if="history.length" class="group/det" data-doc-history>
      <summary :class="summary">
        <PhCaretRight :size="14" :class="caret" aria-hidden="true" />
        {{ t('client.company.doc.history', { n: history.length }) }}
      </summary>
      <ul role="list" class="m-0 mt-2 flex list-none flex-col p-0">
        <li
          v-for="d in history"
          :key="d.id"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-0 border-t border-solid border-line py-2.5 first:border-t-0"
          :data-history-doc="d.id"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-ink">№ {{ d.number }}/{{ d.year }}</span>
            <span class="block text-[13px] text-ink-3">{{ metaParts(d) }}</span>
          </span>
          <ZTag :tone="HISTORY_TONE[historyStatus(d)]" size="sm">{{ t(`client.company.doc.status.${historyStatus(d)}`) }}</ZTag>
          <ZButton
            variant="ghost"
            :loading="downloadingId === d.id"
            :aria-label="t('client.company.doc.downloadLabel', { no: `${d.number}/${d.year}` })"
            class="h-8 px-2.5 max-sm:h-11 max-sm:px-3"
            @click="download(d)"
          >
            <PhDownloadSimple :size="16" aria-hidden="true" />.docx
          </ZButton>
        </li>
      </ul>
    </details>

    <ClientSigexModal v-model:open="sigexOpen" :client-id="clientId" :doc-id="sigexDocId" @signed="onSigned" />
  </section>
</template>
