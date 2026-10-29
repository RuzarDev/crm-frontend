<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFileArrowUp, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { Import40FileDto } from '@/api/import40'
import { isDocKind } from '@/views/client/docKinds'
import { EXTRACT_ACCEPT, extractableCaseFiles, preselectedIds } from './extractDocs'

// «Из документов» (19.10.2026): что отдать в распознавание (Zircon AI) — документы, уже загруженные в заявку (галочки;
// инвойс и упаковочный лист отмечены сразу), и/или файлы с компьютера. Уже загруженные повторно не сохраняются.
// 29.10.2026: и в уже созданную ДТ (target 'existing', страница ДТ) — отмечено defaultIds (загруженные после создания ДТ),
// у них подпись «новый» (newIds); заголовок и пояснение — свои.
const props = defineProps<{
  open: boolean
  files: readonly Import40FileDto[]
  busy?: boolean
  target?: 'new' | 'existing'
  /** Что отметить при открытии; не задано — инвойс и упаковочный лист (preselectedIds). */
  defaultIds?: readonly string[] | null
  /** Документы, загруженные после создания ДТ (подпись «новый»). */
  newIds?: readonly string[] | null
  /** Дата создания ДТ известна — пояснение о «новых» документах. */
  sinceKnown?: boolean
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [payload: { fileIds: string[]; uploads: File[] }] }>()
const { t } = useI18n()
const tx = (key: string, p?: Record<string, unknown>) => t(`broker.case.declaring.extract.${key}`, p ?? {})

const caseFiles = computed(() => extractableCaseFiles(props.files))
const selected = ref<Set<string>>(new Set())
const uploads = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

// При каждом открытии — заново: отмечены инвойс и упаковочный лист (или defaultIds), файлов с компьютера нет.
watch(() => props.open, (open) => {
  if (!open) return
  selected.value = new Set(props.defaultIds ?? preselectedIds(caseFiles.value))
  uploads.value = []
}, { immediate: true })
const existing = computed(() => props.target === 'existing')
const isNew = (f: Import40FileDto) => !!props.newIds?.includes(f.id)
const lead = computed(() => {
  if (!existing.value) return tx('lead')
  if (!props.sinceKnown) return tx('leadExisting')
  return props.newIds?.length ? tx('leadExistingNew', { n: props.newIds.length }) : tx('leadExistingNone')
})

const toggle = (id: string, on: boolean) => {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}
const kindLabel = (f: Import40FileDto) => (isDocKind(f.docKind) ? t(`client.docKind.${f.docKind}.name`) : '')
const sectionLabel = (f: Import40FileDto) => tx(`section.${f.section === 'border-scans' ? 'border' : f.section === 'documents' ? 'documents' : 'other'}`)

const onPick = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = input.files ? Array.from(input.files) : []
  input.value = ''
  uploads.value = [...uploads.value, ...picked]
}
const removeUpload = (i: number) => { uploads.value = uploads.value.filter((_, j) => j !== i) }

const count = computed(() => selected.value.size + uploads.value.length)
const submit = () => {
  if (!count.value || props.busy) return
  emit('submit', { fileIds: caseFiles.value.filter((f) => selected.value.has(f.id)).map((f) => f.id), uploads: uploads.value })
}
</script>

<template>
  <ZModal
    :open="open"
    :title="existing ? tx('titleExisting') : tx('title')"
    :ok-text="count ? tx('ok', { n: count }) : tx('okEmpty')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="busy"
    :ok-button-props="{ disabled: !count }"
    data-extract-modal
    @update:open="emit('update:open', $event)"
    @ok="submit()"
  >
    <div class="flex flex-col gap-3 pb-2 text-[13px]">
      <p class="m-0 text-ink-2" data-extract-lead>{{ lead }}</p>

      <ul v-if="caseFiles.length" class="m-0 flex list-none flex-col gap-1 p-0" data-extract-case-files>
        <li v-for="f in caseFiles" :key="f.id" class="rounded-row px-2 py-1.5 hover:bg-sunken">
          <ZCheckbox :checked="selected.has(f.id)" :data-extract-file="f.id" @update:checked="toggle(f.id, $event)">
            <span class="break-all text-ink">{{ f.originalFileName }}</span>
            <span class="ml-2 text-xs text-muted">{{ [kindLabel(f), sectionLabel(f)].filter(Boolean).join(' · ') }}</span>
            <ZTag v-if="isNew(f)" tone="info" size="sm" class="ml-2" data-extract-new>{{ tx('newFile') }}</ZTag>
          </ZCheckbox>
        </li>
      </ul>
      <p v-else class="m-0 rounded-row bg-sunken px-3 py-2 text-muted" data-extract-no-case-files>{{ tx('noCaseFiles') }}</p>

      <div class="flex flex-col gap-1.5">
        <ul v-if="uploads.length" class="m-0 flex list-none flex-col gap-1 p-0" data-extract-uploads>
          <li v-for="(f, i) in uploads" :key="`${f.name}-${i}`" class="flex items-center justify-between gap-2 rounded-row bg-sunken px-2 py-1.5">
            <span class="break-all">{{ f.name }} <span class="text-xs text-muted">· {{ tx('fromComputer') }}</span></span>
            <ZButton variant="ghost" size="sm" :aria-label="tx('remove', { name: f.name })" @click="removeUpload(i)"><PhX :size="14" aria-hidden="true" /></ZButton>
          </li>
        </ul>
        <ZButton variant="secondary" size="sm" class="self-start" data-extract-add @click="fileInput?.click()">
          <PhFileArrowUp :size="15" aria-hidden="true" />{{ tx('add') }}
        </ZButton>
        <input ref="fileInput" type="file" multiple :accept="EXTRACT_ACCEPT" class="hidden" data-extract-input @change="onPick" />
      </div>
      <p class="m-0 text-xs text-muted">{{ tx('note') }}</p>
    </div>
  </ZModal>
</template>
