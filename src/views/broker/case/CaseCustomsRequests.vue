<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBell, PhCaretDown, PhChatCircleText, PhCheckCircle, PhPaperclip, PhSiren } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import {
  customsRequestsApi, type CustomsRequestDto, type CustomsRequestFile, type CustomsRequestStage,
} from '@/api/customsRequests'
import { import40Api } from '@/api/import40'
import { ALL_DOC_KINDS } from '@/views/client/docKinds'
import {
  STAGES, almatyToday, canCreateAtStatus, dateLabel, defaultStage, docKindName, dueDateLabel, dueForApi, dueTimeLabel,
  elapsedLabel, hasClientDebt, isActive, isDuePast, isWaiting, stageOf, stagesAt, waitingKey,
} from '@/utils/customsRequests'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// Запросы таможни сотрудника (волна 17.10, задача 5) — карточка заявки и страница ДТ (там — запросы этой ДТ и всей
// заявки). Ждёт клиента — красная плашка «Запрос таможни · N ч без ответа» с «Ответить таможне» и «Напомнить
// клиенту»; клиент ответил — его ответ и файлы; закрытые — свёрнуты. Кнопка «Запрос таможни» (17.10) — в три момента:
// на границе (шаг 2), при проверке ДТ (шаг 3), после выпуска — в том числе по выполненной заявке (камеральная проверка).
const props = defineProps<{
  caseId: string
  status: number
  list: CustomsRequestDto[]
  declarations: { id: string; declarationNumber?: string | null }[]
  /** Страница ДТ: показываем запросы этой ДТ и всей заявки, новый — по этой ДТ. */
  declarationId?: string | null
  canManage: boolean
  canRemind: boolean
  /** Открыть форму нового запроса сразу (кнопка «Завести запрос таможни» в уведомлении КЕДЕН, 17.10). */
  autoCreate?: boolean
  /** Чек об оплате СВХ ещё не загружен (статус 6 — есть о чём напомнить). Не передан — неизвестно (страница ДТ):
   * отдельной «Напомнить клиенту» на статусе 6 нет. */
  svhCheckMissing?: boolean
}>()
const emit = defineEmits<{ changed: []; autoOpened: [] }>()
const { t } = useI18n()
const uid = useId()

const scoped = computed(() =>
  props.declarationId ? props.list.filter((r) => !r.declarationId || r.declarationId === props.declarationId) : props.list)
const active = computed(() => scoped.value.filter(isActive))
const closed = computed(() => scoped.value.filter((r) => !isActive(r)))
const canCreate = computed(() => props.canManage && canCreateAtStatus(props.status))
// Отдельная «Напомнить клиенту» — когда ждём клиента не по запросу (черновик, счёт СВХ); у запроса — своя кнопка.
const remindStandalone = computed(() =>
  props.canRemind && props.status < 8 && !active.value.some(isWaiting)
  && hasClientDebt(props.status, [], !props.svhCheckMissing))
const visible = computed(() => active.value.length > 0 || closed.value.length > 0 || canCreate.value || remindStandalone.value)

const showClosed = ref(false)
const busy = ref<string | null>(null)

// ---- Новый запрос ----
const createOpen = ref(false)
const form = ref({
  text: '', kinds: [] as string[], due: null as string | null, time: '', dt: '', stage: 'declaration' as CustomsRequestStage,
})
// Все три момента видны, недоступные на этом статусе — выключены (как CanCreateAt на сервере).
const stageOptions = computed(() => {
  const allowed = stagesAt(props.status)
  return STAGES.map((s) => ({ value: s, label: t(`customsRequest.stage.${s}`), disabled: !allowed.includes(s) }))
})
const dtOptions = computed(() => [
  { value: '', label: t('customsRequest.dtNone') },
  ...props.declarations.map((d) => ({ value: d.id, label: d.declarationNumber || t('broker.dt.banners.noNumber') })),
])
const openCreate = () => {
  form.value = {
    text: '', kinds: [], due: null, time: '',
    dt: props.declarationId ?? (props.declarations.length === 1 ? props.declarations[0].id : ''),
    stage: defaultStage(props.status) ?? 'declaration',
  }
  createOpen.value = true
}
// Форма открывается один раз, когда запрос можно завести (статус и права известны); иначе — просто снимаем флаг.
watch(() => [props.autoCreate, canCreate.value] as const, ([auto, can]) => {
  if (!auto) return
  if (can) openCreate()
  emit('autoOpened')
}, { immediate: true })
const toggleKind = (k: string, on: boolean) => {
  form.value.kinds = on ? [...form.value.kinds, k] : form.value.kinds.filter((x) => x !== k)
}
// Срок в прошлом не принимаем (как сервер): дата раньше сегодняшней по Алматы или время уже прошло. Ошибка — у того
// поля, которое её дало: дата (обычно её не даёт выбрать min) или время.
const duePast = computed(() => isDuePast(form.value.due, form.value.time))
const dueDatePast = computed(() => !!form.value.due && form.value.due < almatyToday())
const dueTimePast = computed(() => duePast.value && !dueDatePast.value)
const dueMin = computed(() => (createOpen.value ? almatyToday() : undefined))
const submitCreate = async () => {
  const text = form.value.text.trim()
  if (!text || duePast.value || busy.value) return
  busy.value = 'create'
  try {
    await customsRequestsApi.create(props.caseId, {
      text,
      stage: form.value.stage,
      docKinds: form.value.kinds,
      declarationId: form.value.dt || null,
      // Срок — день и (необязательно) время; без времени — только дата (dueHasTime = false).
      ...dueForApi(form.value.due, form.value.time),
    })
    createOpen.value = false
    message.success(t('customsRequest.created'))
    emit('changed')
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts).
  } finally {
    busy.value = null
  }
}

