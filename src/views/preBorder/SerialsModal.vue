<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { preBorderApi, type SerialIssue, type SerialKindMode, type SerialNumbersResult } from '@/api/preBorder'
import { message } from '@/ui/message'
import { checkSerialList, readSheetRows, serialsFromSheet, serialsFromText, type SerialCheckRow } from '@/utils/preBorder'

// Серийные номера / IMEI поставки: из Excel (столбец «IMEI» / «Серийный номер», иначе первый) или вставкой списка.
// До отправки — предпросмотр: формат, контрольная цифра IMEI (Луна), повторы; с ошибками не сохраняем. Сервер
// проверяет заново (и повторы с уже загруженными) — его разбор показываем так же.
const props = defineProps<{ open: boolean; caseId: string; existing: number }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>()
const { t } = useI18n()

const mode = ref<SerialKindMode>('auto')
const replace = ref(false)
const text = ref('')
const source = ref<{ name: string; header: string | null; items: { line: number; raw: string }[] } | null>(null)
const parsing = ref(false)
const saving = ref(false)
const server = shallowRef<SerialNumbersResult | null>(null)

watch(() => props.open, (v) => {
  if (!v) return
  mode.value = 'auto'
  replace.value = false
  text.value = ''
  source.value = null
  server.value = null
})

const MODES = computed(() => [
  { value: 'auto', label: t('preBorder.serials.modeAuto') },
  { value: 'imei', label: t('preBorder.serials.modeImei') },
  { value: 'serial', label: t('preBorder.serials.modeSerial') },
])

const onFile = async (files: File[]) => {
  const f = files[0]
  if (!f) return
  parsing.value = true
  server.value = null
  try {
    const { items, header } = serialsFromSheet(await readSheetRows(f))
    if (!items.length) message.error(t('preBorder.serials.emptyFile'))
    source.value = { name: f.name, header, items }
    text.value = ''
  } catch {
    message.error(t('preBorder.serials.readError'))
  } finally {
    parsing.value = false
  }
}
watch(text, (v) => { if (v.trim()) { source.value = null; server.value = null } })

const items = computed(() => source.value?.items ?? serialsFromText(text.value))
const rows = computed<SerialCheckRow[]>(() => checkSerialList(items.value, mode.value))
const good = computed(() => rows.value.filter((r) => !r.error))
const bad = computed(() => rows.value.filter((r) => r.error))
const imei = computed(() => good.value.filter((r) => r.kind === 'imei').length)

const reasonText = (reason: string, first?: number) => {
  if (reason === 'duplicate' || reason.startsWith('row:')) return t('preBorder.serials.dupOf', { line: first ?? reason.slice(4) })
  if (reason === 'existing') return t('preBorder.serials.dupExisting')
  return t(`preBorder.serials.reason.${reason}`)
}
const SHOW = 50
const localIssues = computed(() => bad.value.slice(0, SHOW).map((r) => ({ line: r.line, value: r.value, text: reasonText(r.error!, r.firstLine) })))
// Разбор сервера: номер строки — позиция в отправленном списке; переводим в строку файла.
const serverIssues = computed(() => {
  const s = server.value
  if (!s) return []
  const sent = good.value
  const line = (i: SerialIssue) => sent[i.row - 1]?.line ?? i.row
  return [...s.invalid, ...s.duplicatesInList, ...s.duplicatesExisting].slice(0, SHOW).map((i) => ({
    line: line(i), value: i.value,
    text: i.reason.startsWith('row:') ? t('preBorder.serials.dupOf', { line: sent[Number(i.reason.slice(4)) - 1]?.line ?? i.reason.slice(4) }) : reasonText(i.reason),
  }))
})
const issues = computed(() => (serverIssues.value.length ? serverIssues.value : localIssues.value))
const issueCount = computed(() => {
  const s = server.value
  return s ? s.invalid.length + s.duplicatesInList.length + s.duplicatesExisting.length : bad.value.length
})

const canSave = computed(() => good.value.length > 0 && bad.value.length === 0 && !saving.value)
const save = async () => {
  if (!canSave.value) return
  saving.value = true
  server.value = null
  try {
    const r = await preBorderApi.saveSerials(props.caseId, good.value.map((x) => x.value), mode.value, replace.value || props.existing === 0)
    message.success(t('preBorder.serials.saved', { n: r.added, total: r.total }))
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: { error?: string; result?: SerialNumbersResult } } })?.response
    if (res?.data?.result) server.value = res.data.result
    if (res?.status === 400) message.error(res.data?.error || t('preBorder.saveError'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('preBorder.serials.title')"
    :ok-text="t('preBorder.serials.saveBtn', { n: good.length })"
    :cancel-text="t('preBorder.cancel')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !canSave }"
    :width="600"
    data-serials-modal
    @update:open="emit('update:open', $event)"
    @ok="save"
  >
    <template #description>{{ t('preBorder.serials.hint') }}</template>
    <div class="flex flex-col gap-4 pb-2">
      <ZField :label="t('preBorder.serials.mode')">
        <ZSegmented :value="mode" :options="MODES" data-serials-mode @update:value="mode = $event as SerialKindMode" />
      </ZField>
      <div class="flex flex-wrap items-center gap-3">
        <ZUpload accept=".xlsx,.xls" :max-size-mb="25" :loading="parsing" class="max-sm:w-full" data-serials-upload @select="onFile">
          {{ t('preBorder.serials.fromExcel') }}
        </ZUpload>
        <span v-if="source" class="min-w-0 text-sm text-ink-2 [overflow-wrap:anywhere]" data-serials-source>
          {{ source.name }}<template v-if="source.header"> · {{ t('preBorder.serials.column', { name: source.header }) }}</template>
        </span>
      </div>
      <ZField :label="t('preBorder.serials.paste')" :help="t('preBorder.serials.pasteHelp')">
        <ZTextarea v-model:value="text" :rows="4" data-serials-text />
      </ZField>
      <ZCheckbox v-if="existing > 0" v-model:checked="replace" class="flex min-h-11 items-center gap-2 text-sm text-ink-2 sm:min-h-8" data-serials-replace>
        {{ t('preBorder.serials.replace', { n: existing }) }}
      </ZCheckbox>

      <div v-if="items.length" class="flex flex-col gap-2 rounded-row bg-sunken px-3 py-2.5" data-serials-preview>
        <p class="m-0 text-sm text-ink">
          {{ t('preBorder.serials.summary', { n: good.length, imei }) }}
          <b v-if="issueCount" class="font-semibold text-tone-danger-fg" data-serials-issues-count> · {{ t('preBorder.serials.issues', { n: issueCount }) }}</b>
        </p>
        <ul v-if="issues.length" role="list" class="m-0 flex max-h-56 list-none flex-col gap-1 overflow-auto p-0 text-xs" data-serials-issues>
          <li v-for="(i, k) in issues" :key="k" class="flex flex-wrap gap-x-2 text-ink-2">
            <span class="tabular-nums text-muted">{{ t('preBorder.serials.line', { n: i.line }) }}</span>
            <span class="font-mono [overflow-wrap:anywhere] text-ink">{{ i.value }}</span>
            <span class="text-tone-danger-fg">{{ i.text }}</span>
          </li>
        </ul>
        <p v-if="issueCount > SHOW" class="m-0 text-xs text-muted">{{ t('preBorder.serials.more', { n: issueCount - SHOW }) }}</p>
      </div>
      <ZButton v-if="source" size="sm" variant="ghost" class="self-start max-sm:h-11" data-serials-reset @click="source = null; server = null">{{ t('preBorder.serials.reset') }}</ZButton>
    </div>
  </ZModal>
</template>
