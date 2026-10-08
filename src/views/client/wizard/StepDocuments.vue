<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhCircleNotch, PhWarningCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { import40Api, type Import40FileDto } from '@/api/import40'
import { DOC_CHECKLIST, isDocKind, type DocKindDef } from '@/views/client/docKinds'
import { useConfirm } from '@/ui/confirm'
import { cn } from '@/ui/cn'
import { stepHint, stepTitle } from './wizardUi'

// Шаг 4 «Документы» мастера (доска Wizard): чек-лист видов документов (у строки — своя загрузка с видом),
// зона «Другие документы», отметка ответственности. Отправку делает мастер (кнопка в его нижней панели):
// ему нужны файлы (v-model:files), отметка (v-model:accepted) и «идёт загрузка» (v-model:busy).
// Удалять свои файлы клиент может только в черновике — мастер открывается лишь для черновика.
const props = defineProps<{ caseId: string }>()
const files = defineModel<Import40FileDto[]>('files', { default: () => [] })
const accepted = defineModel<boolean>('accepted', { default: false })
const busy = defineModel<boolean>('busy', { default: false })

const { t, te, locale } = useI18n()
const { confirm } = useConfirm()
const uid = useId()
const headingId = `wz-docs-${uid}`

type RowKind = DocKindDef['key'] | 'other'
const ACCEPT = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx']
const MAX_MB = 25

/** Вид файла для раскладки: без вида (старый мастер) и неизвестный — в «Других документах». */
const rowOf = (f: Import40FileDto): RowKind => {
  const k = f.docKind
  return isDocKind(k) && k !== 'other' ? (k as RowKind) : 'other'
}
// Своя копия списка: правки от параллельных загрузок не должны затирать друг друга, пока родитель не обновил проп.
const list = ref<Import40FileDto[]>(files.value)
watch(files, (v) => { if (v !== list.value) list.value = v })
const setList = (v: Import40FileDto[]) => {
  list.value = v
  files.value = v
}
const filesOf = (kind: RowKind) => list.value.filter((f) => rowOf(f) === kind)
const otherFiles = computed(() => filesOf('other'))

// ---- Список файлов заявки: при открытии шага (уже известные показываем сразу, без мигания) ----
const loadState = ref<'loading' | 'error' | 'ready'>('loading')
const load = async () => {
  const id = props.caseId
  loadState.value = 'loading'
  try {
    const server = (await import40Api.listFiles(id, { silent: true })).filter((f) => f.section === 'documents')
    if (id !== props.caseId) return
    // Загруженное, пока шёл запрос, могло в ответ не попасть — не теряем.
    const known = new Set(server.map((f) => f.id))
    setList([...server, ...list.value.filter((f) => !known.has(f.id) && f.section === 'documents')])
    loadState.value = 'ready'
  } catch {
    if (id === props.caseId) loadState.value = 'error'
  }
}
watch(() => props.caseId, () => { void load() }, { immediate: true })

// ---- Загрузка: проверка формата и размера на клиенте, ошибки — в строке, «Повторить» шлёт те же File ----
interface RowError { name: string; text: string; file?: File }
const pending = reactive<Record<string, string[]>>({})
const errors = reactive<Record<string, RowError[]>>({})
const announce = ref('')

const extOk = (name: string) => ACCEPT.some((ext) => name.toLowerCase().endsWith(ext))
const serverReason = (e: unknown): string | null => {
  const data = (e as { response?: { data?: unknown } })?.response?.data
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const c = d.error ?? d.message ?? d.detail
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}
const failText = (name: string, reason: string | null) =>
  reason && reason.includes(name) ? reason : t('client.wizard.docs.failed', { name, reason: reason || t('client.wizard.docs.failedGeneric') })

const syncBusy = () => { busy.value = Object.values(pending).some((l) => l.length > 0) }

