<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhUploadSimple, PhWarningCircle } from '@phosphor-icons/vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { conditionalReleaseApi, type ConditionalReleaseDto } from '@/api/conditionalRelease'
import type { Import40DeclarationDto } from '@/api/import40'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { condRelDate, condRelDoc, isCondRelOpen } from '@/utils/conditionalRelease'

// Карточка поставки клиента (17.10): по каждой ДТ с незакрытым условным выпуском — красный блок «до ДД.ММ загрузите …»
// с загрузкой файла. Загрузил — декларант получает уведомление и подтверждает закрытие; до этого можно заменить файл.
const props = defineProps<{ caseId: string; declarations: Pick<Import40DeclarationDto, 'id' | 'declarationNumber' | 'conditionalRelease'>[] }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const uid = useId()

// Ответ загрузки сразу показываем (до перечитывания карточки).
const local = ref<Record<string, ConditionalReleaseDto>>({})
const items = computed(() => props.declarations
  .map((d) => ({ d, c: local.value[d.id] ?? d.conditionalRelease ?? null }))
  .filter((x): x is { d: (typeof x)['d']; c: ConditionalReleaseDto } => isCondRelOpen(x.c))
  .sort((a, b) => (a.c.deadline ?? '').localeCompare(b.c.deadline ?? '')))

const dtName = (d: { declarationNumber?: string | null }) => d.declarationNumber || t('condRel.client.dtNoNumber')
const text = (d: { declarationNumber?: string | null }, c: ConditionalReleaseDto) => {
  const named = { dt: dtName(d), date: condRelDate(c.deadline), doc: condRelDoc(c.docKind, c.note, t) }
  return c.overdue ? t('condRel.client.textOverdue', named) : t('condRel.client.text', named)
}

const uploading = ref<string | null>(null)
const upload = async (dtId: string, file: File) => {
  if (uploading.value) return
  uploading.value = dtId
  try {
    local.value = { ...local.value, [dtId]: await conditionalReleaseApi.upload(props.caseId, dtId, file) }
    message.success(t('condRel.client.uploadedMsg'))
    emit('changed')
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    uploading.value = null
  }
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
// Кнопка загрузки: 42px на компьютере, на телефоне — во всю ширину и 48px (как в «Нужно от вас»).
const uploadBtn = 'max-sm:block max-sm:w-full [&>button]:h-[42px] [&>button]:rounded-row [&>button]:px-[18px] [&>button]:text-[14.5px] max-sm:[&>button]:h-12 max-sm:[&>button]:w-full max-sm:[&>button]:rounded-[12px] max-sm:[&>button]:text-[15px]'
</script>

<template>
  <section
    v-for="{ d, c } in items"
    :key="d.id"
    :aria-labelledby="`ship-condrel-${uid}-${d.id}`"
    :class="cn(
      'flex flex-col gap-2.5 rounded-panel border p-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:px-[22px] sm:py-5',
      c.uploadedAtUtc ? 'border-gold-line bg-gold-soft' : 'border-tone-danger-fg/25 bg-tone-danger-bg',
    )"
    data-ship-condrel
    :data-condrel-state="c.uploadedAtUtc ? 'uploaded' : c.overdue ? 'overdue' : 'open'"
  >
    <div class="flex min-w-0 items-start gap-3.5">
      <span
        aria-hidden="true"
        :class="cn(
          'hidden size-9 shrink-0 items-center justify-center rounded-[10px] sm:flex',
          c.uploadedAtUtc ? 'bg-gold text-navy' : 'bg-tone-danger-fg text-white',
          !c.uploadedAtUtc && 'motion-safe:animate-pulse',
        )"
      ><PhWarningCircle :size="20" weight="fill" /></span>
      <div class="flex min-w-0 flex-col gap-1">
        <h2 :id="`ship-condrel-${uid}-${d.id}`" :class="cn('m-0 text-base leading-6 font-semibold', c.uploadedAtUtc ? 'text-ink' : 'text-tone-danger-fg')">
          {{ t('condRel.client.title') }}
        </h2>
        <p class="m-0 text-sm leading-[1.45] text-ink-2 [overflow-wrap:anywhere]" data-condrel-text>{{ text(d, c) }}</p>
        <p v-if="c.note && c.docKind !== 'other'" class="m-0 text-sm text-ink-3 [overflow-wrap:anywhere]">{{ t('condRel.client.note', { note: c.note }) }}</p>
        <p v-if="c.uploadedAtUtc" class="m-0 text-sm font-medium text-ink [overflow-wrap:anywhere]" data-condrel-uploaded>{{ t('condRel.client.uploaded', { name: c.fileName || '' }) }}</p>
      </div>
    </div>
    <ZUpload
      :accept="ACCEPT"
      convert-heic
      :max-size-mb="25"
      :loading="uploading === d.id"
      :disabled="!!uploading && uploading !== d.id"
      :button-variant="c.uploadedAtUtc ? 'secondary' : 'primary'"
      :class="uploadBtn"
      :custom-request="({ file }) => upload(d.id, file)"
      data-condrel-upload
    >
      <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
      {{ c.uploadedAtUtc ? t('condRel.client.uploadAgain') : t('condRel.client.upload') }}
    </ZUpload>
  </section>
</template>
