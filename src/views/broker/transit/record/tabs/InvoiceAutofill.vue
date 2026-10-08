<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFileMagnifyingGlass } from '@phosphor-icons/vue'
import ZUpload from '@/components/z/ZUpload.vue'
import ExtractionReviewModal from '@/components/ExtractionReviewModal.vue'
import { reestrApi } from '@/api/reestr'
import { message } from '@/ui/message'
import type { ExtractionResultDto } from '@/types/api'

// «Заполнить из инвойса» (вкладка «Документы», клиентская секция): загрузка PDF/XLSX как invoice, опрос результата
// (до 30 раз с шагом 2 с; 404 = ещё не готово), окно проверки ExtractionReviewModal. Применение меняет запись на сервере
// (первая позиция — эту запись, остальные создают новые) — родитель после applied перечитывает запись и документы.
// uploaded — файл лёг в документы клиента (список на вкладке надо перечитать, даже если окно проверки закроют).
// Тип файла (.pdf/.xlsx) отсекает сам ZUpload по accept (и при перетаскивании); размер проверяем здесь.
// Кнопку показывает вызывающий (reestr.write и право грузить в клиентскую секцию); disabled — при несохранённых правках «Данных».
const POLL_ATTEMPTS = 30
const POLL_MS = 2000
const MAX_BYTES = 10 * 1024 * 1024

const props = defineProps<{ reestrId: string; disabled?: boolean }>()
const emit = defineEmits<{ applied: [count: number]; uploaded: [] }>()
const { t } = useI18n()

const uploading = ref(false)
const polling = ref(false)
const reviewOpen = ref(false)
const result = ref<ExtractionResultDto | null>(null)
const errorMessage = ref('')
const documentId = ref('')
let alive = true
onBeforeUnmount(() => { alive = false })

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const showResult = (res: ExtractionResultDto) => {
  result.value = res
  errorMessage.value = ''
  if (res.status === 'needsManualEntry' || res.status === 'error') {
    errorMessage.value = res.matchResult === 'notDigital' ? t('sales.dokumentNeVCifrovom') : t('sales.neUdalosRaspoznatDokument')
  }
  reviewOpen.value = true
}

const poll = async () => {
  polling.value = true
  try {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const res = await reestrApi.getExtraction(props.reestrId, documentId.value)
      if (!alive) return
      if (res) {
        showResult(res)
        return
      }
      await sleep(POLL_MS)
      if (!alive) return
    }
    message.error(t('sales.prevyshenoVremyaOzhidaniyaRaspoznavaniya'))
  } catch {
    if (alive) message.error(t('sales.oshibkaPriPolucheniiRezultata'))
  } finally {
    polling.value = false
  }
}

const start = async (file: File) => {
  uploading.value = true
  try {
    const doc = await reestrApi.uploadDocument(props.reestrId, 'client', file, undefined, 'invoice')
    documentId.value = doc.id
    emit('uploaded')
    message.info(t('sales.dokumentZagruzhenRaspoznaem'))
  } catch {
    message.error(t('sales.neUdalosZagruzitDokument'))
    return
  } finally {
    uploading.value = false
  }
  await poll()
}

const onSelect = (files: File[]) => {
  const file = files[0]
  if (!file || uploading.value || polling.value) return
  if (file.size > MAX_BYTES) {
    message.error(t('sales.razmerFaylaNeDolzhen'))
    return
  }
  void start(file)
}

const onApplied = (count: number) => {
  reviewOpen.value = false
  emit('applied', count)
}
</script>

<template>
  <span class="inline-block" data-invoice-autofill>
    <ZUpload
      accept=".pdf,.xlsx"
      button-size="sm"
      :loading="uploading || polling"
      :disabled="disabled"
      class="max-sm:[&_button]:h-11"
      data-autofill-upload
      @select="onSelect"
    >
      <template #icon><PhFileMagnifyingGlass :size="14" aria-hidden="true" /></template>
      {{ t('sales.zapolnitIzInvoysa') }}
    </ZUpload>
    <ExtractionReviewModal
      v-model:open="reviewOpen"
      :reestr-id="reestrId"
      :document-id="documentId"
      :result="result"
      :error-message="errorMessage"
      @applied="onApplied"
    />
  </span>
</template>
