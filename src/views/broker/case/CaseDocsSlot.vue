<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhTrash } from '@phosphor-icons/vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { import40Api, type Import40FileDto, type Import40FileSection } from '@/api/import40'
import { saveBlob } from '@/ui/download'
import { useConfirm } from '@/ui/confirm'
import { DOC_CHECKLIST, isDocKind } from '@/views/client/docKinds'
import { extOf } from '@/views/client/shipment/util'
import { formatFileSize, formatStamp } from '@/views/broker/packages/packages'
import { roleLabel } from './caseFormat'
import type { CaseStepContext } from './caseContext'

// «Место для файлов» раздела заявки (доски Case/CaseSvh): подпись, файлы раздела карточками (расширение, имя, вид документа,
// размер · кто загрузил · когда, скачивание, удаление) и зона загрузки. Используется в шагах: «Заявка и документы»
// (documents, несколько файлов с видом документа), «СВХ и счёт» (declaration-stamp, svh-invoice), «Оплата СВХ» (payment-check).
// Загрузка и удаление — через ctx.actions.mutate: один замок на все действия, после успеха перечитываются файлы и история.
// Права и пустые тексты задаёт шаг: canUpload / canRemove / emptyText.
const props = withDefaults(defineProps<{
  ctx: CaseStepContext
  section: Import40FileSection
  label?: string
  hint?: string
  canUpload?: boolean
  canRemove?: boolean
  /** Несколько файлов за раз. */
  multiple?: boolean
  /** Выбор вида документа (docKind) для загружаемых файлов — раздел documents. */
  withKind?: boolean
  /** Текст, пока в разделе нет файлов. */
  emptyText?: string
  /** Подпись в зоне загрузки (по умолчанию — по multiple). */
  dropText?: string
}>(), { label: '', hint: '', canUpload: false, canRemove: false, multiple: false, withKind: false, emptyText: '', dropText: '' })

const { t } = useI18n()
const { confirm } = useConfirm()
const uid = useId()
const labelId = `case-slot-${uid}`

// Разрешённые типы и размер — как на сервере (ReestrDocumentRules, MaxFileSizeBytes 25 МБ).
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const MAX_MB = 25

const files = computed(() => props.ctx.files.filter((f) => f.section === props.section))

// ---- Вид документа (docKind) ----
const kind = ref<string | null>(null)
const kindOptions = computed(() => [
  ...DOC_CHECKLIST.map((d) => d.key),
  'other',
].map((k) => ({ value: k, label: t(`client.docKind.${k}.name`) })))
const kindLabel = (f: Import40FileDto) => (props.withKind && isDocKind(f.docKind) ? t(`client.docKind.${f.docKind}.name`) : '')

const uploadKey = computed(() => `upload:${props.section}`)
const uploading = computed(() => props.ctx.actions.isPending(uploadKey.value))
const anotherBusy = computed(() => props.ctx.actions.busy() && !uploading.value)

/**
 * Файлы грузятся по очереди одним действием. Если один не принят, уже загруженные остаются: перечитываем заявку
 * и файлы и сообщаем об ошибке (тост показал перехватчик) — вместо «молчаливого» частичного результата.
 */
const upload = async (list: File[]) => {
  if (!props.canUpload || !list.length) return
  const id = props.ctx.kase.id
  const withKind = props.withKind && kind.value ? kind.value : undefined
  await props.ctx.actions.mutate(uploadKey.value, async () => {
    let failure: unknown = null
    for (const f of list) {
      try {
        await import40Api.uploadFile(id, props.section, f, withKind)
      } catch (e) {
        failure = e
        break
      }
    }
    if (failure) {
      await props.ctx.actions.reload()
      throw failure
    }
  }, { done: list.length > 1 ? 'broker.case.done.filesUploaded' : 'broker.case.done.fileUploaded' })
}

// ---- Скачивание и удаление ----
const downloading = ref<string | null>(null)
const download = async (f: Import40FileDto) => {
  if (downloading.value) return
  downloading.value = f.id
  try {
    saveBlob(await import40Api.downloadFile(props.ctx.kase.id, f.id), f.originalFileName)
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts).
  } finally {
    downloading.value = null
  }
}
const remove = async (f: Import40FileDto) => {
  const ok = await confirm({
    title: t('broker.case.docs.deleteConfirm', { name: f.originalFileName }),
    okText: t('broker.case.docs.deleteOk'),
    cancelText: t('broker.case.docs.keep'),
    danger: true,
  })
  if (!ok) return
  await props.ctx.actions.mutate(`file-delete:${f.id}`, () => import40Api.deleteFile(props.ctx.kase.id, f.id), { done: 'broker.case.done.fileDeleted' })
}

