<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { CaseStepContext } from '../caseContext'
import { isFuture, nowParts, partsToIso } from './borderTime'

// Отметка контроля на границе (шаг 2, 18.10): время (по умолчанию сейчас), у «другого» — что за контроль.
// POST actions/border-control { value: вид, date, clientMessage: текст «другого» }.
const props = defineProps<{ open: boolean; ctx: CaseStepContext; kind: string | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const ACTION = 'border-control'
const form = reactive({ date: null as string | null, time: '', text: '' })
const attempted = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(form, { ...nowParts(), text: '' })
  attempted.value = false
}, { immediate: true })

const isOther = computed(() => props.kind === 'other')
const iso = computed(() => partsToIso(form.date, form.time))
const timeError = computed(() => {
  if (!attempted.value) return ''
  if (!iso.value) return t('broker.case.border.timeRequired')
  return isFuture(iso.value) ? t('broker.case.border.timeFuture') : ''
})
const textError = computed(() => (attempted.value && isOther.value && !form.text.trim() ? t('broker.case.border.otherRequired') : ''))
const pending = computed(() => props.ctx.actions.isPending(ACTION))

const submit = async () => {
  if (props.ctx.actions.busy() || !props.kind) return
  attempted.value = true
  if (!iso.value || isFuture(iso.value) || textError.value) return
  const ok = await props.ctx.actions.run(ACTION, {
    value: props.kind,
    extra: { date: iso.value, clientMessage: isOther.value ? form.text.trim() : null },
  })
  if (ok) emit('update:open', false)
}
const close = () => { if (!pending.value) emit('update:open', false) }
</script>

<template>
  <ZModal
    :open="open"
    :title="kind ? t(`broker.case.border.control.${kind}`) : ''"
    :ok-text="t('broker.case.border.controlOk')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="pending"
    :cancel-button-props="{ disabled: pending }"
    data-border-control-modal
    @update:open="(v: boolean) => { if (!v) close() }"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-1">
      <ZField v-if="isOther" :label="t('broker.case.border.otherText')" required :error="textError">
        <ZInput v-model:value="form.text" :maxlength="300" :placeholder="t('broker.case.border.otherPh')" class="max-sm:h-11" data-control-text />
      </ZField>
      <ZField :label="t('broker.case.border.controlAt')" required :error="timeError">
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,120px)] gap-2">
          <ZDate v-model:value="form.date" class="w-full max-sm:h-11" data-control-date />
          <ZInput v-model:value="form.time" type="time" class="max-sm:h-11" data-control-time />
        </div>
      </ZField>
    </div>
  </ZModal>
</template>
