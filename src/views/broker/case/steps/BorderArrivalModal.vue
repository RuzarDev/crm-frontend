<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import type { CaseStepContext } from '../caseContext'
import { isFuture, nowParts, partsToIso } from './borderTime'

// «Машина прибыла» (шаг 2, КПП, 18.10): время прибытия (по умолчанию сейчас), пост (по умолчанию пост заявки),
// необязательный комментарий (видят только сотрудники). POST actions/border-arrived { date, post, value }.
const props = defineProps<{ open: boolean; ctx: CaseStepContext }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const ACTION = 'border-arrived'
const form = reactive({ date: null as string | null, time: '', post: '', comment: '' })
const attempted = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(form, { ...nowParts(), post: props.ctx.kase.post ?? '', comment: '' })
  attempted.value = false
}, { immediate: true })

const iso = computed(() => partsToIso(form.date, form.time))
const timeError = computed(() => {
  if (!attempted.value) return ''
  if (!iso.value) return t('broker.case.border.timeRequired')
  return isFuture(iso.value) ? t('broker.case.border.timeFuture') : ''
})
const pending = computed(() => props.ctx.actions.isPending(ACTION))

const submit = async () => {
  if (props.ctx.actions.busy()) return
  attempted.value = true
  if (!iso.value || isFuture(iso.value)) return
  const ok = await props.ctx.actions.run(ACTION, {
    value: form.comment.trim() || undefined,
    extra: { date: iso.value, post: form.post.trim() || null },
  })
  if (ok) emit('update:open', false)
}
const close = () => { if (!pending.value) emit('update:open', false) }
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.case.border.arrivedTitle')"
    :ok-text="t('broker.case.border.arrivedOk')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="pending"
    :cancel-button-props="{ disabled: pending }"
    data-border-arrival-modal
    @update:open="(v: boolean) => { if (!v) close() }"
    @ok="submit"
  >
    <p class="m-0 mb-3 text-sm text-ink-3">{{ t('broker.case.border.arrivedHint') }}</p>
    <div class="flex flex-col gap-4 pb-1">
      <ZField :label="t('broker.case.border.arrivedAt')" required :error="timeError">
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,120px)] gap-2">
          <ZDate v-model:value="form.date" class="w-full max-sm:h-11" data-arrival-date />
          <ZInput v-model:value="form.time" type="time" class="max-sm:h-11" data-arrival-time />
        </div>
      </ZField>
      <ZField :label="t('broker.case.border.post')">
        <ZInput v-model:value="form.post" :maxlength="200" :placeholder="t('broker.case.border.postPh')" class="max-sm:h-11" data-arrival-post />
      </ZField>
      <ZField :label="t('broker.case.border.comment')" :extra="t('broker.case.border.commentHint')">
        <ZInput v-model:value="form.comment" :maxlength="500" class="max-sm:h-11" data-arrival-comment />
      </ZField>
    </div>
  </ZModal>
</template>