// ---- «Ответить таможне» (закрыть запрос) ----
const closing = ref<CustomsRequestDto | null>(null)
const closeNote = ref('')
const openClose = (r: CustomsRequestDto) => { closing.value = r; closeNote.value = '' }
const submitClose = async () => {
  const r = closing.value
  if (!r || busy.value) return
  busy.value = `close:${r.id}`
  try {
    await customsRequestsApi.close(props.caseId, r.id, closeNote.value.trim() || undefined)
    closing.value = null
    message.success(t('customsRequest.closed'))
    emit('changed')
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = null
  }
}

// ---- «Напомнить клиенту» ----
const remindOpen = ref(false)
const remindText = ref('')
const openRemind = () => { remindText.value = ''; remindOpen.value = true }
const submitRemind = async () => {
  if (busy.value) return
  busy.value = 'remind'
  try {
    await customsRequestsApi.remindClient(props.caseId, remindText.value)
    remindOpen.value = false
    message.success(t('customsRequest.reminded'))
    emit('changed')
  } catch {
    // 409 «уже напомнили» / «нечего напоминать» — текст показал перехватчик.
  } finally {
    busy.value = null
  }
}

const download = async (f: CustomsRequestFile) => {
  try {
    saveBlob(await import40Api.downloadFile(props.caseId, f.id), f.fileName)
  } catch {
    // Текст ошибки показал общий перехватчик.
  }
}

/** «17.10.2026» или «17.10.2026 15:00» — срок со временем, если его указали. */
const dueText = (r: CustomsRequestDto) => [dueDateLabel(r), dueTimeLabel(r)].filter(Boolean).join(' ')
const stageName = (r: CustomsRequestDto) => t(`customsRequest.stage.${stageOf(r)}`)

const metaOf = (r: CustomsRequestDto): string[] => {
  const parts: string[] = [stageName(r)]
  if (r.declarationNumber) parts.push(t('customsRequest.dt', { n: r.declarationNumber }))
  if (r.corridor) parts.push(t('customsRequest.corridor', { c: t(`customsRequest.corridorName.${r.corridor}`) }))
  if (r.dueAtUtc) parts.push(t('customsRequest.due', { date: dueText(r) }))
  if (r.createdByName) parts.push(t('customsRequest.by', { name: r.createdByName }))
  if (r.lastReminderAtUtc) parts.push(t('customsRequest.lastReminder', { time: elapsedLabel(r.lastReminderAtUtc, t) }))
  return parts
}
const docsOf = (r: CustomsRequestDto) => r.docKinds.map((k) => docKindName(k, t)).join(', ')

const btn = 'max-sm:h-11 max-sm:w-full'
const outlineBtn = 'bg-surface shadow-[inset_0_0_0_1px_var(--color-line-strong)] enabled:hover:bg-canvas'
</script>

