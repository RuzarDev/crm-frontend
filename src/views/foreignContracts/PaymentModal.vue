<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ContractPaymentFields } from '@/api/foreignContracts'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { todayIso } from '@/views/broker/list'
import { paymentErrors } from './contracts'

// Оплата поставщику по контракту: дата, сумма, валюта (по умолчанию — валюта контракта), примечание.
const props = defineProps<{
  open: boolean
  contractCurrency: string
  currencies: string[]
  save: (fields: ContractPaymentFields) => Promise<void>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const fields = ref<ContractPaymentFields>({ paidOn: null, amount: null, currency: null, note: '' })
const touched = ref(false)
const saving = ref(false)
const serverErrors = ref<Record<string, string>>({})
watch(() => props.open, (v) => {
  if (!v) return
  fields.value = { paidOn: todayIso(), amount: null, currency: props.contractCurrency, note: '' }
  touched.value = false
  serverErrors.value = {}
}, { immediate: true })

const currencyOptions = computed(() => [...new Set([props.contractCurrency, ...props.currencies, 'KZT'])].map((c) => ({ value: c, label: c })))
const errors = computed(() => (touched.value ? paymentErrors(fields.value, todayIso()) : {}))
const err = (f: keyof ContractPaymentFields) => (errors.value[f] ? t(errors.value[f]!) : serverErrors.value[f])

const submit = async () => {
  if (saving.value) return
  touched.value = true
  serverErrors.value = {}
  if (Object.keys(paymentErrors(fields.value, todayIso())).length) return
  saving.value = true
  try {
    await props.save({ ...fields.value })
    emit('update:open', false)
  } catch (e) {
    serverErrors.value = serverFieldErrors(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('foreignContracts.payment.title')"
    :width="460"
    :ok-text="t('foreignContracts.form.save')"
    :cancel-text="t('foreignContracts.form.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    data-payment-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="flex flex-col gap-4 pb-2" novalidate @submit.prevent="submit">
      <p class="m-0 text-[13px] text-ink-3">{{ t('foreignContracts.payment.hint') }}</p>
      <ZField :label="t('foreignContracts.payment.paidOn')" required :error="err('paidOn')">
        <ZDate v-model:value="fields.paidOn" :max="todayIso()" class="max-sm:h-11" data-payment-date />
      </ZField>
      <ZField :label="t('foreignContracts.payment.amount')" required :error="err('amount') ?? err('currency')">
        <div class="flex w-full gap-2">
          <ZNumber v-model:value="fields.amount" :min="0" :precision="2" class="min-w-0 flex-1 max-sm:h-11" data-payment-amount />
          <ZSelect
            :value="fields.currency"
            :options="currencyOptions"
            :aria-label="t('foreignContracts.field.currency')"
            class="w-[104px] shrink-0 max-sm:h-11"
            data-payment-currency
            @update:value="fields.currency = ($event as string | null) ?? props.contractCurrency"
          />
        </div>
      </ZField>
      <ZField :label="t('foreignContracts.payment.note')" :error="err('note')">
        <ZInput v-model:value="fields.note" :maxlength="500" :placeholder="t('foreignContracts.payment.notePh')" class="max-sm:h-11" data-payment-note />
      </ZField>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
