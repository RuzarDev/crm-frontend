<template>
  <div class="inline-block">
    <ZButton v-if="!hideTrigger" data-import-invoice-trigger @click="openPicker">
      <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
      {{ t('transit.importIzInvoysa') }}
    </ZButton>

    <ZModal v-model:open="pickerOpen" :title="t('transit.importIzInvoysa')" :footer="null" :width="520">
      <div class="flex flex-col gap-4 pb-4">
        <ZField :label="t('transit.klient')">
          <ZSelect
            v-model:value="clientId"
            :options="clientOptions"
            :placeholder="t('transit.vyberiteKlienta')"
            data-import-invoice-client
          />
        </ZField>
        <ZUpload
          accept=".pdf,.xlsx"
          :loading="busy"
          :disabled="!clientId"
          :before-upload="beforeUpload"
          data-import-invoice-upload
        />
      </div>
    </ZModal>

    <ExtractionReviewModal
      v-if="draftEntryId && documentId"
      v-model:open="reviewOpen"
      :reestr-id="draftEntryId"
      :document-id="documentId"
      :result="result"
      :error-message="errorMessage"
      @applied="onApplied"
      @cancel="onCancelReview"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { message } from '@/ui/message'
import { PhDownloadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { reestrApi } from '@/api/reestr'
import { ReestrEntryStatus } from '@/types/api'
import type { ExtractionResultDto } from '@/types/api'
import { reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'
import ExtractionReviewModal from '@/components/ExtractionReviewModal.vue'

const { t } = useI18n()

const IMPORT_PLACEHOLDER = t('transit.importIzInvoysa')
/** Ключ данных реестра — не переводится (в entry.data он всегда по-русски). */
const CARGO_KEY = 'Груз'

interface Props {
  clientOptions: { value: string; label: string }[]
  /** Своя кнопка не рисуется — окно открывает родитель через ref.open() (кнопка в шапке «Транзита»). */
  hideTrigger?: boolean
}

withDefaults(defineProps<Props>(), { hideTrigger: false })
const emit = defineEmits<{ (e: 'imported', count: number): void }>()

const pickerOpen = ref(false)
const clientId = ref<string | null>(null)
const busy = ref(false)
const reviewOpen = ref(false)
const draftEntryId = ref('')
const documentId = ref('')
const result = ref<ExtractionResultDto | null>(null)
const errorMessage = ref('')

const openPicker = () => {
  clientId.value = null
  pickerOpen.value = true
}

defineExpose({ open: openPicker })

// Тип файла (.pdf/.xlsx) проверяет сам ZUpload по accept; здесь — клиент и размер.
const beforeUpload = (file: File) => {
  if (!clientId.value) {
    message.error(t('transit.vyberiteKlienta'))
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error(t('transit.razmerFaylaNeDolzhen'))
    return false
  }
  void startImport(file)
  return false
}

const startImport = async (file: File) => {
  busy.value = true
  try {
    const created = await reestrApi.create({
      clientId: clientId.value!,
      cargoDescription: IMPORT_PLACEHOLDER,
      status: ReestrEntryStatus.InProgress,
    })
    draftEntryId.value = created.id

    const doc = await reestrApi.uploadDocument(draftEntryId.value, 'client', file, undefined, 'invoice')
    documentId.value = doc.id
    pickerOpen.value = false
    message.info(t('transit.dokumentZagruzhenRaspoznaem'))
    await pollExtraction()
  } catch {
    message.error(t('transit.neUdalosZagruzitDokument'))
    await cleanupDraft()
    resetState()
  } finally {
    busy.value = false
  }
}

const pollExtraction = async () => {
  const maxAttempts = 30
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await reestrApi.getExtraction(draftEntryId.value, documentId.value)
      if (res) {
        showResult(res)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    message.error(t('transit.prevyshenoVremyaOzhidaniyaRaspoznavaniya'))
    await cleanupDraft()
    resetState()
  } catch {
    message.error(t('transit.oshibkaPriPolucheniiRezultata'))
    await cleanupDraft()
    resetState()
  }
}

const showResult = (res: ExtractionResultDto) => {
  result.value = res
  errorMessage.value = ''

  if (res.status === 'needsManualEntry' || res.status === 'error') {
    errorMessage.value =
      res.matchResult === 'notDigital'
        ? t('transit.dokumentNeVCifrovom')
        : t('transit.neUdalosRaspoznatDokument')
  }

  reviewOpen.value = true
}

const onApplied = async (count: number) => {
  reviewOpen.value = false
  await clearPlaceholderCargoDescription()
  emit('imported', count)
  resetState()
}

const clearPlaceholderCargoDescription = async () => {
  try {
    const entry = await reestrApi.getById(draftEntryId.value)
    if (entry.data[CARGO_KEY] === IMPORT_PLACEHOLDER) {
      const body = reestrEntryToUpsertBody(entry)
      body.cargoDescription = null
      await reestrApi.update(draftEntryId.value, body)
    }
  } catch {
    //
  }
}

const onCancelReview = async () => {
  await cleanupDraft()
  resetState()
}

const cleanupDraft = async () => {
  if (!draftEntryId.value) return
  try {
    await reestrApi.delete(draftEntryId.value)
  } catch {
    //
  }
}

const resetState = () => {
  draftEntryId.value = ''
  documentId.value = ''
  result.value = null
  errorMessage.value = ''
  reviewOpen.value = false
}
</script>