const uploadTo = async (kind: RowKind, picked: File[]) => {
  if (!picked.length) return
  const id = props.caseId
  const rejected: RowError[] = []
  const ok: File[] = []
  for (const f of picked) {
    if (!extOk(f.name)) rejected.push({ name: f.name, text: t('client.wizard.docs.wrongType', { name: f.name }) })
    else if (f.size > MAX_MB * 1024 * 1024) rejected.push({ name: f.name, text: t('client.wizard.docs.tooBig', { name: f.name, mb: MAX_MB }) })
    else ok.push(f)
  }
  errors[kind] = rejected
  if (!ok.length) return
  pending[kind] = [...(pending[kind] ?? []), ...ok.map((f) => f.name)]
  syncBusy()
  const done: string[] = []
  await Promise.all(ok.map(async (f) => {
    try {
      const dto = await import40Api.uploadFile(id, 'documents', f, kind, { silent: true })
      if (id !== props.caseId) return
      setList([...list.value, dto])
      done.push(dto.originalFileName || f.name)
    } catch (e) {
      errors[kind] = [...(errors[kind] ?? []), { name: f.name, text: failText(f.name, serverReason(e)), file: f }]
    } finally {
      const left = [...(pending[kind] ?? [])]
      left.splice(left.indexOf(f.name), 1)
      pending[kind] = left
      syncBusy()
    }
  }))
  if (done.length) announce.value = t('client.wizard.docs.attached', { names: done.join(', ') })
}
const retry = (kind: RowKind) => {
  const again = (errors[kind] ?? []).flatMap((e) => (e.file ? [e.file] : []))
  errors[kind] = []
  void uploadTo(kind, again)
}
const canRetry = (kind: RowKind) => (errors[kind] ?? []).some((e) => e.file)

// Свой скрытый input у каждой строки: вид документа — в самом вызове, без общего «какую строку открыли».
const inputs: Partial<Record<RowKind, HTMLInputElement>> = {}
const attachBtns: Partial<Record<RowKind, HTMLElement>> = {}
const otherZone = ref<InstanceType<typeof ZUpload>>()
const setInput = (kind: RowKind) => (el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLInputElement) inputs[kind] = el
}
const setAttachBtn = (kind: RowKind) => (el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLElement) attachBtns[kind] = el
}
const pick = (kind: RowKind) => inputs[kind]?.click()
const onPicked = (kind: RowKind, e: Event) => {
  const el = e.target as HTMLInputElement
  const picked = Array.from(el.files ?? [])
  // Сброс — чтобы повторный выбор того же файла снова вызвал change.
  el.value = ''
  void uploadTo(kind, picked)
}
const onOther = (picked: File[]) => { void uploadTo('other', picked) }

// ---- Удаление (с вопросом); фокус — на «Приложить» той же строки, а не в никуда ----
const removing = ref<string | null>(null)
const focusKind = async (kind: RowKind, scroll = false) => {
  await nextTick()
  if (kind === 'other') {
    otherZone.value?.focus()
    return
  }
  const btn = attachBtns[kind]
  if (scroll) btn?.closest('li')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  btn?.focus({ preventScroll: scroll })
}
const remove = async (f: Import40FileDto) => {
  if (removing.value) return
  const ok = await confirm({
    title: t('client.wizard.docs.removeTitle', { name: f.originalFileName }),
    okText: t('client.wizard.docs.removeOk'),
    cancelText: t('client.wizard.docs.keep'),
    danger: true,
  })
  if (!ok) return
  removing.value = f.id
  try {
    await import40Api.deleteFile(props.caseId, f.id)
    setList(list.value.filter((x) => x.id !== f.id))
    await focusKind(rowOf(f))
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    removing.value = null
  }
}

defineExpose({ focusKind: (kind: RowKind) => focusKind(kind, true) })

