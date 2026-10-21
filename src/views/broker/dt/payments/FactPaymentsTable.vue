<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ZOptionValue } from '@/ui/options'
import type { Import40FactPayment } from '@/types/api'
import { dtDateWarning } from '@/utils/dtDateRange'
import { withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'

// «Фактические платежи гр. В» (уходят в XML КЕДЕН как есть, порядок строк = порядок в XML): вид (tax-modes), сумма,
// курс, плательщик ИИН/БИН, номер и дата платёжки, дата платежа, способ (payment-methods). Правка — прямо в form.factPayments,
// без своей копии: «Записать» заменяет массив гр. В, и таблица сразу показывает новые суммы, а правка строки не
// возвращает старые (прежняя таблица держала копию — §5-1). Добавление и удаление заменяют массив (как расходы).
// Новая строка — курс 1, способ «БН» (как прежде), номер платёжки пуст. Вид и способ не из справочника не сбрасываются
// (withCurrent). Номер платёжки — до 50 знаков (R.055 csdo:DocId); в XML КЕДЕН пока не выгружается (в РК не используется).
const props = defineProps<{
  form: DtFormState
  readonly: boolean
}>()
const { t } = useI18n()
const tf = (key: string, p?: Record<string, unknown>) => t(`broker.dt.payments.fact.${key}`, p ?? {})
const classifiers = useClassifiersStore()

const rows = computed<Import40FactPayment[]>(() => props.form.factPayments ?? [])
const modeOptions = computed(() => classifiers.options('tax-modes'))
const methodOptions = computed(() => classifiers.options('payment-methods'))
// Вид не из справочника (старая строка, ручной код) — остаётся и показывается как есть, с пометкой; данные не теряются.
const modeOf = (p: Import40FactPayment) => withCurrent(modeOptions.value, p.taxModeCode)

// Стабильный ключ строки: удаление строки выше не переносит набранное в соседнюю.
const rowKeys = new WeakMap<object, number>()
let lastKey = 0
const keyOf = (p: Import40FactPayment) => {
  let k = rowKeys.get(p)
  if (k === undefined) rowKeys.set(p, (k = ++lastKey))
  return k
}

const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))
const text = (v: string) => (v.trim() ? v.trim() : null)

