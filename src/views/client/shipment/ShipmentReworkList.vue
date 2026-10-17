<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhCircleDashed, PhUploadSimple } from '@phosphor-icons/vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { reworkApi, type ReworkItemDto } from '@/api/import40Rework'
import { message } from '@/ui/message'

// «Нужно от вас: догрузить» (17.10): пункты возврата на доработку — у каждого своя загрузка файла нужного вида
// и отметка «загружено». Файл к пункту закрывает его на сервере; после загрузки карточка перечитывает заявку.
const props = defineProps<{ caseId: string; items: ReworkItemDto[] }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()

// Форматы и размер — как проверяет сервер (ReestrDocumentRules, 25 МБ).
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const MAX_MB = 25

const uploading = ref<string | null>(null)
const upload = async (item: ReworkItemDto, file: File) => {
  if (uploading.value) return
  uploading.value = item.id
  try {
    await reworkApi.uploadForItem(props.caseId, item, file)
    message.success(t('rework.client.uploadedToast'))
    emit('changed')
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    uploading.value = null
  }
}

const doneText = (x: ReworkItemDto) =>
  x.resolvedFileName ? t('rework.client.uploadedFile', { file: x.resolvedFileName }) : t('rework.client.closed')

const uploadBtn = 'max-sm:block max-sm:w-full [&>button]:h-9 [&>button]:bg-surface [&>button]:px-3.5 [&>button]:text-sm max-sm:[&>button]:h-12 max-sm:[&>button]:w-full max-sm:[&>button]:rounded-[12px] max-sm:[&>button]:text-[15px]'
</script>

<template>
  <ul role="list" class="m-0 flex list-none flex-col gap-2 p-0" data-rework-client-list>
    <li
      v-for="x in items"
      :key="x.id"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-row border border-gold-line/70 bg-surface/70 px-3 py-2.5"
      :data-rework-row="x.kind"
      :data-rework-state="x.resolvedAtUtc ? 'done' : 'open'"
    >
      <PhCheckCircle v-if="x.resolvedAtUtc" :size="18" weight="fill" class="shrink-0 text-tone-done-fg" aria-hidden="true" />
      <PhCircleDashed v-else :size="18" class="shrink-0 text-gold-ink" aria-hidden="true" />
      <div class="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
        <span class="text-sm font-medium text-ink [overflow-wrap:anywhere]">{{ x.title }}</span>
        <span v-if="x.note" class="text-[13px] text-ink-2 [overflow-wrap:anywhere]">{{ x.note }}</span>
        <span v-if="x.resolvedAtUtc" class="text-[13px] text-tone-done-fg [overflow-wrap:anywhere]" data-rework-done>{{ doneText(x) }}</span>
      </div>
      <ZUpload
        v-if="!x.resolvedAtUtc"
        :accept="ACCEPT"
        :max-size-mb="MAX_MB"
        :loading="uploading === x.id"
        :disabled="!!uploading && uploading !== x.id"
        button-variant="secondary"
        :class="uploadBtn"
        :aria-label="t('rework.client.uploadAria', { title: x.title })"
        :custom-request="({ file }) => upload(x, file)"
        data-rework-upload
      >
        <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
        {{ t('rework.client.upload') }}
      </ZUpload>
    </li>
  </ul>
</template>
