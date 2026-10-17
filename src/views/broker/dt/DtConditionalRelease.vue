<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhUploadSimple, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import CondRelTag from '@/components/condrel/CondRelTag.vue'
import { COND_REL_KINDS, conditionalReleaseApi, type ConditionalReleaseDto } from '@/api/conditionalRelease'
import { import40Api } from '@/api/import40'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { formatDateText } from '@/ui/date'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import { briefOf, condRelKindName, isCondRelOpen } from '@/utils/conditionalRelease'

// Блок «Условный выпуск» на странице ДТ (17.10): отметить (вид недостающего документа + основание + срок, по умолчанию
// выпуск + 60 дней), изменить, снять, загрузить за клиента, подтвердить закрытие. Свои запросы, без автосейва ДТ:
// сервер не меняет UpdatedAtUtc ДТ, поэтому открытый редактор не получает 409.
const props = defineProps<{
  caseId: string
  dt: { id: string; declarationNumber?: string | null; conditionalRelease?: ConditionalReleaseDto | null }
  /** Статус заявки: отметка — с подачи ДТ (3) и не у отменённой (9). */
  caseStatus: number
  /** Декларант заявки, руководитель или администратор. */
  canEdit: boolean
}>()
const { t } = useI18n()
const { confirm } = useConfirm()
const uid = useId()

const cr = ref<ConditionalReleaseDto | null>(props.dt.conditionalRelease ?? null)
watch(() => props.dt.conditionalRelease, (v) => { cr.value = v ?? null })

const open = computed(() => isCondRelOpen(cr.value))
const brief = computed(() => briefOf({ ...props.dt, conditionalRelease: cr.value }))
const markable = computed(() => props.caseStatus >= 3 && props.caseStatus !== 9)
const visible = computed(() => !!cr.value || markable.value)

// ---- Форма ----
const editing = ref(false)
const kind = ref<string | null>(null)
const note = ref('')
const deadline = ref<string | null>(null)
const tried = ref(false)
const kindOptions = computed(() => COND_REL_KINDS.map((k) => ({ value: k, label: condRelKindName(k, t) })))
const noteMissing = computed(() => kind.value === 'other' && !note.value.trim())

const startEdit = (fresh: boolean) => {
  const c = fresh ? null : cr.value
  kind.value = c?.docKind ?? null
  note.value = c?.note ?? ''
  deadline.value = c?.deadline ?? null
  tried.value = false
  editing.value = true
}

const busy = ref<'' | 'save' | 'remove' | 'resolve' | 'upload' | 'download'>('')
const save = async () => {
  tried.value = true
  if (!kind.value || noteMissing.value || busy.value) return
  busy.value = 'save'
  try {
    cr.value = await conditionalReleaseApi.set(props.caseId, props.dt.id, {
      isConditionalRelease: true, docKind: kind.value, note: note.value.trim() || null, deadline: deadline.value || null,
    })
    editing.value = false
    message.success(t('condRel.dt.saved'))
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = ''
  }
}

const remove = async () => {
  if (busy.value) return
  const ok = await confirm({ title: t('condRel.dt.removeTitle'), content: t('condRel.dt.removeText'), okText: t('condRel.dt.removeOk'), cancelText: t('condRel.dt.cancel'), danger: true })
  if (!ok) return
  busy.value = 'remove'
  try {
    cr.value = await conditionalReleaseApi.set(props.caseId, props.dt.id, { isConditionalRelease: false })
    editing.value = false
    message.success(t('condRel.dt.removed'))
  } catch {
    /* перехватчик */
  } finally {
    busy.value = ''
  }
}

const resolve = async () => {
  if (busy.value) return
  const ok = await confirm({ title: t('condRel.dt.resolveTitle'), content: t('condRel.dt.resolveText'), okText: t('condRel.dt.resolveOk'), cancelText: t('condRel.dt.cancel') })
  if (!ok) return
  busy.value = 'resolve'
  try {
    cr.value = await conditionalReleaseApi.resolve(props.caseId, props.dt.id)
    message.success(t('condRel.dt.resolvedMsg'))
  } catch {
    /* перехватчик */
  } finally {
    busy.value = ''
  }
}

const upload = async (file: File) => {
  if (busy.value) return
  busy.value = 'upload'
  try {
    cr.value = await conditionalReleaseApi.upload(props.caseId, props.dt.id, file)
    message.success(t('condRel.dt.uploadedMsg'))
  } catch {
    /* перехватчик */
  } finally {
    busy.value = ''
  }
}

const download = async () => {
  const c = cr.value
  if (!c?.fileId || busy.value) return
  busy.value = 'download'
  try {
    saveBlob(await import40Api.downloadFile(props.caseId, c.fileId), c.fileName || 'document')
  } catch {
    /* перехватчик */
  } finally {
    busy.value = ''
  }
}

// ---- Подписи ----
const dayOf = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return formatDateText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
}
const docText = computed(() => {
  const c = cr.value
  if (!c?.docKind) return ''
  const name = condRelKindName(c.docKind, t)
  return c.note ? `${name} — ${c.note}` : name
})
const daysText = computed(() => {
  const n = cr.value?.daysLeft
  if (n == null || !open.value) return ''
  if (n === 0) return t('condRel.dt.today')
  return n > 0 ? t('condRel.dt.daysLeft', { n }) : t('condRel.dt.overdueDays', { n: -n })
})

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const titleId = `dt-condrel-${uid}`
const btn = 'max-sm:h-11 max-sm:w-full'
const uploadBtn = 'max-sm:block max-sm:w-full max-sm:[&>button]:h-11 max-sm:[&>button]:w-full'
</script>