<template>
  <section v-if="visible" :aria-labelledby="`cr-title-${uid}`" class="flex flex-col gap-3" data-customs-requests>
    <h2 :id="`cr-title-${uid}`" class="sr-only">{{ t('customsRequest.title') }}</h2>

    <article
      v-for="r in active"
      :key="r.id"
      :class="cn(
        'flex flex-col gap-2 rounded-panel border px-[18px] py-3.5 text-sm',
        r.status === 'open' ? 'border-tone-danger-fg/20 bg-tone-danger-bg' : 'border-line bg-surface',
      )"
      :data-customs-request="r.status"
      :data-customs-stage="stageOf(r)"
    >
      <div class="flex flex-wrap items-start gap-x-3.5 gap-y-2">
        <PhSiren v-if="r.status === 'open'" :size="18" class="mt-0.5 shrink-0 text-tone-danger-fg" aria-hidden="true" />
        <PhChatCircleText v-else :size="18" class="mt-0.5 shrink-0 text-zircon-ink" aria-hidden="true" />
        <div class="min-w-0 flex-1 basis-60">
          <div :class="cn('font-semibold', r.status === 'open' ? 'text-tone-danger-fg' : 'text-ink')" data-customs-label>
            <template v-if="r.status === 'open'">{{ t(waitingKey(stageOf(r)), { time: elapsedLabel(r.createdAtUtc, t) }) }}</template>
            <template v-else>{{ t('customsRequest.answeredLabel') }} · {{ elapsedLabel(r.answeredAtUtc ?? r.createdAtUtc, t) }}</template>
          </div>
          <p v-if="metaOf(r).length" class="m-0 mt-0.5 text-xs text-ink-3" data-customs-meta>{{ metaOf(r).join(' · ') }}</p>
          <p class="m-0 mt-1.5 whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]" data-customs-text>{{ r.text }}</p>
          <p v-if="r.docKinds.length" class="m-0 mt-1 text-ink-3" data-customs-docs>{{ t('customsRequest.docs', { list: docsOf(r) }) }}</p>
        </div>
      </div>

      <div v-if="r.answerText || r.answerFiles.length" class="flex flex-col gap-1.5 rounded-row bg-canvas px-3 py-2.5 sm:ml-8" data-customs-answer>
        <p v-if="r.answerText" class="m-0 whitespace-pre-line text-ink [overflow-wrap:anywhere]">{{ r.answerText }}</p>
        <ul v-if="r.answerFiles.length" role="list" :aria-label="t('customsRequest.files')" class="m-0 flex list-none flex-wrap gap-2 p-0">
          <li v-for="f in r.answerFiles" :key="f.id">
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-1 font-sans text-sm font-medium text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-8"
              data-customs-file
              @click="download(f)"
            >
              <PhPaperclip :size="14" aria-hidden="true" />
              <span class="[overflow-wrap:anywhere]">{{ f.fileName }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="canManage || (canRemind && r.status === 'open')" class="flex flex-col gap-2 sm:ml-8 sm:flex-row sm:flex-wrap">
        <ZButton
          v-if="canManage"
          size="sm"
          :variant="r.status === 'answered' ? 'primary' : 'secondary'"
          :class="cn(btn, r.status !== 'answered' && outlineBtn)"
          :loading="busy === `close:${r.id}`"
          :disabled="!!busy && busy !== `close:${r.id}`"
          data-customs-close
          @click="openClose(r)"
        >
          <template #icon><PhCheckCircle :size="15" aria-hidden="true" /></template>
          {{ t('customsRequest.answerToCustoms') }}
        </ZButton>
        <ZButton
          v-if="canRemind && r.status === 'open'"
          size="sm"
          :class="cn(btn, outlineBtn)"
          :disabled="!!busy"
          data-customs-remind
          @click="openRemind"
        >
          <template #icon><PhBell :size="15" aria-hidden="true" /></template>
          {{ t('customsRequest.remind') }}
        </ZButton>
      </div>
    </article>

    <div v-if="canCreate || remindStandalone" class="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-customs-toolbar>
      <ZButton v-if="canCreate" size="sm" :class="cn(btn, outlineBtn)" :disabled="!!busy" data-customs-create @click="openCreate">
        <template #icon><PhSiren :size="15" aria-hidden="true" /></template>
        {{ t('customsRequest.create') }}
      </ZButton>
      <ZButton v-if="remindStandalone" size="sm" :class="cn(btn, outlineBtn)" :disabled="!!busy" data-customs-remind-case @click="openRemind">
        <template #icon><PhBell :size="15" aria-hidden="true" /></template>
        {{ t('customsRequest.remind') }}
      </ZButton>
    </div>

    <div v-if="closed.length" class="rounded-panel border border-line bg-surface" data-customs-closed>
      <button
        type="button"
        :aria-expanded="showClosed"
        :aria-controls="`cr-closed-${uid}`"
        class="flex min-h-11 w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-[18px] py-2 text-left font-sans text-[13px] text-ink-3 outline-hidden hover:bg-canvas focus-visible:shadow-focus"
        data-customs-closed-toggle
        @click="showClosed = !showClosed"
      >
        <span class="flex-1">{{ t('customsRequest.showClosed', { n: closed.length }) }}</span>
        <PhCaretDown :size="14" :class="cn('transition-transform motion-reduce:transition-none', showClosed && 'rotate-180')" aria-hidden="true" />
      </button>
      <ul v-if="showClosed" :id="`cr-closed-${uid}`" role="list" class="m-0 flex list-none flex-col p-0">
        <li v-for="r in closed" :key="r.id" class="border-t border-line px-[18px] py-2.5 text-[13px]" data-customs-closed-row>
          <div class="text-ink-2 [overflow-wrap:anywhere]">{{ r.text }}</div>
          <div class="mt-0.5 text-xs text-ink-3">
            {{ stageName(r) }} · {{ t('customsRequest.closedLabel') }} · {{ dateLabel(r.closedAtUtc) }}<template v-if="r.closedByName"> · {{ r.closedByName }}</template><template v-if="r.closeNote"> · {{ r.closeNote }}</template>
          </div>
        </li>
      </ul>
    </div>

    <ZModal
      v-model:open="createOpen"
      :title="t('customsRequest.createTitle')"
      :ok-text="t('customsRequest.createOk')"
      :cancel-text="t('common.cancel')"
      :confirm-loading="busy === 'create'"
      :ok-button-props="{ disabled: !form.text.trim() || duePast }"
      :width="560"
      data-customs-create-modal
      @ok="submitCreate"
    >
      <p class="m-0 mb-3 text-sm text-ink-3">{{ t('customsRequest.createHint') }}</p>
      <div class="flex flex-col gap-4">
        <ZField :label="t('customsRequest.stageLabel')" :extra="t(`customsRequest.stageHint.${form.stage}`)">
          <ZRadioGroup
            :value="form.stage"
            :options="stageOptions"
            orientation="vertical"
            data-customs-stage-input
            @update:value="(v) => { form.stage = v as CustomsRequestStage }"
          />
        </ZField>
        <!-- ТК ЕАЭС ст. 325 / 125: при проверке ДТ документы — не позднее чем за 4 ч до истечения срока выпуска. -->
        <ZAlert v-if="form.stage === 'declaration'" type="warning" show-icon :message="t('customsRequest.rule4h')" data-customs-rule4h />
        <ZField :label="t('customsRequest.textLabel')" required>
          <ZTextarea v-model:value="form.text" :rows="3" :placeholder="t('customsRequest.textPh')" data-customs-text-input />
        </ZField>
        <fieldset class="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
          <legend class="mb-1.5 p-0 text-sm font-medium text-ink">{{ t('customsRequest.docsLabel') }}</legend>
          <div class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <ZCheckbox
              v-for="k in ALL_DOC_KINDS"
              :key="k"
              :checked="form.kinds.includes(k)"
              class="min-h-11 sm:min-h-8"
              :data-customs-kind="k"
              @update:checked="(v: boolean) => toggleKind(k, v)"
            >{{ docKindName(k, t) }}</ZCheckbox>
          </div>
        </fieldset>
        <div class="grid gap-4 sm:grid-cols-2">
          <ZField :label="t('customsRequest.dueLabel')" :error="dueDatePast ? t('customsRequest.duePast') : undefined">
            <ZDate v-model:value="form.due" :min="dueMin" allow-clear data-customs-due />
          </ZField>
          <ZField :label="t('customsRequest.dueTimeLabel')" :error="dueTimePast ? t('customsRequest.dueTimePast') : undefined">
            <ZInput v-model:value="form.time" type="time" :disabled="!form.due" data-customs-due-time />
          </ZField>
          <ZField v-if="!declarationId && declarations.length" :label="t('customsRequest.dtLabel')">
            <ZSelect v-model:value="form.dt" :options="dtOptions" data-customs-dt />
          </ZField>
        </div>
      </div>
    </ZModal>

    <ZModal
      :open="closing !== null"
      :title="t('customsRequest.answerToCustomsTitle')"
      :ok-text="t('customsRequest.closeOk')"
      :cancel-text="t('common.cancel')"
      :confirm-loading="!!closing && busy === `close:${closing.id}`"
      :width="480"
      data-customs-close-modal
      @update:open="(v: boolean) => { if (!v && !busy) closing = null }"
      @ok="submitClose"
    >
      <p class="m-0 mb-3 text-sm text-ink-3">{{ t('customsRequest.answerToCustomsHint') }}</p>
      <ZField :label="t('customsRequest.closeNoteLabel')">
        <ZTextarea v-model:value="closeNote" :rows="2" data-customs-close-note />
      </ZField>
    </ZModal>

    <ZModal
      v-model:open="remindOpen"
      :title="t('customsRequest.remind')"
      :ok-text="t('customsRequest.remindOk')"
      :cancel-text="t('common.cancel')"
      :confirm-loading="busy === 'remind'"
      :width="480"
      data-customs-remind-modal
      @ok="submitRemind"
    >
      <p class="m-0 mb-3 text-sm text-ink-3">{{ t('customsRequest.remindHint') }}</p>
      <ZField :label="t('customsRequest.remindMessageLabel')">
        <ZTextarea v-model:value="remindText" :rows="2" data-customs-remind-text />
      </ZField>
    </ZModal>
  </section>
</template>
