<template>
  <div class="import-invoice">
    <a-button @click="openPicker">
      <ImportOutlined />
      Импорт из инвойса
    </a-button>

    <a-modal v-model:open="pickerOpen" title="Импорт из инвойса" :footer="null" width="500px">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-form-item label="Клиент">
          <a-select
            v-model:value="clientId"
            :options="clientOptions"
            placeholder="Выберите клиента"
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
            <UploadOutlined />
            Выбрать файл
          </a-button>
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
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { ImportOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { reestrApi } from '@/api/reestr'
import { ReestrEntryStatus } from '@/types/api'
import type { ExtractionResultDto } from '@/types/api'
import { reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'
import ExtractionReviewModal from '@/components/ExtractionReviewModal.vue'

const IMPORT_PLACEHOLDER = 'Импорт из инвойса'

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
    message.error('Выберите клиента')
    return false
  }
  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf') && !name.endsWith('.xlsx')) {
    message.error('Допустимы только PDF и XLSX')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error('Размер файла не должен превышать 10 МБ')
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
    message.info('Документ загружен, распознаём...')
    await pollExtraction()
  } catch {
    message.error('Не удалось загрузить документ')
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
    message.error('Превышено время ожидания распознавания')
    await cleanupDraft()
    resetState()
  } catch {
    message.error('Ошибка при получении результата распознавания')
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
        ? 'Документ не в цифровом формате — автозаполнение недоступно, заполните данные вручную'
        : 'Не удалось распознать документ автоматически — заполните данные вручную'
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
    if (entry.data['Груз'] === IMPORT_PLACEHOLDER) {
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