<template>
  <section
    v-if="visible"
    :aria-labelledby="titleId"
    :class="cn('flex flex-col gap-3 rounded-panel border px-4 py-3.5 sm:px-5', open ? 'border-tone-danger-fg/20 bg-surface' : 'border-line bg-surface')"
    data-dt-condrel
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <PhWarningCircle v-if="open" :size="18" weight="fill" class="shrink-0 text-tone-danger-fg" aria-hidden="true" />
      <h2 :id="titleId" class="m-0 text-[15px] leading-6 font-semibold text-ink">{{ t('condRel.dt.title') }}</h2>
      <CondRelTag v-if="brief" :brief="brief" short />
      <span v-if="daysText" :class="cn('text-sm tabular-nums', cr?.overdue ? 'font-semibold text-tone-danger-fg' : 'text-ink-3')" data-condrel-days>{{ daysText }}</span>
    </div>

    <!-- Форма отметки / правки -->
    <div v-if="editing" class="grid gap-3 sm:grid-cols-2" data-condrel-form>
      <ZField :label="t('condRel.dt.kind')" required :error="tried && !kind ? t('condRel.dt.kindRequired') : undefined">
        <ZSelect v-model:value="kind" :options="kindOptions" :invalid="tried && !kind" data-condrel-kind />
      </ZField>
      <ZField :label="t('condRel.dt.deadline')" :help="t('condRel.dt.deadlineHint')">
        <ZDate v-model:value="deadline" allow-clear data-condrel-deadline />
      </ZField>
      <ZField :label="t('condRel.dt.note')" :required="kind === 'other'" :error="tried && noteMissing ? t('condRel.dt.noteRequired') : undefined" class="sm:col-span-2">
        <ZTextarea v-model:value="note" :rows="2" :maxlength="1000" :placeholder="t('condRel.dt.notePlaceholder')" :invalid="tried && noteMissing" data-condrel-note />
      </ZField>
      <div class="flex flex-wrap gap-2 sm:col-span-2">
        <ZButton variant="primary" :loading="busy === 'save'" :class="btn" data-condrel-save @click="save">{{ t('condRel.dt.save') }}</ZButton>
        <ZButton :disabled="busy === 'save'" :class="btn" data-condrel-cancel @click="editing = false">{{ t('condRel.dt.cancel') }}</ZButton>
      </div>
      <p class="m-0 text-xs text-ink-3 sm:col-span-2">{{ t('condRel.dt.reminders') }}</p>
    </div>

    <!-- Без отметки -->
    <template v-else-if="!cr">
      <p class="m-0 text-sm text-ink-3" data-condrel-none>{{ t('condRel.dt.none') }}</p>
      <div v-if="canEdit">
        <ZButton :class="btn" data-condrel-mark @click="startEdit(true)">{{ t('condRel.dt.mark') }}</ZButton>
      </div>
    </template>

    <!-- Отметка есть -->
    <template v-else>
      <dl class="m-0 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt class="text-ink-3">{{ t('condRel.dt.kind') }}</dt>
        <dd class="m-0 text-ink [overflow-wrap:anywhere]" data-condrel-doc>{{ docText }}</dd>
        <dt class="text-ink-3">{{ t('condRel.dt.deadline') }}</dt>
        <dd class="m-0 tabular-nums text-ink" data-condrel-deadline-text>{{ cr.deadline ? formatDateText(cr.deadline) : '—' }}</dd>
      </dl>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-condrel-upload-state>
        <template v-if="cr.uploadedAtUtc">
          <span class="text-ink-2">{{ t('condRel.dt.uploaded', { date: dayOf(cr.uploadedAtUtc), name: cr.fileName || '' }) }}</span>
          <button
            v-if="cr.fileId"
            type="button"
            :aria-busy="busy === 'download' || undefined"
            class="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent p-0 font-sans text-sm font-medium text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
            data-condrel-download
            @click="download"
          ><PhDownloadSimple :size="14" aria-hidden="true" />{{ t('condRel.dt.download') }}</button>
        </template>
        <span v-else-if="open" class="text-ink-3">{{ t('condRel.dt.notUploaded') }}</span>
        <span v-if="cr.resolvedAtUtc" class="font-medium text-tone-done-fg" data-condrel-resolved>{{ t('condRel.dt.resolved', { date: dayOf(cr.resolvedAtUtc) }) }}</span>
      </div>
      <div v-if="canEdit" class="flex flex-wrap gap-2">
        <template v-if="open">
          <ZButton variant="primary" :loading="busy === 'resolve'" :disabled="!!busy && busy !== 'resolve'" :class="btn" data-condrel-resolve @click="resolve">{{ t('condRel.dt.resolve') }}</ZButton>
          <ZUpload
            :accept="ACCEPT"
            :max-size-mb="25"
            :loading="busy === 'upload'"
            :disabled="!!busy && busy !== 'upload'"
            :class="uploadBtn"
            :custom-request="({ file }) => upload(file)"
            data-condrel-upload
          >
            <template #icon><PhUploadSimple :size="16" aria-hidden="true" /></template>
            {{ t('condRel.dt.uploadForClient') }}
          </ZUpload>
          <ZButton :disabled="!!busy" :class="btn" data-condrel-edit @click="startEdit(false)">{{ t('condRel.dt.edit') }}</ZButton>
        </template>
        <ZButton v-else :disabled="!!busy" :class="btn" data-condrel-mark-again @click="startEdit(true)">{{ t('condRel.dt.markAgain') }}</ZButton>
        <ZButton variant="danger-ghost" :loading="busy === 'remove'" :disabled="!!busy && busy !== 'remove'" :class="btn" data-condrel-remove @click="remove">{{ t('condRel.dt.remove') }}</ZButton>
      </div>
      <p v-if="open" class="m-0 text-xs text-ink-3">{{ t('condRel.dt.reminders') }}</p>
    </template>
  </section>
</template>
