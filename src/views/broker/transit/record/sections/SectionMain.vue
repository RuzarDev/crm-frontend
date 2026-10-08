<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import type { ReestrTransitFields } from '@/types/api'
import { POST_KEY, type RecordDraft } from '../recordModel'
import { useLocalOptions } from './localOptions'
import RecordSection from './RecordSection.vue'
import { departureOfficeTooLong, departureOfficeValue, useRecordRefs } from './refs'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Основное» (разбор §2.6 a, b и «Пост»): три группы — декларация, маршрут, итоги. Поля пишут прямо в черновик.
// Страны хранятся числовым кодом ОКСМ (подпись «398 — Казахстан»), таможня отправления — кодом поста (B.12).
// Слот lead — над группами (страница новой записи кладёт туда выбор клиента).
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`broker.transitRecord.main.${key}`)

const refs = useRecordRefs()
void refs.ensure('posts', 'stations', 'countries', 'foreignOffices')
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

// Выбор поста: в черновик — код поста (или короткое название без кода); ошибка — по значению в черновике.
const onOffice = (v: unknown) => {
  const name = str(v)
  setT('departureCustomsOffice', name === null ? null : departureOfficeValue(name).value)
}
const officeError = computed(() => departureOfficeTooLong(props.draft.transit.departureCustomsOffice) ? tr('departureOfficeTooLong') : undefined)
const onPost = (v: string) => { props.draft.fields[POST_KEY] = str(v) }
</script>

<template>
  <RecordSection id="main" :title="t('broker.transitRecord.sections.main')">
    <div class="flex flex-col gap-6">
      <!-- Сверху раздела: у новой записи страница кладёт сюда «Клиент *». -->
      <div v-if="$slots.lead" data-main-lead><slot name="lead" /></div>
      <div role="group" aria-labelledby="main-g-decl" class="flex flex-col gap-3" data-main-group="declaration">
        <h3 id="main-g-decl" :class="groupTitle">{{ tr('groupDeclaration') }}</h3>
        <div :class="grid">
          <ZField :label="tr('purpose')">
            <ZSelect :value="draft.transit.purposeCode" :options="purposeOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="purposeCode" @update:value="setStr('purposeCode', $event)" />
          </ZField>
          <ZField :label="tr('entryMethod')">
            <ZSelect :value="draft.transit.entryMethodCode" :options="entryOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="entryMethodCode" @update:value="setStr('entryMethodCode', $event)" />
          </ZField>
          <ZField :label="tr('direction')">
            <ZSelect :value="draft.transit.movementDirectionCode" :options="directionOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="movementDirectionCode" @update:value="setStr('movementDirectionCode', $event)" />
          </ZField>
          <ZField :label="tr('usedAsDeclaration')">
            <ZSelect :value="draft.transit.usedAsDeclarationCode" :options="usedOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="usedAsDeclarationCode" @update:value="setStr('usedAsDeclarationCode', $event)" />
          </ZField>
          <ZField :label="tr('post')">
            <ZCombobox :value="draft.fields[POST_KEY]" :options="refs.postOptions.value" allow-clear :disabled="readonly" :placeholder="tr('postPlaceholder')" :class="boxCtl" data-f="post" @update:value="onPost" />
          </ZField>
          <ZField :label="tr('departureOffice')" :error="officeError">
            <ZSelect :value="draft.transit.departureCustomsOffice" :options="refs.departureOfficeOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tr('departureOfficePlaceholder')" :class="boxCtl" data-f="departureCustomsOffice" @update:value="onOffice" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="main-g-route" class="flex flex-col gap-3" data-main-group="route">
        <h3 id="main-g-route" :class="groupTitle">{{ tr('groupRoute') }}</h3>
        <div :class="grid">
          <ZField :label="tr('departureCountry')">
            <ZSelect :value="draft.transit.departureCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="departureCountryCode" @update:value="setStr('departureCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('destinationCountry')">
            <ZSelect :value="draft.transit.destinationCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="destinationCountryCode" @update:value="setStr('destinationCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('transportMode')">
            <ZSelect :value="draft.transit.transportModeCode" :options="modeOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="transportModeCode" @update:value="setStr('transportModeCode', $event)" />
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
            <ZSelect :value="draft.transit.loadingCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="loadingCountryCode" @update:value="setStr('loadingCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('station')">
            <ZCombobox :value="draft.transit.loadingRailStation" :options="refs.stationOptions.value" allow-clear :disabled="readonly" :placeholder="tr('stationPlaceholder')" :class="boxCtl" data-f="loadingRailStation" @update:value="setStr('loadingRailStation', $event)" />
          </ZField>
        </div>

        <h4 :class="subTitle">{{ tr('unloadingPlace') }}</h4>
        <div :class="grid">
          <ZField :label="tr('country')">
            <ZSelect :value="draft.transit.unloadingCountryCode" :options="refs.countryOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="unloadingCountryCode" @update:value="setStr('unloadingCountryCode', $event)" />
          </ZField>
          <ZField :label="tr('station')">
            <ZCombobox :value="draft.transit.unloadingRailStation" :options="refs.stationOptions.value" allow-clear :disabled="readonly" :placeholder="tr('stationPlaceholder')" :class="boxCtl" data-f="unloadingRailStation" @update:value="setStr('unloadingRailStation', $event)" />
          </ZField>
          <ZField :label="tr('destinationOffice')">
            <ZSelect :value="draft.transit.destinationCustomsOffice" :options="refs.foreignOfficeOptions.value" show-search allow-clear :disabled="readonly" :placeholder="tr('destinationOfficePlaceholder')" :class="boxCtl" data-f="destinationCustomsOffice" @update:value="setStr('destinationCustomsOffice', $event)" />
          </ZField>
        </div>

        <h4 :class="subTitle">{{ tr('transportDoc') }}</h4>
        <div :class="grid">
          <ZField :label="tr('docType')">
            <ZSelect :value="draft.transit.transportDocTypeCode" :options="docTypeOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('docTypePlaceholder')" :class="boxCtl" data-f="transportDocTypeCode" @update:value="setStr('transportDocTypeCode', $event)" />
          </ZField>
          <ZField :label="tr('docNumber')">
            <ZInput :value="draft.transit.transportDocNumber" mono :disabled="readonly" :class="ctl" data-f="transportDocNumber" @update:value="setStr('transportDocNumber', $event)" />
          </ZField>
          <ZField :label="tr('docDate')">
            <ZDate :value="draft.transit.transportDocDate" allow-clear :disabled="readonly" :class="ctl" data-f="transportDocDate" @update:value="setT('transportDocDate', $event)" />
          </ZField>
        </div>
      </div>

      <div role="group" aria-labelledby="main-g-totals" class="flex flex-col gap-3" data-main-group="totals">
        <h3 id="main-g-totals" :class="groupTitle">{{ tr('groupTotals') }}</h3>
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
            <ZSelect :value="draft.transit.docCurrencyCode" :options="currencyOptions" show-search allow-clear :disabled="readonly" :placeholder="tr('choose')" :class="boxCtl" data-f="docCurrencyCode" @update:value="setStr('docCurrencyCode', $event)" />
          </ZField>
        </div>
        <p class="m-0 text-xs text-muted" data-main-totals-hint>{{ tr('totalsHint') }}</p>
      </div>
    </div>
  </RecordSection>
</template>
