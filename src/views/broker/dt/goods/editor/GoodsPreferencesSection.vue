<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40GoodsItemInput } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { withCurrent } from '../../dtOptions'
import { pinPreferences, useKedenLists, type KedenListField } from '../useKedenLists'
import type { GoodsSectionProps } from './types'

// «Льготы и процедура» (доска DtGoodsEditor): гр. 36 — четыре классификатора ЕЭК 2008 (сбор, пошлина, акциз, НДС),
// «ОО, О, Z» сверху; гр. 37 процедура, предшествующая процедура, особенность перемещения; гр. 43 метод ТС; гр. 39 квота;
// месяцы временного ввоза; сертификация / экспортный контроль. Списки КЕДЕН (useKedenLists, ключ — направление гр. 1 +
// процедура товара, иначе ДТ) сужают гр. 36, гр. 37 (K2), предшествующую процедуру и особенность перемещения; выбранный
// код вне списка остаётся и подсвечивается, внизу — общее предупреждение. гр. 36 и месяцы — поля платежей («Пересчитать»).
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.prefs.${key}`, p ?? {})
const classifiers = useClassifiersStore()

type Goods = Import40GoodsItemInput
type CodeKey = 'prefClearanceCode' | 'prefDutyCode' | 'prefExciseCode' | 'prefVatCode' | 'procedureCode' | 'previousProcedureCode' | 'goodsMoveFeatureCode' | 'valuationMethodCode'
const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))
const setCode = (key: CodeKey, v: ZOptionValue | ZOptionValue[] | null) => { props.model.setField(props.item, key, str(v) as Goods[CodeKey]) }

const keden = useKedenLists(() => ({ direction: props.ctx.direction, procedure: props.item.procedureCode || props.ctx.declProcedure }))

interface KedenField { key: CodeKey; field: KedenListField; classifier: string; label: string; graph: string; pref?: boolean }
const PREFS: readonly KedenField[] = [
  { key: 'prefClearanceCode', field: 'pref-fee', classifier: 'pref-fee', label: 'fee', graph: '36', pref: true },
  { key: 'prefDutyCode', field: 'pref-duty', classifier: 'pref-duty', label: 'duty', graph: '36', pref: true },
  { key: 'prefExciseCode', field: 'pref-excise', classifier: 'pref-excise', label: 'excise', graph: '36', pref: true },
  { key: 'prefVatCode', field: 'pref-vat', classifier: 'pref-vat', label: 'vat', graph: '36', pref: true },
]
const PROCEDURE: KedenField = { key: 'procedureCode', field: 'procedure', classifier: 'customs-procedures', label: 'procedure', graph: '37' }
const PREV: KedenField = { key: 'previousProcedureCode', field: 'prev', classifier: 'customs-procedures', label: 'prevProcedure', graph: '37' }
const MOVE: KedenField = { key: 'goodsMoveFeatureCode', field: 'movement-features', classifier: 'movement-features', label: 'movement', graph: '37' }
const KEDEN_FIELDS = [...PREFS, PROCEDURE, PREV, MOVE]

const optionsOf = (f: KedenField): ZOption[] => {
  const base = classifiers.options(f.classifier)
  return keden.narrow(f.field, f.pref ? pinPreferences(base) : base, props.item[f.key])
}
const options = computed(() => Object.fromEntries(KEDEN_FIELDS.map((f) => [f.key, optionsOf(f)])) as Record<CodeKey, ZOption[]>)
const off = computed(() => Object.fromEntries(KEDEN_FIELDS.map((f) => [f.key, keden.offList(f.field, props.item[f.key])])) as Record<CodeKey, boolean>)
const offStatus = (key: CodeKey) => {
  if (!off.value[key]) return {}
  // Процедура вне списка — ключа списков нет: называем направление гр. 1.
  const help = key === 'procedureCode'
    ? tr('offListProcedure', { direction: (props.ctx.direction ?? '').trim().toUpperCase() || 'ИМ' })
    : tr('offList', { key: keden.keyLabel.value })
  return { validateStatus: 'warning' as const, help }
}
const offText = computed(() => KEDEN_FIELDS.filter((f) => off.value[f.key]).map((f) => `${tr(f.label)}: ${props.item[f.key]}`).join('; '))

const valuation = computed(() => withCurrent(classifiers.options('2005'), props.item.valuationMethodCode).options)
const procedurePlaceholder = computed(() => (props.ctx.declProcedure ? tr('procedureFromDt', { code: props.ctx.declProcedure }) : tr('procedurePlaceholder')))

// Сертификация: выбор из справочника или свой текст; хранится строкой через «; » (поле на сервере — свободный текст).
const certification = computed(() => (props.item.certificationNote ?? '').split(';').map((x) => x.trim()).filter(Boolean))
const certificationOptions = computed(() => classifiers.options('certification-kinds'))
const onCertification = (v: ZOptionValue | ZOptionValue[] | null) => {
  const list = (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => String(x).trim()).filter(Boolean)
  props.model.setField(props.item, 'certificationNote', list.length ? list.join('; ') : null)
}

// гр. 36 — четыре в ряд, как на доске (подписи короткие); на телефоне — одна колонка.
const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @sm:grid-cols-2 @xl:grid-cols-4'
const tall = 'max-sm:h-11'
</script>

<template>
  <div class="flex flex-col gap-4" data-goods-prefs-section>
    <div :class="grid">
      <ZField v-for="f in PREFS" :key="f.key" :graph="f.graph" :label="tr(f.label)" v-bind="offStatus(f.key)" data-graph="36" :data-goods-field="f.key" :data-goods-index="index">
        <ZSelect :value="item[f.key] || null" :options="options[f.key]" show-search allow-clear :disabled="readonly" :placeholder="tr('noPrefs')" popup-width="440px" :class="tall" :data-f="f.key" @update:value="setCode(f.key, $event)" />
      </ZField>

      <ZField graph="37" :label="tr('procedure')" v-bind="offStatus('procedureCode')" data-graph="37" :data-goods-index="index" data-goods-field="procedureCode">
        <ZSelect :value="item.procedureCode || null" :options="options.procedureCode" show-search allow-clear :disabled="readonly" :placeholder="procedurePlaceholder" popup-width="360px" :class="tall" data-f="procedureCode" @update:value="setCode('procedureCode', $event)" />
      </ZField>
      <ZField graph="37" :label="tr('prevProcedure')" v-bind="offStatus('previousProcedureCode')" data-graph="37" :data-goods-index="index" data-goods-field="previousProcedureCode">
        <ZSelect :value="item.previousProcedureCode || null" :options="options.previousProcedureCode" show-search allow-clear :disabled="readonly" :placeholder="tr('none')" popup-width="360px" :class="tall" data-f="previousProcedureCode" @update:value="setCode('previousProcedureCode', $event)" />
      </ZField>
      <ZField graph="43" :label="tr('valuation')" data-graph="43" :data-goods-index="index" data-goods-field="valuationMethodCode">
        <ZSelect :value="item.valuationMethodCode || null" :options="valuation" show-search allow-clear :disabled="readonly" :placeholder="tr('valuationPlaceholder')" popup-width="420px" :class="tall" data-f="valuationMethodCode" @update:value="setCode('valuationMethodCode', $event)" />
      </ZField>
      <ZField graph="39" :label="tr('quota')" data-graph="39" :data-goods-index="index" data-goods-field="quotaAmount">
        <ZNumber :value="item.quotaAmount ?? null" :min="0" :disabled="readonly" placeholder="—" :class="tall" data-f="quotaAmount" @update:value="model.setField(item, 'quotaAmount', $event)" />
      </ZField>

      <ZField graph="37" :label="tr('movement')" v-bind="offStatus('goodsMoveFeatureCode')" class="@sm:col-span-2" :data-goods-index="index" data-graph="37" data-goods-field="goodsMoveFeatureCode">
        <ZSelect :value="item.goodsMoveFeatureCode || null" :options="options.goodsMoveFeatureCode" show-search allow-clear :disabled="readonly" :placeholder="tr('none')" popup-width="480px" :class="tall" data-f="goodsMoveFeatureCode" @update:value="setCode('goodsMoveFeatureCode', $event)" />
      </ZField>
      <ZField :label="tr('tempMonths')" :title="tr('tempMonthsHint')" :data-goods-index="index" data-graph="37" data-goods-field="tempImportMonths">
        <ZNumber :value="item.tempImportMonths ?? null" :min="0" :precision="0" placeholder="0" :disabled="readonly" :title="tr('tempMonthsHint')" :class="tall" data-f="tempImportMonths" @update:value="model.setField(item, 'tempImportMonths', $event)" />
      </ZField>
      <ZField :label="tr('certification')" class="@sm:col-span-2 @xl:col-span-4" :data-goods-index="index" data-graph="33" data-goods-field="certificationNote">
        <ZSelect :value="certification" mode="tags" :options="certificationOptions" allow-clear :disabled="readonly" :placeholder="tr('certificationPlaceholder')" popup-width="420px" :class="tall" data-f="certificationNote" @update:value="onCertification" />
      </ZField>
    </div>

    <p v-if="offText" class="m-0 rounded-field bg-gold-soft px-3 py-2 text-[13px] text-gold-ink" role="status" data-goods-keden-off>
      {{ tr('kedenOff', { key: keden.keyLabel.value, codes: offText }) }}
    </p>
    <p v-else-if="keden.narrowed.value" class="m-0 text-[13px] text-muted" data-goods-keden-hint>
      {{ tr('kedenHint', { key: keden.keyLabel.value }) }}
    </p>
  </div>
</template>
