<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { useReestrStore } from '@/stores/reestr'

// Загрузка реестра из Excel. Сотрудник выбирает клиента (первый выбран заранее), клиент грузит за себя
// (сервер сам подставляет его). Тип и размер файла проверяет ZUpload; успех — окно закрывается.
const props = defineProps<{ open: boolean; needsClient: boolean; clientOptions: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { t } = useI18n()
const store = useReestrStore()

const clientId = ref<string | null>(null)
const clientError = ref('')
const uploading = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  clientId.value = props.clientOptions[0]?.value ?? null
  clientError.value = ''
}, { immediate: true })

const pickClient = (v: unknown) => {
  clientId.value = (v as string | null) ?? null
  if (clientId.value) clientError.value = ''
}

const upload = async (file: File) => {
  if (props.needsClient && !clientId.value) {
    clientError.value = t('transit.vyberiteKlientaDlyaImporta')
    return
  }
  uploading.value = true
  try {
    if (await store.uploadFile(file, props.needsClient ? clientId.value ?? undefined : undefined)) emit('update:open', false)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('transit.zagruzkaExcelFayla')"
    :width="520"
    :footer="false"
    data-transit-upload-modal
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-4 pb-2">
      <ZField v-if="needsClient" :label="t('transit.klientDlyaImporta')" :error="clientError">
        <ZSelect
          :value="clientId"
          :options="clientOptions"
          show-search
          :placeholder="t('transit.vyberiteKlienta')"
          data-transit-upload-client
          @update:value="pickClient"
        />
      </ZField>
      <ZUpload
        type="drag"
        accept=".xlsx,.xls"
        :max-size-mb="10"
        :loading="uploading"
        :custom-request="({ file }) => upload(file)"
        data-transit-upload-zone
      >{{ t('broker.transit.uploadHint') }}</ZUpload>
    </div>
  </ZModal>
</template>
