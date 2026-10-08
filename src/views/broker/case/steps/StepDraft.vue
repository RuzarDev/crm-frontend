<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { import40Api, type Import40UpdateRequest } from '@/api/import40'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ZOptionValue } from '@/ui/options'
import CaseDocsSlot from '../CaseDocsSlot.vue'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { DRAFT_FIELDS, TRANSPORT_FIELDS, decideCommit, draftValueOf, type DraftField } from '../draftFields'
import DraftClientData from './DraftClientData.vue'
import DraftContainers from './DraftContainers.vue'
import DraftReadonly from './DraftReadonly.vue'

// Шаг 1 «Заявка и документы» (статус 0). Сотрудник с import40.declarant или import40.assign (и администратор) ведёт черновик
// за клиента: груз, пост (сохранение по blur и Enter — PUT, ответ заменяет заявку), вид транспорта и поля по виду, контейнеры,
// документы раздела documents, «Отправить на оформление». Остальные видят шаг в режиме чтения. Пройденный шаг (mode done) — чтение.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const canEdit = computed(() => props.mode === 'current' && props.ctx.perms.canManageDraft)

// ---- Поля: локальная копия заявки; несохранённая правка не затирается перечитыванием (другие действия обновляют заявку) ----
const form = reactive<Record<DraftField, string>>(Object.fromEntries(DRAFT_FIELDS.map((f) => [f, ''])) as Record<DraftField, string>)
const synced: Partial<Record<DraftField, string>> = {}
/** Под полем «нельзя оставить пустым»: сервер этих полей не очищает. */
const emptyError = reactive<Partial<Record<DraftField, boolean>>>({})

watch(kase, (c) => {
  for (const f of DRAFT_FIELDS) {
    const v = draftValueOf(c, f)
    if (form[f] === (synced[f] ?? '')) form[f] = v
    synced[f] = v
  }
}, { immediate: true })

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/**
 * Сохранение поля не теряется, если в этот момент идёт другое действие (mutate на время действия не пускает второе):
 * ждём, пока освободится замок, и только потом решаем и сохраняем — решение по свежей заявке, замок берём в том же такте.
 * Замок не освободился за 10 с — правка остаётся в поле несохранённой, и об этом говорит тост (а не молчит).
 */
const IDLE_POLL_MS = 50
const IDLE_MAX_POLLS = 200
const waitIdle = async () => {
  for (let i = 0; i < IDLE_MAX_POLLS && props.ctx.actions.busy(); i++) await sleep(IDLE_POLL_MS)
  if (!props.ctx.actions.busy()) return true
  message.warning(t('broker.case.draft.saveBusy'))
  return false
}

const save = (key: string, patch: Import40UpdateRequest) =>
  props.ctx.actions.mutate(`save:${key}`, async () => {
    props.ctx.setCase(await import40Api.update(props.ctx.kase.id, patch))
  }, { reload: false })

const commit = async (field: DraftField) => {
  if (!canEdit.value) return
  if (!(await waitIdle())) return
  const d = decideCommit(kase.value, field, form[field])
  if (d.kind === 'skip') {
    emptyError[field] = false
    form[field] = draftValueOf(kase.value, field)
    return
  }
  if (d.kind === 'blocked') {
    emptyError[field] = true // сервер не очищает это поле — объясняем, а не откатываем молча
    return
  }
  emptyError[field] = false
  form[field] = d.value
  const ok = await save(field, { [field]: d.value })
  if (!ok) form[field] = draftValueOf(kase.value, field) // ошибку показал перехватчик; поле — к серверному значению
}
const onInput = (field: DraftField) => { if (emptyError[field]) emptyError[field] = false }

// ---- Вид транспорта ----
const modes = computed(() => [
  { value: 0, label: t('enum.transportMode.rail') },
  { value: 1, label: t('enum.transportMode.road') },
  { value: 2, label: t('enum.transportMode.air') },
  { value: 3, label: t('enum.transportMode.sea') },
])
const setMode = async (v: ZOptionValue) => {
  if (!(await waitIdle())) return
  await save('transportMode', { transportMode: Number(v) })
}
const modeFields = computed(() => TRANSPORT_FIELDS[kase.value.transportMode] ?? [])
const FIELD_META: Record<DraftField, { label: string; mono?: boolean; placeholder?: string }> = {
  cargo: { label: 'cargo' },
  post: { label: 'post' },
  wagonNumber: { label: 'wagon', mono: true },
  station: { label: 'station' },
  vehicleNumber: { label: 'vehicle', mono: true, placeholder: '123ABC01' },
  trailerNumber: { label: 'trailer', mono: true, placeholder: '456DEF01' },
  driverPhone: { label: 'driverPhone' },
  flightNumber: { label: 'flight', mono: true, placeholder: 'KC 924' },
  airWaybill: { label: 'awb', mono: true, placeholder: '465-12345678' },
  vesselName: { label: 'vessel' },
  billOfLading: { label: 'bl', mono: true, placeholder: 'B/L' },
}