// ---- Вид ----
const sizeText = (bytes: number) => {
  if (bytes < 1024 * 1024) return t('client.wizard.docs.kb', { n: Math.max(1, Math.round(bytes / 1024)) })
  const tag = locale.value === 'en' ? 'en-GB' : locale.value === 'kk' ? 'kk-KZ' : 'ru-RU'
  return t('client.wizard.docs.mb', { n: (bytes / 1024 / 1024).toLocaleString(tag, { maximumFractionDigits: 1 }) })
}
const hintOf = (key: string) => {
  const k = `client.docKind.${key}.hint`
  return te(k) ? t(k) : ''
}
const dot = (has: boolean) => cn(
  'inline-flex size-[22px] shrink-0 items-center justify-center rounded-pill',
  has ? 'bg-tone-done-fg text-white' : 'border-[1.5px] border-solid border-line-strong bg-surface',
)
const linkBtn = 'inline-flex min-h-11 cursor-pointer items-center rounded-field border-0 bg-transparent px-1.5 font-sans text-sm font-semibold text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus disabled:cursor-progress disabled:text-muted sm:min-h-8'
const removeBtn = 'inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-field border-0 bg-transparent px-1.5 font-sans text-[13px] font-medium text-ink-3 outline-hidden hover:text-danger focus-visible:shadow-focus aria-busy:cursor-progress sm:min-h-7'
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-5" data-step="docs">
    <div>
      <h2 :id="headingId" tabindex="-1" :class="stepTitle">{{ t('client.wizard.docs.title') }}</h2>
      <p :class="stepHint">{{ t('client.wizard.docs.hint') }}</p>
    </div>

    <div v-if="loadState === 'error'" class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-solid border-line px-4 py-3 sm:px-[18px]" role="alert" data-docs-load-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('client.wizard.docs.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-docs-reload @click="load">{{ t('client.wizard.docs.retry') }}</ZButton>
    </div>

    <ul
      role="list"
      :aria-labelledby="headingId"
      :aria-busy="loadState === 'loading' || undefined"
      class="m-0 list-none rounded-panel border border-solid border-line p-0"
      data-docs-checklist
    >
      <li
        v-for="(d, i) in DOC_CHECKLIST"
        :key="d.key"
        :class="cn(
          'grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3.5 px-4 py-3.5 sm:px-[18px]',
          i > 0 && 'border-0 border-t border-solid border-line',
        )"
        :data-doc-kind="d.key"
      >
        <span :class="cn(dot(filesOf(d.key).length > 0), 'mt-px')" aria-hidden="true" data-doc-dot>
          <PhCheck v-if="filesOf(d.key).length" :size="12" weight="bold" />
        </span>

        <div class="min-w-0">
          <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-[15px] leading-6">
            <span class="font-semibold text-ink" data-doc-name>{{ t(`client.docKind.${d.key}.name`) }}</span>
            <span
              :class="cn('text-[12.5px]', d.need === 'required' && !filesOf(d.key).length ? 'text-gold-ink' : 'text-muted')"
              data-doc-need
            >{{ t(`client.docNeed.${d.need}`) }}</span>
          </p>

          <ul v-if="filesOf(d.key).length" role="list" class="m-0 mt-0.5 flex list-none flex-col p-0" data-doc-files>
            <li v-for="f in filesOf(d.key)" :key="f.id" class="flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink-3" data-doc-file>
              <span class="min-w-0 truncate text-ink-2" :title="f.originalFileName">{{ f.originalFileName }}</span>
              <span class="shrink-0 tabular-nums">· {{ sizeText(f.sizeBytes) }}</span>
              <button
                type="button"
                :class="cn(removeBtn, 'ml-auto sm:ml-1')"
                :aria-label="t('client.wizard.docs.removeLabel', { name: f.originalFileName })"
                :aria-busy="removing === f.id || undefined"
                data-doc-remove
                @click="remove(f)"
              >{{ t('client.wizard.docs.remove') }}</button>
            </li>
          </ul>
          <p v-else-if="hintOf(d.key)" class="m-0 mt-0.5 text-[13.5px] text-ink-3 sm:truncate" data-doc-hint>{{ hintOf(d.key) }}</p>

          <p v-if="pending[d.key]?.length" class="m-0 mt-1 flex items-center gap-1.5 text-[13px] text-ink-3" data-doc-uploading>
            <PhCircleNotch :size="14" class="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span class="min-w-0 truncate">{{ t('client.wizard.docs.uploading', { names: pending[d.key].join(', ') }) }}</span>
          </p>

          <div v-if="errors[d.key]?.length" role="alert" class="mt-1.5 flex flex-col gap-0.5" data-doc-error>
            <p v-for="(e, k) in errors[d.key]" :key="k" class="m-0 flex items-start gap-1.5 text-[13px] text-ink-2">
              <PhWarningCircle :size="15" weight="bold" class="mt-px shrink-0 text-danger" aria-hidden="true" />
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ e.text }}</span>
            </p>
            <button
              v-if="canRetry(d.key)"
              type="button"
              :class="cn(linkBtn, '-ml-1.5 self-start text-[13px]')"
              data-doc-retry
              @click="retry(d.key)"
            >{{ t('client.wizard.docs.retry') }}</button>
          </div>
        </div>

        <span class="-mr-1.5 max-sm:-mt-2.5 sm:-mt-1">
          <button
            :ref="setAttachBtn(d.key)"
            type="button"
            :class="linkBtn"
            :disabled="!!pending[d.key]?.length || undefined"
            :aria-busy="!!pending[d.key]?.length || undefined"
            data-doc-attach
            @click="pick(d.key)"
          >
            {{ filesOf(d.key).length ? t('client.wizard.docs.addMore') : t('client.wizard.docs.attach') }}<span class="sr-only">: {{ t(`client.docKind.${d.key}.name`) }}</span>
          </button>
          <input
            :ref="setInput(d.key)"
            type="file"
            multiple
            :accept="ACCEPT.join(',')"
            class="hidden"
            tabindex="-1"
            aria-hidden="true"
            data-doc-input
            @change="onPicked(d.key, $event)"
          >
        </span>
      </li>
    </ul>

    <div class="flex flex-col gap-2" data-docs-other>
      <ZUpload
        ref="otherZone"
        type="drag"
        multiple
        :accept="ACCEPT.join(',')"
        :max-size-mb="MAX_MB"
        data-docs-drop
        @select="onOther"
      >
        <span class="flex flex-col gap-1">
          <span class="text-[14.5px] font-semibold text-ink">{{ t('client.wizard.docs.otherDrop') }}</span>
          <span class="text-[13px] text-muted">{{ t('client.wizard.docs.formats') }}</span>
        </span>
      </ZUpload>

      <ul v-if="otherFiles.length" role="list" :aria-label="t('client.wizard.docs.other')" class="m-0 flex list-none flex-col p-0 px-1" data-other-files>
        <li v-for="f in otherFiles" :key="f.id" class="flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink-3" data-doc-file>
          <PhCheck :size="13" weight="bold" class="shrink-0 text-tone-done-fg" aria-hidden="true" />
          <span class="min-w-0 truncate text-ink-2" :title="f.originalFileName">{{ f.originalFileName }}</span>
          <span class="shrink-0 tabular-nums">· {{ sizeText(f.sizeBytes) }}</span>
          <button
            type="button"
            :class="cn(removeBtn, 'ml-auto sm:ml-1')"
            :aria-label="t('client.wizard.docs.removeLabel', { name: f.originalFileName })"
            :aria-busy="removing === f.id || undefined"
            data-doc-remove
            @click="remove(f)"
          >{{ t('client.wizard.docs.remove') }}</button>
        </li>
      </ul>
      <p v-if="pending.other?.length" class="m-0 flex items-center gap-1.5 px-1 text-[13px] text-ink-3" data-doc-uploading>
        <PhCircleNotch :size="14" class="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ t('client.wizard.docs.uploading', { names: pending.other.join(', ') }) }}</span>
      </p>
      <div v-if="errors.other?.length" role="alert" class="flex flex-col gap-0.5 px-1" data-doc-error>
        <p v-for="(e, k) in errors.other" :key="k" class="m-0 flex items-start gap-1.5 text-[13px] text-ink-2">
          <PhWarningCircle :size="15" weight="bold" class="mt-px shrink-0 text-danger" aria-hidden="true" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{{ e.text }}</span>
        </p>
        <button
          v-if="canRetry('other')"
          type="button"
          :class="cn(linkBtn, '-ml-1.5 self-start text-[13px]')"
          data-doc-retry
          @click="retry('other')"
        >{{ t('client.wizard.docs.retry') }}</button>
      </div>
    </div>

    <ZCheckbox
      v-model:checked="accepted"
      class="flex items-start gap-3 rounded-[12px] bg-sunken px-4 py-3.5 text-sm leading-[21px] text-ink-2 [&>button]:mt-[3px]"
      data-docs-resp
    >{{ t('client.wizard.docs.resp') }}</ZCheckbox>

    <p class="sr-only" role="status">{{ announce }}</p>
  </section>
</template>
