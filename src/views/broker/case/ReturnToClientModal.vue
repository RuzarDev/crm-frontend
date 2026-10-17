<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { Import40CaseDto } from '@/api/import40'
import { reworkApi, type ReworkSuggestionDto } from '@/api/import40Rework'
import {
  REWORK_KINDS, buildItems, dtCodesOf, emptyChecks, otherMissingTitle, parseCodes, suggestionAdded,
  type ReworkChecks, type ReworkExtraRow,
} from './rework'
import { doneKey, type CaseActions } from './useCaseActions'

// «Вернуть на доработку» (17.10): галочки видов документов с комментарием к каждому, «Другой документ» с названием,
// подсказки по нетарифным мерам (коды ТН ВЭД, по умолчанию — товаров ДТ) и общий комментарий — необязательный,
// если отмечен хотя бы один документ. Отправка — return-to-client с items; окно закрывается после успеха.
const props = defineProps<{ open: boolean; kase: Import40CaseDto | null; actions: CaseActions }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const checks = reactive<ReworkChecks>(emptyChecks())
const extra = ref<ReworkExtraRow[]>([])
const comment = ref('')
let rowSeq = 0

// ---- Подсказки по нетарифным мерам ----
const codesText = ref('')
const sugg = ref<ReworkSuggestionDto[] | null>(null)
const suggLoading = ref(false)
const suggError = ref(false)
const suggCodes = ref<string[]>([])
let suggSeq = 0

const find = async () => {
  const id = props.kase?.id
  const codes = parseCodes(codesText.value)
  suggCodes.value = codes
  suggError.value = false
  if (!id || !codes.length) {
    sugg.value = null
    return
  }
  const my = ++suggSeq
  suggLoading.value = true
  try {
    // Поле кодов — единственный источник: коды ДТ сервер не добавляет (dt=false), их уже подставили в поле.
    const r = await reworkApi.suggestions(id, codes, { dt: false, silent: true })
    if (my === suggSeq) sugg.value = r.items
  } catch {
    if (my === suggSeq) {
      sugg.value = null
      suggError.value = true
    }
  } finally {
    if (my === suggSeq) suggLoading.value = false
  }
}

// Каждое открытие — с чистого листа; коды — товаров ДТ, по ним сразу ищем подсказки.
watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(checks, emptyChecks())
  extra.value = []
  comment.value = ''
  sugg.value = null
  suggError.value = false
  const codes = dtCodesOf(props.kase)
  codesText.value = codes.join(', ')
  suggCodes.value = codes
  if (codes.length) void find()
}, { immediate: true })

const addOther = () => {
  extra.value.push({ key: `o${++rowSeq}`, kind: 'other', title: '', note: '', code: null })
}
const addSuggestion = (s: ReworkSuggestionDto) => {
  if (suggestionAdded(extra.value, s)) return
  extra.value.push({ key: `s${++rowSeq}`, kind: s.kind, title: s.title, note: t('rework.sugg.codeNote', { code: s.code }), code: s.code })
}
const removeRow = (key: string) => { extra.value = extra.value.filter((r) => r.key !== key) }
const rowTitle = (r: ReworkExtraRow) => r.title.trim() || t('client.docKind.other.name')

// ---- Отправка ----
const items = computed(() => buildItems(checks, extra.value))
const missingTitle = computed(() => otherMissingTitle(extra.value))
const canSubmit = computed(() => (items.value.length > 0 || !!comment.value.trim()) && !missingTitle.value)
const pending = computed(() => props.actions.isPending('return-to-client'))
const close = () => { if (!pending.value) emit('update:open', false) }

const submit = async () => {
  const id = props.kase?.id
  if (!id || !canSubmit.value || props.actions.busy()) return
  const reason = comment.value.trim() || null
  const body = items.value
  const ok = await props.actions.mutate('return-to-client', () => reworkApi.returnToClient(id, reason, body), {
    done: doneKey('return-to-client'),
  })
  if (ok && props.open) emit('update:open', false)
}

const rowBox = 'flex flex-col gap-2 rounded-row border border-line bg-surface p-3'
const iconBtn = 'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent text-muted outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus sm:size-8'
</script>

