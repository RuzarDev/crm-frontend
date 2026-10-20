<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import type { ZOption } from '@/ui/options'
import { carriersApi, type CarrierCaseOption, type CarrierInvoiceFields } from '@/api/carriers'
import { fieldErrors as serverFieldErrors } from '@/api/nationalLists'
import { formatDay, todayIso } from '@/views/broker/list'
import { message } from '@/ui/message'
import { emptyInvoice, invoiceErrors, type InvoiceField } from './carriers'
import { useCurrencyOptions } from './useCurrencyOptions'

// Счёт перевозчика (фрахт): номер, дата, сумма и валюта, поставка, оплачен (и когда), файл (только при создании —
// у существующего счёта файл меняется в карточке), примечание. Поставка нужна, чтобы фрахт попал в её себестоимость.
const props = withDefaults(defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  clientId: string
  initial?: CarrierInvoiceFields | null
  /** Поставка, уже привязанная к счёту (правка): всегда в выборе, даже отменённая или не попавшая в список. */
  currentCase?: { id: string; number: string } | null
  save: (fields: CarrierInvoiceFields, file: File | null) => Promise<void>
}>(), { initial: null, currentCase: null })
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const fields = ref<CarrierInvoiceFields>(emptyInvoice())
const file = shallowRef<File | null>(null)
const touched = ref(false)
const saving = ref(false)
const serverErrors = ref<Record<string, string>>({})
const currencies = useCurrencyOptions()
const cases = shallowRef<CarrierCaseOption[]>([])

watch(() => props.open, (v) => {
  if (!v) return
  fields.value = { ...(props.initial ?? emptyInvoice()) }
  file.value = null
  touched.value = false
  serverErrors.value = {}
  void currencies.load()
  void carriersApi.cases(props.clientId).then((r) => { cases.value = r }).catch(() => { cases.value = [] })
}, { immediate: true })

const caseOptions = computed<ZOption[]>(() => {
  const list: ZOption[] = cases.value.map((c) => ({
    value: c.id, label: `${c.number}${c.cargo ? ` · ${c.cargo}` : ''} · ${formatDay(c.createdAtUtc)}`,
  }))
  const cur = props.currentCase
  if (cur && !cases.value.some((c) => c.id === cur.id)) list.unshift({ value: cur.id, label: cur.number || t('carriers.invoice.currentCase') })
  return list
})
const currencyOptions = computed(() => currencies.withValue(fields.value.currency))
const localErrors = computed(() => (touched.value ? invoiceErrors(fields.value, todayIso()) : {}))
const err = (f: InvoiceField): string | undefined => {
  const local = localErrors.value[f]
  return local ? t(local) : serverErrors.value[f]
}
watch(() => fields.value.isPaid, (paid) => {
  if (paid && !fields.value.paidOn) fields.value.paidOn = todayIso()
})

const submit = async () => {
  if (saving.value) return
  touched.value = true
  serverErrors.value = {}
  if (Object.keys(invoiceErrors(fields.value, todayIso())).length) return
  saving.value = true
  try {
    await props.save({ ...fields.value }, file.value)
    emit('update:open', false)
  } catch (e) {
    const fe = serverFieldErrors(e)
    serverErrors.value = fe
    if (!Object.keys(fe).length) {
      const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
      if (res?.status === 400) message.error(res.data?.error || t('carriers.saveError'))
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t(mode === 'edit' ? 'carriers.invoice.editTitle' : 'carriers.invoice.createTitle')"
    :width="560"
    :ok-text="t('carriers.form.save')"
    :cancel-text="t('carriers.form.cancel')"
    :confirm-loading="saving"
    destroy-on-close
    data-carrier-invoice-modal
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <form class="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2" novalidate @submit.prevent="submit">
      <ZField :label="t('carriers.invoice.number')" required :error="err('number')">
        <ZInput v-model:value="fields.number" mono :maxlength="100" class="max-sm:h-11" data-invoice-number />
      </ZField>
      <ZField :label="t('carriers.invoice.date')" required :error="err('invoiceDate')">
        <ZDate v-model:value="fields.invoiceDate" :max="todayIso()" class="max-sm:h-11" data-invoice-date />
      </ZField>
      <ZField :label="t('carriers.invoice.amount')" required :error="err('amount') ?? err('currency')" class="sm:col-span-2">
        <div class="flex w-full gap-2">
          <ZNumber v-model:value="fields.amount" :min="0" :precision="2" class="min-w-0 flex-1 max-sm:h-11" data-invoice-amount />
          <ZSelect
            :value="fields.currency"
            :options="currencyOptions"
            show-search
            :placeholder="t('carriers.form.currencyPh')"
            :popup-width="280"
            :aria-label="t('carriers.invoice.currency')"
            :status="err('currency') ? 'error' : ''"
            class="w-[120px] shrink-0 max-sm:h-11"
            data-invoice-currency
            @update:value="fields.currency = ($event as string | null) ?? null"
          />
        </div>
      </ZField>
      <ZField :label="t('carriers.invoice.case')" :error="err('caseId')" :help="t('carriers.invoice.caseHelp')" class="sm:col-span-2">
        <ZSelect
          :value="fields.caseId"
          :options="caseOptions"
          show-search
          allow-clear
          :placeholder="t('carriers.invoice.noCase')"
          :not-found-content="t('carriers.invoice.noCases')"
          class="max-sm:h-11"
          data-invoice-case
          @update:value="fields.caseId = ($event as string | null) ?? null"
        />
      </ZField>
      <ZCheckbox v-model:checked="fields.isPaid" class="flex min-h-11 items-center gap-2 self-end text-sm text-ink-2 sm:min-h-8" data-invoice-paid>
        {{ t('carriers.invoice.paid') }}
      </ZCheckbox>
      <ZField v-if="fields.isPaid" :label="t('carriers.invoice.paidOn')" :error="err('paidOn')">
        <ZDate v-model:value="fields.paidOn" :max="todayIso()" class="max-sm:h-11" data-invoice-paid-on />
      </ZField>
      <div v-if="mode === 'create'" class="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2">
        <ZUpload :accept="ACCEPT" :max-size-mb="25" class="max-sm:w-full" data-invoice-file @select="file = $event[0] ?? null">
          {{ t('carriers.invoice.chooseFile') }}
        </ZUpload>
        <span v-if="file" class="min-w-0 text-sm break-all text-ink-2">{{ file.name }}</span>
      </div>
      <ZField :label="t('carriers.field.note')" class="sm:col-span-2">
        <ZTextarea v-model:value="fields.note" :rows="2" :maxlength="1000" data-invoice-note />
      </ZField>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true" />
    </form>
  </ZModal>
</template>
