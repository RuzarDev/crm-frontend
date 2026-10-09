<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTag from '@/components/z/ZTag.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import { dedupeOptions, withCurrent } from '../dtOptions'
import type { DtFormState } from '../dtPayload'

// Гр. 1 (тип, процедура, признак), 3 (лист / всего листов), 4, 5, 6, 7. Тип, процедура и особенности — по
// классификаторам КЕДЕН, свободный ввод закрыт: значение вне списка (старая ДТ) показывается и подсвечивается.
// Гр. 3, 5, 6 считаются по товарам (useDtTotals) — только чтение с пометкой «авто».
const props = defineProps<{
  form: DtFormState
  readonly: boolean
  totals: { goods: number; places: number }
}>()
const { t } = useI18n()
const classifiers = useClassifiersStore()

const optionsOf = (code: string): ZOption[] => dedupeOptions(classifiers.options(code))
const type = computed(() => withCurrent(optionsOf('declaration-types'), props.form.declarationTypeCode))
const procedure = computed(() => withCurrent(optionsOf('customs-procedures'), props.form.procedureCode))
const declaring = computed(() => withCurrent(optionsOf('declaring-features'), props.form.referenceNumber))
// Признак (третья часть гр. 1): в КЕДЕН для ДТ в электронной форме — «ЭД»; отдельного классификатора нет.
const featureOptions = computed<ZOption[]>(() => [{ value: 'ЭД', label: t('broker.dt.general.featureEd') }])
const feature = computed(() => withCurrent(featureOptions.value, props.form.declarationFeatureCode))

const warn = (unknown: boolean, value: string | null | undefined) =>
  unknown ? { validateStatus: 'warning' as const, help: t('broker.dt.general.notInList', { value: value ?? '' }) } : {}

const str = (v: unknown): string => (v == null ? '' : String(v))
const orNull = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const onType = (v: unknown) => { props.form.declarationTypeCode = str(v) }
const onProcedure = (v: unknown) => { props.form.procedureCode = str(v) }
const onFeature = (v: unknown) => { props.form.declarationFeatureCode = orNull(v) }
const onDeclaring = (v: unknown) => { props.form.referenceNumber = orNull(v) }
const onShipping = (v: number | null) => { props.form.shippingSpecSheets = v }

const sheets = computed(() => `${props.form.sheetNumber ?? '—'} / ${props.form.totalSheets ?? '—'}`)
</script>

<template>
  <section class="@container flex flex-col gap-4" data-dt-general>
    <h2 class="m-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink">
      {{ t('broker.dt.general.title') }}
      <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '1, 3–7' }) }}</span>
    </h2>

    <div class="grid grid-cols-1 gap-x-4 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-3">
      <ZField graph="1" :label="t('broker.dt.general.type')" data-graph="1" v-bind="warn(type.unknown, form.declarationTypeCode)">
        <template #label>{{ t('broker.dt.general.type') }}<DtGraphHelp graph="1" /></template>
        <ZSelect :value="form.declarationTypeCode || null" :options="type.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.general.select')" @update:value="onType" />
      </ZField>
      <ZField graph="1" :label="t('broker.dt.general.procedure')" data-graph="1" v-bind="warn(procedure.unknown, form.procedureCode)">
        <ZSelect :value="form.procedureCode || null" :options="procedure.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.general.select')" popup-width="360px" @update:value="onProcedure" />
      </ZField>
      <ZField graph="1" :label="t('broker.dt.general.feature')" data-graph="1" v-bind="warn(feature.unknown, form.declarationFeatureCode)">
        <ZSelect :value="form.declarationFeatureCode || null" :options="feature.options" allow-clear :disabled="readonly" :placeholder="t('broker.dt.general.select')" @update:value="onFeature" />
      </ZField>

      <ZField graph="3" :label="t('broker.dt.general.sheet')" data-graph="3">
        <template #label>{{ t('broker.dt.general.sheet') }}<DtGraphHelp graph="3" /></template>
        <ZInput :value="sheets" readonly mono class="bg-sunken" data-dt-auto="3">
          <template #suffix><ZTag tone="info" size="sm">{{ t('broker.dt.general.auto') }}</ZTag></template>
        </ZInput>
      </ZField>
      <ZField graph="4" :label="t('broker.dt.general.shipping')" data-graph="4">
        <template #label>{{ t('broker.dt.general.shipping') }}<DtGraphHelp graph="4" /></template>
        <ZNumber :value="form.shippingSpecSheets" :min="0" :precision="0" :disabled="readonly" @update:value="onShipping" />
      </ZField>
      <ZField graph="7" :label="t('broker.dt.general.declaring')" data-graph="7" v-bind="warn(declaring.unknown, form.referenceNumber)">
        <template #label>{{ t('broker.dt.general.declaring') }}<DtGraphHelp graph="7" /></template>
        <ZSelect :value="form.referenceNumber || null" :options="declaring.options" show-search allow-clear :disabled="readonly" :placeholder="t('broker.dt.general.select')" popup-width="420px" @update:value="onDeclaring" />
      </ZField>

      <ZField graph="5" :label="t('broker.dt.general.goods')" data-graph="5">
        <template #label>{{ t('broker.dt.general.goods') }}<DtGraphHelp graph="5" /></template>
        <ZInput :value="String(totals.goods)" readonly mono class="bg-sunken" data-dt-auto="5">
          <template #suffix><ZTag tone="info" size="sm">{{ t('broker.dt.general.auto') }}</ZTag></template>
        </ZInput>
      </ZField>
      <ZField graph="6" :label="t('broker.dt.general.places')" data-graph="6">
        <template #label>{{ t('broker.dt.general.places') }}<DtGraphHelp graph="6" /></template>
        <ZInput :value="String(totals.places)" readonly mono class="bg-sunken" data-dt-auto="6">
          <template #suffix><ZTag tone="info" size="sm">{{ t('broker.dt.general.auto') }}</ZTag></template>
        </ZInput>
      </ZField>
    </div>

    <p class="m-0 text-xs text-muted">{{ t('broker.dt.general.autoNote') }}</p>
  </section>
</template>