<template>
  <ZModal
    :open="open"
    :title="t('rework.title')"
    :width="640"
    :ok-text="t('import40Case.returnOk')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="pending"
    :ok-button-props="{ disabled: !canSubmit }"
    :cancel-button-props="{ disabled: pending }"
    data-reason-modal="return"
    data-rework-modal
    @update:open="(v: boolean) => { if (!v) close() }"
    @ok="submit"
  >
    <div class="flex flex-col gap-5">
      <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend class="mb-0.5 p-0 text-sm font-semibold text-ink">{{ t('rework.kindsLabel') }}</legend>
        <p class="m-0 text-[13px] text-ink-3">{{ t('rework.kindsHint') }}</p>
        <ul role="list" class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="k in REWORK_KINDS" :key="k" class="flex flex-col gap-1.5" :data-rework-kind="k">
            <ZCheckbox v-model:checked="checks[k].on" class="min-h-11 sm:min-h-8">{{ t(`client.docKind.${k}.name`) }}</ZCheckbox>
            <ZInput
              v-if="checks[k].on"
              v-model:value="checks[k].note"
              :placeholder="t('rework.notePh')"
              :aria-label="t('rework.noteLabel', { title: t(`client.docKind.${k}.name`) })"
              :maxlength="2000"
              class="sm:ml-7"
              :data-rework-note="k"
            />
          </li>
        </ul>

        <div v-for="r in extra" :key="r.key" :class="rowBox" data-rework-extra :data-rework-extra-kind="r.kind">
          <div class="flex items-start gap-2">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="text-xs text-muted">
                {{ t(`client.docKind.${r.kind}.name`) }}<template v-if="r.code"> · <span class="font-mono">{{ r.code }}</span></template>
              </span>
              <ZInput
                v-if="r.kind === 'other'"
                v-model:value="r.title"
                :placeholder="t('rework.otherTitlePh')"
                :aria-label="t('rework.otherTitleLabel')"
                :invalid="!r.title.trim()"
                :maxlength="300"
                data-rework-other-title
              />
              <span v-else class="text-sm font-medium text-ink [overflow-wrap:anywhere]">{{ r.title }}</span>
            </div>
            <button type="button" :class="iconBtn" :aria-label="t('rework.removeRow', { title: rowTitle(r) })" data-rework-remove @click="removeRow(r.key)">
              <PhX :size="16" aria-hidden="true" />
            </button>
          </div>
          <ZInput
            v-model:value="r.note"
            :placeholder="t('rework.notePh')"
            :aria-label="t('rework.noteLabel', { title: rowTitle(r) })"
            :maxlength="2000"
            data-rework-extra-note
          />
        </div>

        <ZButton variant="ghost" size="sm" class="self-start max-sm:h-11" data-rework-add-other @click="addOther">
          <template #icon><PhPlus :size="14" aria-hidden="true" /></template>
          {{ t('rework.otherAdd') }}
        </ZButton>
      </fieldset>

      <section class="flex flex-col gap-2.5 rounded-panel border border-line bg-canvas p-3 sm:p-4" aria-labelledby="rework-sugg-title" data-rework-sugg>
        <h3 id="rework-sugg-title" class="m-0 text-sm font-semibold text-ink">{{ t('rework.sugg.title') }}</h3>
        <ZField :label="t('rework.sugg.codesLabel')" :extra="t('rework.sugg.codesHint')">
          <div class="flex flex-col gap-2 sm:flex-row">
            <ZInput v-model:value="codesText" mono :placeholder="t('rework.sugg.codesPh')" class="min-w-0 flex-1" data-rework-codes @keydown.enter.prevent="find" />
            <ZButton :loading="suggLoading" class="max-sm:h-11 max-sm:w-full" data-rework-find @click="find">{{ t('rework.sugg.find') }}</ZButton>
          </div>
        </ZField>
        <p v-if="suggError" role="alert" class="m-0 text-sm text-tone-danger-fg" data-rework-sugg-error>{{ t('rework.sugg.error') }}</p>
        <p v-else-if="!suggCodes.length" class="m-0 text-sm text-ink-3" data-rework-sugg-nocodes>{{ t('rework.sugg.noCodes') }}</p>
        <p v-else-if="sugg && !sugg.length" class="m-0 text-sm text-ink-3" data-rework-sugg-empty>{{ t('rework.sugg.empty') }}</p>
        <ul v-else-if="sugg" role="list" class="m-0 flex list-none flex-col p-0">
          <li
            v-for="s in sugg"
            :key="`${s.code}:${s.kind}:${s.title}`"
            class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line py-2 last:border-b-0"
            data-rework-sugg-row
          >
            <div class="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
              <span class="text-sm text-ink [overflow-wrap:anywhere]">
                <span class="font-mono text-[13px] text-ink-2">{{ s.code }}</span> · {{ s.title }}
              </span>
              <span v-if="s.act" class="text-xs text-muted [overflow-wrap:anywhere]" :title="s.measure">{{ s.act }}</span>
            </div>
            <ZButton
              size="sm"
              :disabled="suggestionAdded(extra, s)"
              :aria-label="t('rework.sugg.addAria', { title: s.title, code: s.code })"
              class="max-sm:h-11 max-sm:w-full"
              data-rework-sugg-add
              @click="addSuggestion(s)"
            >{{ suggestionAdded(extra, s) ? t('rework.sugg.added') : t('rework.sugg.add') }}</ZButton>
          </li>
        </ul>
      </section>

      <ZField :label="t('rework.commentLabel')" :extra="items.length ? t('rework.commentOptional') : undefined">
        <ZTextarea v-model:value="comment" :rows="3" :placeholder="t('rework.commentPh')" data-reason-input />
      </ZField>

      <p v-if="missingTitle" role="alert" class="m-0 text-sm text-tone-danger-fg" data-rework-missing-title>{{ t('rework.otherNeedsTitle') }}</p>
      <p v-else-if="!canSubmit" class="m-0 text-sm text-ink-3" data-rework-need>{{ t('rework.needSomething') }}</p>
    </div>
  </ZModal>
</template>
