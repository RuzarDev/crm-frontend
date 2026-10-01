<template>
  <div class="import-invoice">
    <a-button @click="openPicker">
      <ImportOutlined /> {{ t('transit.importIzInvoysa') }} </a-button>

    <a-modal v-model:open="pickerOpen" :title="t('transit.importIzInvoysa')" :footer="null" width="520px">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-form-item :label="t('transit.klient')">
          <a-select
            v-model:value="clientId"
            :options="clientOptions"
            :placeholder="t('transit.vyberiteKlienta')"
            style="width: 100%"
          />
        </a-form-item>
        <a-upload
          :show-upload-list="false"
          :before-upload="beforeUpload"
          :custom-request="() => {}"
          accept=".pdf,.xlsx"
        >
          <a-button :loading="busy" :disabled="!clientId">
            <UploadOutlined /> {{ t('transit.vybratFayl') }} </a-button>
        </a-upload>
      </a-space>
    </a-modal>

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
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { ImportOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { reestrApi } from '@/api/reestr'
import { ReestrEntryStatus } from '@/types/api'
import type { ExtractionResultDto } from '@/types/api'
import { reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'
import ExtractionReviewModal from '@/components/ExtractionReviewModal.vue'

const { t } = useI18n()

const IMPORT_PLACEHOLDER = t('transit.importIzInvoysa')

interface Props {
  clientOptions: { value: string; label: string }[]
}

defineProps<Props>()
const emit = defineEmits<{ (e: 'imported', count: number): void }>()

const pickerOpen = ref(false)
const clientId = ref<string | undefined>()
const busy = ref(false)
const reviewOpen = ref(false)
const draftEntryId = ref('')
const documentId = ref('')
const result = ref<ExtractionResultDto | null>(null)
const errorMessage = ref('')

const openPicker = () => {
  clientId.value = undefined
  pickerOpen.value = true
}

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (!clientId.value) {
    message.error(t('transit.vyberiteKlienta'))
    return false
  }
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf') && !name.endsWith('.xlsx')) {
    message.error(t('transit.dopustimyTolkoPdfI'))
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error(t('transit.razmerFaylaNeDolzhen'))
    return false
  }
  void startImport(file as File)
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
    if (entry.data[t('transit.gruz')] === IMPORT_PLACEHOLDER) {
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

<style scoped>
.import-invoice {
  display: inline-block;
}
</style>