const add = () => {
  props.form.factPayments = [
    ...(props.form.factPayments ?? []),
    { taxModeCode: null, amount: null, exchangeRate: 1, paymentDocDate: null, paymentDocNumber: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН' },
  ]
}
const remove = (p: Import40FactPayment) => {
  props.form.factPayments = (props.form.factPayments ?? []).filter((x) => x !== p)
}

// Дата вне разумного диапазона (№14б) — золотая рамка и подсказка; таблица плотная, полный текст — в готовности (гр. В).
const dateWarn = (v: string | null | undefined) => dtDateWarning(t, v, 'event')

const field = 'flex min-w-0 flex-col gap-1'
const label = 'text-xs text-muted'
const tall = 'max-sm:h-11'
</script>

<template>
  <!-- «До подачи» гр. В: поле графы — строки (фокус в первой); строк нет — весь блок (фокус на «Добавить»). -->
  <section class="@container flex flex-col gap-3" data-dt-fact-payments :data-graph="rows.length ? undefined : 'В'">
    <div class="flex flex-wrap items-center gap-3">
      <h3 class="m-0 text-[14px] font-semibold text-ink">
        {{ tf('title') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: 'В' }) }}</span>
      </h3>
      <ZButton v-if="!readonly" variant="ghost" size="sm" class="ml-auto max-sm:h-11" data-fact-add @click="add">
        <PhPlus :size="14" aria-hidden="true" />{{ tf('add') }}
      </ZButton>
    </div>

    <p v-if="!rows.length" class="m-0 text-[13px] text-muted" data-fact-empty>{{ readonly ? tf('emptyView') : tf('empty') }}</p>

    <div v-if="rows.length" class="flex flex-col gap-3" data-graph="В" data-fact-rows>
      <div
        v-for="(p, i) in rows"
        :key="keyOf(p)"
        class="grid grid-cols-2 items-end gap-x-3 gap-y-2.5 rounded-row border border-line p-3 @xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_2.75rem]"
        :data-fact-row="p.taxModeCode ?? ''"
        role="group"
        :aria-label="tf('row', { n: i + 1 })"
      >
        <div :class="[field, 'col-span-2 @xl:col-span-1']">
          <span :class="label">{{ tf('col.mode') }}</span>
          <ZSelect
            :value="p.taxModeCode || null"
            :options="modeOf(p).options"
            show-search
            :disabled="readonly"
            :status="modeOf(p).unknown ? 'warning' : undefined"
            placeholder="2010"
            popup-width="320px"
            :class="tall"
            :aria-label="tf('col.mode')"
            data-fact="mode"
            @update:value="p.taxModeCode = str($event)"
          />
          <span v-if="modeOf(p).unknown" class="text-xs text-gold-ink" data-fact-mode-unknown>{{ tf('notInList', { code: p.taxModeCode }) }}</span>
        </div>
        <div :class="field">
          <span :class="label">{{ tf('col.amount') }}</span>
          <ZNumber :value="p.amount" :min="0" :disabled="readonly" placeholder="—" :class="tall" :aria-label="tf('col.amount')" data-fact="amount" @update:value="p.amount = $event" />
        </div>
        <div :class="field">
          <span :class="label">{{ tf('col.rate') }}</span>
          <ZNumber :value="p.exchangeRate" :min="0" :disabled="readonly" placeholder="1" :class="tall" :aria-label="tf('col.rate')" data-fact="rate" @update:value="p.exchangeRate = $event" />
        </div>
        <div :class="[field, 'col-span-2 @xl:col-span-1']">
          <span :class="label">{{ tf('col.method') }}</span>
          <ZSelect
            :value="p.paymentMethodCode || null"
            :options="withCurrent(methodOptions, p.paymentMethodCode).options"
            :disabled="readonly"
            placeholder="БН"
            popup-width="280px"
            :class="tall"
            :aria-label="tf('col.method')"
            data-fact="method"
            @update:value="p.paymentMethodCode = str($event)"
          />
        </div>

        <!-- Реквизиты платёжки — своя сетка: в колонках первой строки (0,8fr — курс) дата не помещается.
             <36rem: плательщик и номер во всю ширину, даты парой (375); 36–48rem: два на два; от 48rem: в одну строку,
             даты не уже 9,5rem (дд.мм.гггг + очистка + календарь). -->
        <div class="col-span-2 grid grid-cols-2 items-end gap-x-3 gap-y-2.5 @xl:col-span-5 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(9.5rem,1fr)_minmax(9.5rem,1fr)]" data-fact-paydoc>
          <div :class="[field, 'col-span-2 @xl:col-span-1']">
            <span :class="label">{{ tf('col.payer') }}</span>
            <ZInput
              :value="p.payerTaxpayerId ?? ''"
              mono
              :maxlength="12"
              :disabled="readonly"
              placeholder="000000000000"
              :class="tall"
              :aria-label="tf('col.payer')"
              data-fact="payer"
              @update:value="p.payerTaxpayerId = text($event)"
            />
          </div>
          <div :class="[field, 'col-span-2 @xl:col-span-1']">
            <span :class="label">{{ tf('col.docNumber') }}</span>
            <ZInput
              :value="p.paymentDocNumber ?? ''"
              mono
              :maxlength="50"
              :disabled="readonly"
              placeholder="—"
              :class="tall"
              :aria-label="tf('col.docNumber')"
              data-fact="docNumber"
              @update:value="p.paymentDocNumber = text($event)"
            />
          </div>
          <div :class="field">
            <span :class="label">{{ tf('col.docDate') }}</span>
            <ZDate :value="p.paymentDocDate" allow-clear :disabled="readonly" :status="dateWarn(p.paymentDocDate) ? 'warning' : ''" :title="dateWarn(p.paymentDocDate) ?? undefined" :class="tall" :aria-label="tf('col.docDate')" data-fact="docDate" @update:value="p.paymentDocDate = $event" />
          </div>
          <div :class="field">
            <span :class="label">{{ tf('col.payDate') }}</span>
            <ZDate :value="p.paymentDate" allow-clear :disabled="readonly" :status="dateWarn(p.paymentDate) ? 'warning' : ''" :title="dateWarn(p.paymentDate) ?? undefined" :class="tall" :aria-label="tf('col.payDate')" data-fact="payDate" @update:value="p.paymentDate = $event" />
          </div>
        </div>
        <ZButton
          v-if="!readonly"
          variant="danger-ghost"
          class="col-span-2 size-9 justify-self-end p-0 max-sm:size-11 @xl:col-span-1 @xl:row-start-1 @xl:col-start-5"
          :aria-label="tf('remove', { n: i + 1 })"
          :title="tf('remove', { n: i + 1 })"
          data-fact-remove
          @click="remove(p)"
        >
          <PhX :size="16" aria-hidden="true" />
        </ZButton>
      </div>
    </div>
  </section>
</template>
