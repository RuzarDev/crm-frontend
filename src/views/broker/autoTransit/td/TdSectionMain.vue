<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import type { ReestrTransitFields } from '@/types/api'
import type { RecordDraft } from '@/views/broker/transit/record/recordModel'
import { useLocalOptions } from '@/views/broker/transit/record/sections/localOptions'
import RecordSection from '@/views/broker/transit/record/sections/RecordSection.vue'
import { departureOfficeTooLong, departureOfficeValue, useRecordRefs } from '@/views/broker/transit/record/sections/refs'
import { boxCtl, ctl, grid, ph, str } from '@/views/broker/transit/record/sections/ui'

// «Основное» ТД авто-транзита: тот же раздел, что у записи ЖД-транзита (SectionMain), но без ЖД-станций погрузки
// и выгрузки и без «Пост» (у партии машины нет строки реестра). Декларация, маршрут (страны, вид транспорта, место
// погрузки и выгрузки — страной, орган назначения, транспортный документ), итоги. Подписи — общие с SectionMain
// (broker.transitRecord.main.*), справочники — тем же загрузчиком страницы (useRecordRefs). SectionMain не менять.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.main.${key}`)

const refs = useRecordRefs()
// Таможня назначения ПИ (27.11.2026): у авто пост назначения обычно в РК (55510…), а список ЖД-раздела — только таможни
// других стран ЕАЭС. Сначала посты РК (значение — код поста, как у таможни отправления), затем таможни других стран.
const destinationOfficeOptions = computed(() => {
  const seen = new Set<string>()
  const out: { value: string; label: string }[] = []
  for (const o of [...refs.departureOfficeOptions.value, ...refs.foreignOfficeOptions.value]) {
    const v = String(o.value)
    if (seen.has(v)) continue
    seen.add(v)
    out.push({ value: v, label: String(o.label) })
  }
  return out
})
void refs.ensure('posts', 'countries', 'foreignOffices')
void refs.ensureClassifiers(['presentation-purpose', 'entry-method', 'movement-direction', 'used-as-declaration', 'transport-mode', '2009'])

const groupTitle = 'm-0 text-[13px] leading-5 font-semibold text-ink-2'
const subTitle = 'm-0 mt-1 text-xs leading-5 font-medium text-muted'
function setT<K extends keyof ReestrTransitFields>(key: K, value: ReestrTransitFields[K]) {
  props.draft.transit[key] = value
}
type StringKey = { [K in keyof ReestrTransitFields]: ReestrTransitFields[K] extends string | null ? K : never }[keyof ReestrTransitFields]
const setStr = (key: StringKey, v: unknown) => setT(key, str(v))

const purposeOptions = computed(() => refs.classifierOptions('presentation-purpose'))
const entryOptions = computed(() => refs.classifierOptions('entry-method'))
const directionOptions = computed(() => refs.classifierOptions('movement-direction'))
const usedOptions = computed(() => refs.classifierOptions('used-as-declaration'))
const modeOptions = computed(() => refs.classifierOptions('transport-mode'))
const docTypeOptions = computed(() => refs.classifierOptions('2009'))

const { currencies: currencyOptions } = useLocalOptions()

// Таможня отправления — код поста (как в записи транзита, B.12); длиннее 32 знаков сервер записи не принимал.
const onOffice = (v: unknown) => {
  const name = str(v)
  setT('departureCustomsOffice', name === null ? null : departureOfficeValue(name).value)
}
const officeError = computed(() => departureOfficeTooLong(props.draft.transit.departureCustomsOffice) ? tr('departureOfficeTooLong') : undefined)
</script>