const who = (f: Import40FileDto) =>
  f.uploadedByStaffName ? t('import40Case.uploadedByStaff', { name: f.uploadedByStaffName }) : roleLabel(f.uploadedByBusinessRole, t)
const meta = (f: Import40FileDto) => [formatFileSize(f.sizeBytes, t), who(f), formatStamp(f.createdAtUtc)].filter(Boolean).join(' · ')

const iconBase = 'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-progress motion-reduce:transition-none max-sm:size-11'
const iconBtn = `${iconBase} hover:bg-sunken hover:text-ink`
const removeBtn = `${iconBase} hover:bg-tone-danger-bg hover:text-tone-danger-fg`
</script>

<template>
  <div :data-docs-slot="section">
    <div v-if="label || hint || $slots['label-extra']" class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span v-if="label" :id="labelId" class="text-[13px] font-semibold text-ink">{{ label }}</span>
      <span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
      <slot name="label-extra" />
    </div>

    <ul v-if="files.length" role="list" :aria-labelledby="label ? labelId : undefined" class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="f in files"
        :key="f.id"
        class="flex items-center gap-3 rounded-row border border-line bg-canvas px-3 py-2.5"
        data-slot-file
      >
        <span
          class="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-field border border-line bg-surface px-1.5 text-[10px] font-semibold tracking-wide text-ink-3"
          aria-hidden="true"
        >{{ extOf(f.originalFileName) || '—' }}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-ink" :title="f.originalFileName" data-slot-file-name>{{ f.originalFileName }}</div>
          <div v-if="kindLabel(f)" class="truncate text-xs font-medium text-ink-2" data-slot-file-kind>{{ kindLabel(f) }}</div>
          <div class="text-xs tabular-nums text-muted">{{ meta(f) }}</div>
        </div>
        <button
          type="button"
          :class="iconBtn"
          :disabled="downloading !== null"
          :aria-busy="downloading === f.id || undefined"
          :aria-label="t('broker.case.files.download', { name: f.originalFileName })"
          :title="t('broker.case.files.download', { name: f.originalFileName })"
          data-slot-download
          @click="download(f)"
        >
          <PhDownloadSimple :size="17" aria-hidden="true" />
        </button>
        <button
          v-if="canRemove"
          type="button"
          :class="removeBtn"
          :disabled="ctx.actions.busy() && !ctx.actions.isPending(`file-delete:${f.id}`)"
          :aria-busy="ctx.actions.isPending(`file-delete:${f.id}`) || undefined"
          :aria-label="t('broker.case.docs.delete', { name: f.originalFileName })"
          :title="t('broker.case.docs.delete', { name: f.originalFileName })"
          data-slot-remove
          @click="remove(f)"
        >
          <PhTrash :size="17" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else-if="emptyText" class="m-0 text-sm text-ink-3" data-slot-empty>{{ emptyText }}</p>

    <div v-if="canUpload" :class="files.length || emptyText ? 'mt-2.5' : ''" class="flex flex-col gap-2">
      <div v-if="withKind" class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5" data-slot-kind>
        <span :id="`${labelId}-kind`" class="text-[13px] text-ink-2">{{ t('broker.case.docs.kind') }}</span>
        <ZSelect
          v-model:value="kind"
          :options="kindOptions"
          allow-clear
          :placeholder="t('broker.case.docs.kindPh')"
          :aria-labelledby="`${labelId}-kind`"
          :disabled="uploading"
          class="w-full max-w-[320px] max-sm:max-w-none max-sm:*:h-11"
        />
        <span class="basis-full text-xs text-muted">{{ t('broker.case.docs.kindHint') }}</span>
      </div>
      <ZUpload
        type="drag"
        :multiple="multiple"
        :accept="ACCEPT"
        :max-size-mb="MAX_MB"
        :loading="uploading"
        :disabled="anotherBusy"
        data-slot-upload
        @select="upload"
      >{{ uploading ? t('broker.case.docs.uploading') : (dropText || t(multiple ? 'broker.case.docs.dropMany' : 'broker.case.docs.dropOne')) }}</ZUpload>
    </div>
  </div>
</template>
