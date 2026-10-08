<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import { todayIso } from '@/views/broker/list'
import type { CaseStepContext } from '../caseContext'

// «Выставить счёт СВХ» (статус 5): сумма (обязательна, > 0), номер, дата (по умолчанию сегодня), заметка.
// POST actions/issue-invoice — тело как раньше: value = заметка или не передаётся; amount, number (или null), date 'YYYY-MM-DD'.
// Кнопка «Выставить» не блокируется пустой суммой — ошибка показывается у поля после попытки.
// Окно закрывается после успеха; при ошибке сервера остаётся (тост показал перехватчик).
const props = defineProps<{ open: boolean; ctx: CaseStepContext }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const ACTION = 'issue-invoice'
const form = reactive({ amount: null as number | null, number: '', date: null as string | null, note: '' })
const attempted = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  Object.assign(form, { amount: null, number: '', date: todayIso(), note: '' })
  attempted.value = false
}, { immediate: true })

const amountError = computed(() => (attempted.value && !(form.amount && form.amount > 0) ? t('import40Case.invoiceAmountRequired') : ''))
const pending = computed(() => props.ctx.actions.isPending(ACTION))

const submit = async () => {
  if (props.ctx.actions.busy()) return
  attempted.value = true
  if (!form.amount || form.amount <= 0) return
  const ok = await props.ctx.actions.run(ACTION, {
    value: form.note || undefined,
    extra: { amount: form.amount, number: form.number || null, date: form.date },
  })
  if (ok) emit('update:open', false)
}
const close = () => { if (!pending.value) emit('update:open', false) }
</script>

<template>
  <ZModal
    :open="open"
    :title="t('import40Case.invoiceTitle')"
    :ok-text="t('import40Case.invoiceOk')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="pending"
    :cancel-button-props="{ disabled: pending }"
    data-svh-modal
    @update:open="(v: boolean) => { if (!v) close() }"
    @ok="submit"
  >
    <p class="m-0 mb-3 text-sm text-ink-3">{{ t('broker.case.svh.invoiceHint') }}</p>
    <div class="flex flex-col gap-4 pb-1">
      <ZField :label="t('import40Case.invoiceAmount')" required :error="amountError">
        <ZNumber v-model:value="form.amount" :min="0" :precision="2" :placeholder="t('import40Case.invoicePh')" class="w-full max-sm:h-11" data-svh-amount />
      </ZField>
      <div class="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <ZField :label="t('import40Case.invoiceNumber')">
          <ZInput v-model:value="form.number" :placeholder="t('broker.case.svh.invoiceNumberPh')" class="max-sm:h-11" data-svh-number />
        </ZField>
        <ZField :label="t('import40Case.invoiceDate')">
          <ZDate v-model:value="form.date" class="w-full max-sm:h-11" data-svh-date />
        </ZField>
      </div>
      <ZField :label="t('import40Case.invoiceNote')">
        <ZInput v-model:value="form.note" :placeholder="t('broker.case.svh.invoiceNotePh')" class="max-sm:h-11" data-svh-note-input />
      </ZField>
    </div>
  </ZModal>
</template>