<template>
  <RecordSection id="main" :title="t('broker.transitRecord.sections.main')">
    <div class="flex flex-col gap-6">
      <div role="group" aria-labelledby="td-main-g-decl" class="flex flex-col gap-3" data-main-group="declaration">
        <h3 id="td-main-g-decl" :class="groupTitle">{{ tr('groupDeclaration') }}</h3>
        <div :class="grid">
          <ZField :label="tr('purpose')">
            <ZSelect :value="draft.transit.purposeCode" :options="purposeOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="purposeCode" @update:value="setStr('purposeCode', $event)" />
          </ZField>
          <ZField :label="tr('entryMethod')">
            <ZSelect :value="draft.transit.entryMethodCode" :options="entryOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="entryMethodCode" @update:value="setStr('entryMethodCode', $event)" />
          </ZField>
          <ZField :label="tr('direction')">
            <ZSelect :value="draft.transit.movementDirectionCode" :options="directionOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="movementDirectionCode" @update:value="setStr('movementDirectionCode', $event)" />
          </ZField>
          <ZField :label="tr('usedAsDeclaration')">
            <ZSelect :value="draft.transit.usedAsDeclarationCode" :options="usedOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="usedAsDeclarationCode" @update:value="setStr('usedAsDeclarationCode', $event)" />
          </ZField>
          <ZField :label="tr('departureOffice')" :error="officeError">
            <ZSelect :value="draft.transit.departureCustomsOffice" :options="refs.departureOfficeOptions.value" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('departureOfficePlaceholder'))" :class="boxCtl" data-f="departureCustomsOffice" @update:value="onOffice" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="td-main-g-route" class="flex flex-col gap-3" data-main-group="route">
        <h3 id="td-main-g-route" :class="groupTitle">{{ tr('groupRoute') }}</h3>
        <div :class="grid">
          <ZField :label="tr('departureCountry')">
            <ZSelect :value="draft.transit.departureCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="departureCountryCode" @update:value="setStr('departureCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('destinationCountry')">
            <ZSelect :value="draft.transit.destinationCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="destinationCountryCode" @update:value="setStr('destinationCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('transportMode')">
            <ZSelect :value="draft.transit.transportModeCode" :options="modeOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="transportModeCode" @update:value="setStr('transportModeCode', $event)" />
          </ZField>
          <ZField :label="tr('multimodal')">
            <div class="flex h-9 items-center max-sm:h-11">
              <ZSwitch :checked="draft.transit.isMultimodal" :disabled="readonly" data-f="isMultimodal" @update:checked="setT('isMultimodal', $event)" />
            </div>
          </ZField>
        </div>

        <h4 :class="subTitle">{{ tr('loadingPlace') }}</h4>
        <div :class="grid">
          <ZField :label="tr('country')">
            <ZSelect :value="draft.transit.loadingCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="loadingCountryCode" @update:value="setStr('loadingCountryCode', $event)" />
          </ZField>
        </div>

        <h4 :class="subTitle">{{ tr('unloadingPlace') }}</h4>
        <div :class="grid">
          <ZField :label="tr('country')">
            <ZSelect :value="draft.transit.unloadingCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="unloadingCountryCode" @update:value="setStr('unloadingCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('destinationOffice')">
            <ZSelect :value="draft.transit.destinationCustomsOffice" :options="destinationOfficeOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('destinationOfficePlaceholder'))" :class="boxCtl" data-f="destinationCustomsOffice" @update:value="setStr('destinationCustomsOffice', $event)" />
          </ZField>
        </div>

        <h4 :class="subTitle">{{ tr('transportDoc') }}</h4>
        <div :class="grid">
          <ZField :label="tr('docType')">
            <ZSelect :value="draft.transit.transportDocTypeCode" :options="docTypeOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('docTypePlaceholder'))" :class="boxCtl" data-f="transportDocTypeCode" @update:value="setStr('transportDocTypeCode', $event)" />
          </ZField>
          <ZField :label="tr('docNumber')">
            <ZInput :value="draft.transit.transportDocNumber" mono :disabled="readonly" :class="ctl" data-f="transportDocNumber" @update:value="setStr('transportDocNumber', $event)" />
          </ZField>
          <ZField :label="tr('docDate')">
            <ZDate :value="draft.transit.transportDocDate" allow-clear :placeholder="ph(readonly)" :disabled="readonly" :class="ctl" data-f="transportDocDate" @update:value="setT('transportDocDate', $event)" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="td-main-g-totals" class="flex flex-col gap-3" data-main-group="totals">
        <h3 id="td-main-g-totals" :class="groupTitle">{{ tr('groupTotals') }}</h3>
        <div :class="grid">
          <ZField :label="tr('goodsQuantity')">
            <ZNumber :value="draft.transit.goodsQuantity" :min="0" :precision="0" :disabled="readonly" :class="ctl" data-f="goodsQuantity" @update:value="setT('goodsQuantity', $event)" />
          </ZField>
          <ZField :label="tr('cargoPlaces')">
            <ZNumber :value="draft.transit.cargoPlacesCount" :min="0" :precision="0" :disabled="readonly" :class="ctl" data-f="cargoPlacesCount" @update:value="setT('cargoPlacesCount', $event)" />
          </ZField>
          <ZField :label="tr('grossWeight')">
            <ZNumber :value="draft.transit.grossWeightKg" :min="0" :disabled="readonly" :class="ctl" data-f="grossWeightKg" @update:value="setT('grossWeightKg', $event)" />
          </ZField>
          <ZField :label="tr('totalValue')">
            <ZNumber :value="draft.transit.totalValue" :min="0" :disabled="readonly" :class="ctl" data-f="totalValue" @update:value="setT('totalValue', $event)" />
          </ZField>
          <ZField :label="tr('docCurrency')">
            <ZSelect :value="draft.transit.docCurrencyCode" :options="currencyOptions" show-search allow-clear :disabled="readonly" :placeholder="ph(readonly, tr('choose'))" :class="boxCtl" data-f="docCurrencyCode" @update:value="setStr('docCurrencyCode', $event)" />
          </ZField>
        </div>
        <p class="m-0 text-xs text-muted" data-main-totals-hint>{{ tr('totalsHint') }}</p>
      </div>
    </div>
  </RecordSection>
</template>
