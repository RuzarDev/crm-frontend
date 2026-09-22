<template>
  <div class="invoice-autofill">
    <a-upload
      :show-upload-list="false"
      :before-upload="beforeUpload"
      :custom-request="() => {}"
      accept=".pdf,.xlsx"
    >
      <a-button size="small" :loading="uploading || polling">
        <FileSearchOutlined /> {{ t('sales.zapolnitIzInvoysa') }} </a-button>
    </a-upload>

    <ExtractionReviewModal
      v-model:open="reviewOpen"
      :reestr-id="props.reestrId"
      :document-id="documentId"
      :result="result"
      :error-message="errorMessage"
      @applied="onApplied"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { FileSearchOutlined } from '@ant-design/icons-vue'
import { reestrApi } from '@/api/reestr'
import type { ExtractionResultDto } from '@/types/api'
import ExtractionReviewModal from '@/components/ExtractionReviewModal.vue'

const { t } = useI18n()

interface Props {
  reestrId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'applied', count: number): void }>()

const uploading = ref(false)
const polling = ref(false)
const reviewOpen = ref(false)
const result = ref<ExtractionResultDto | null>(null)
const errorMessage = ref('')
const documentId = ref('')

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf') && !name.endsWith('.xlsx')) {
    message.error(t('sales.dopustimyTolkoPdfI'))
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error(t('sales.razmerFaylaNeDolzhen'))
    return false
  }
  void startExtraction(file as File)
  return false
}

const startExtraction = async (file: File) => {
  uploading.value = true
  try {
    const doc = await reestrApi.uploadDocument(props.reestrId, 'client', file, undefined, 'invoice')
    documentId.value = doc.id
    message.info(t('sales.dokumentZagruzhenRaspoznaem'))
    await pollExtraction()
  } catch {
    message.error(t('sales.neUdalosZagruzitDokument'))
  } finally {
    uploading.value = false
  }
}

const pollExtraction = async () => {
  polling.value = true
  const maxAttempts = 30
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await reestrApi.getExtraction(props.reestrId, documentId.value)
      if (res) {
        showResult(res)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    message.error(t('sales.prevyshenoVremyaOzhidaniyaRaspoznavaniya'))
  } catch {
    message.error(t('sales.oshibkaPriPolucheniiRezultata'))
  } finally {
    polling.value = false
  }
}

const showResult = (res: ExtractionResultDto) => {
  result.value = res
  errorMessage.value = ''

  if (res.status === 'needsManualEntry' || res.status === 'error') {
    errorMessage.value =
      res.matchResult === 'notDigital'
        ? t('sales.dokumentNeVCifrovom')
        : t('sales.neUdalosRaspoznatDokument')
  }

  reviewOpen.value = true
}

const onApplied = (count: number) => {
  reviewOpen.value = false
  emit('applied', count)
}
</script>

<style scoped>
.invoice-autofill {
  display: inline-block;
}
</style>
