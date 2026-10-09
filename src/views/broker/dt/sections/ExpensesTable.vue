<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { ZOption } from '@/ui/options'
import { withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'

// Расходы для распределения на таможенную стоимость: статья, сумма, валюта, база распределения (по весу брутто /
// по стоимости — из справочника статей) и признак «вычет». Строки правятся прямо в form.expenses (форма реактивна и
// уходит в PUT массивом целиком); добавление и удаление заменяют массив.
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  typeOptions: ZOption[]
  currencyOptions: ZOption[]
  distributionByCode?: Record<string, 'GrossWeight' | 'CustomsValue'>
  deductionByCode?: Record<string, boolean>
}>()
const { t } = useI18n()
const tf = (key: string, p?: Record<string, unknown>) => t(`broker.dt.finance.${key}`, p ?? {})

const rows = computed(() => props.form.expenses ?? [])
const typeFor = (code: string | null | undefined) => withCurrent(props.typeOptions, code).options
const currencyFor = (code: string | null | undefined) => withCurrent(props.currencyOptions, code).options
// Подпись базы: нет статьи или справочник не загрузился — «по стоимости» (так же по умолчанию считает сервер).
const baseLabel = (code: string | null | undefined) =>
  (code && props.distributionByCode?.[code] === 'GrossWeight' ? tf('byWeight') : tf('byValue'))
const isDeduction = (code: string | null | undefined) => !!(code && props.deductionByCode?.[code])

const add = () => {
  props.form.expenses = [...(props.form.expenses ?? []), { expenseTypeCode: null, amount: null, currencyCode: null }]
}
const remove = (index: number) => {
  props.form.expenses = (props.form.expenses ?? []).filter((_, i) => i !== index)
}
const cols = '@2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_2.75rem]'
</script>

<template>
  <div class="@container flex flex-col gap-3" data-dt-expenses>
    <div v-if="rows.length" :class="['hidden gap-2 px-0.5 text-xs text-muted @2xl:grid', cols]" aria-hidden="true">
      <span>{{ tf('expType') }}</span><span>{{ tf('expAmount') }}</span><span>{{ tf('expCurrency') }}</span><span>{{ tf('expBase') }}</span><span />
    </div>
    <div
      v-for="(e, i) in rows"
      :key="i"
      :class="['grid grid-cols-2 items-center gap-2 rounded-row border border-line p-2.5 @2xl:border-0 @2xl:p-0', cols]"
      data-expense-row
    >
      <ZSelect
        class="col-span-2 @2xl:col-span-1"
        :value="e.expenseTypeCode || null"
        :options="typeFor(e.expenseTypeCode)"
        show-search
        :disabled="readonly"
        :placeholder="tf('expType')"
        :aria-label="tf('expType')"
        popup-width="320px"
        data-expense-type
        @update:value="e.expenseTypeCode = $event == null || $event === '' ? null : String($event)"
      />
      <ZNumber :value="e.amount" :min="0" :precision="2" :disabled="readonly" :aria-label="tf('expAmount')" data-expense-amount @update:value="e.amount = $event" />
      <ZSelect
        :value="e.currencyCode || null"
        :options="currencyFor(e.currencyCode)"
        show-search
        :disabled="readonly"
        :placeholder="tf('expCurrency')"
        :aria-label="tf('expCurrency')"
        data-expense-currency
        @update:value="e.currencyCode = $event == null || $event === '' ? null : String($event)"
      />
      <span class="col-span-2 flex flex-wrap items-center gap-1.5 @2xl:col-span-1" data-expense-base>
        <ZTag size="sm">{{ baseLabel(e.expenseTypeCode) }}</ZTag>
        <ZTag v-if="isDeduction(e.expenseTypeCode)" tone="accent" size="sm" data-expense-deduction>{{ tf('deduction') }}</ZTag>
      </span>
      <ZButton
        v-if="!readonly"
        variant="danger-ghost"
        class="col-span-2 size-9 justify-self-end p-0 max-sm:size-11 @2xl:col-span-1"
        :aria-label="tf('removeExpense')"
        :title="tf('removeExpense')"
        data-expense-remove
        @click="remove(i)"
      >
        <PhTrash :size="16" aria-hidden="true" />
      </ZButton>
    </div>
    <p v-if="!rows.length" class="m-0 text-sm text-muted" data-expenses-empty>{{ tf('noExpenses') }}</p>
    <div v-if="!readonly">
      <ZButton class="max-sm:h-11" data-expense-add @click="add"><PhPlus :size="16" aria-hidden="true" />{{ tf('addExpense') }}</ZButton>
    </div>
  </div>
</template>