// ---- Документы и отправка ----
const docs = computed(() => props.ctx.files.filter((f) => f.section === 'documents'))
const submitKey = 'submit-for-processing'
const submitting = computed(() => props.ctx.actions.isPending(submitKey))
const submitDisabled = computed(() => !docs.value.length || (props.ctx.actions.busy() && !submitting.value))
const submitHint = computed(() => (docs.value.length ? '' : t('broker.case.draft.submitNeedDocs')))
const submit = async () => {
  const ok = await confirm({
    title: t('broker.case.draft.confirmSubmit'),
    okText: t('broker.case.draft.confirmSubmitOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run('submit-for-processing')
}

const phoneField = 'max-sm:h-12 max-sm:text-base'
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="canEdit ? t('broker.case.draft.metaEdit') : t('broker.case.draft.metaWait')">
    <template v-if="canEdit" #actions>
      <ZTooltip :title="submitHint">
        <span class="inline-flex max-sm:w-full" :tabindex="submitHint ? 0 : undefined">
          <ZButton variant="primary" :disabled="submitDisabled" :loading="submitting" class="max-sm:w-full" data-draft-submit @click="submit">
            {{ t('broker.case.draft.submit') }}
          </ZButton>
        </span>
      </ZTooltip>
    </template>

    <div v-if="canEdit" class="flex flex-col gap-5" data-draft-form>
      <div class="grid gap-4 sm:grid-cols-2 sm:gap-x-3">
        <ZField :label="t('broker.case.draft.cargo')" :error="emptyError.cargo ? t('broker.case.draft.cannotBeEmpty') : undefined">
          <ZInput v-model:value="form.cargo" :class="phoneField" autocomplete="off" data-draft-field="cargo" @input="onInput('cargo')" @blur="commit('cargo')" @press-enter="commit('cargo')" />
        </ZField>
        <ZField :label="t('broker.case.draft.post')" :error="emptyError.post ? t('broker.case.draft.cannotBeEmpty') : undefined">
          <ZInput v-model:value="form.post" :class="phoneField" autocomplete="off" data-draft-field="post" @input="onInput('post')" @blur="commit('post')" @press-enter="commit('post')" />
        </ZField>
      </div>

      <ZField :label="t('broker.case.draft.mode')">
        <ZSegmented
          :value="kase.transportMode"
          :options="modes"
          class="self-start max-sm:flex max-sm:w-full max-sm:self-stretch max-sm:*:flex-1 max-sm:*:justify-center"
          data-draft-mode
          @change="setMode"
        />
      </ZField>

      <div class="grid gap-4 sm:grid-cols-2 sm:gap-x-3" data-draft-mode-fields>
        <ZField v-for="f in modeFields" :key="f" :label="t(`broker.case.draft.${FIELD_META[f].label}`)" :error="emptyError[f] ? t('broker.case.draft.cannotBeEmpty') : undefined">
          <ZPhone
            v-if="f === 'driverPhone'"
            v-model:value="form.driverPhone"
            :class="phoneField"
            data-draft-field="driverPhone"
            @update:value="onInput('driverPhone')"
            @blur="commit('driverPhone')"
            @press-enter="commit('driverPhone')"
          />
          <ZInput
            v-else
            v-model:value="form[f]"
            :mono="FIELD_META[f].mono"
            :placeholder="FIELD_META[f].placeholder"
            :class="phoneField"
            autocomplete="off"
            :data-draft-field="f"
            @input="onInput(f)"
            @blur="commit(f)"
            @press-enter="commit(f)"
          />
        </ZField>
      </div>

      <div>
        <p class="m-0 mb-2 text-[13px] font-semibold text-ink">{{ t('broker.case.draft.containers') }}</p>
        <DraftContainers :ctx="ctx" editable />
      </div>

      <DraftClientData :kase="kase" />

      <CaseDocsSlot
        :ctx="ctx"
        section="documents"
        :label="t('broker.case.draft.documents')"
        :hint="t('broker.case.draft.documentsHint')"
        can-upload
        :can-remove="ctx.perms.isAdmin"
        multiple
        with-kind
        :empty-text="t('broker.case.draft.docsEmpty')"
      />
    </div>
    <DraftReadonly v-else :ctx="ctx" />
  </CaseStepPanel>
  <DraftReadonly v-else :ctx="ctx" />
</template>
