<!-- crm-frontend/src/components/reestr/GeneralInfoBlock.vue -->
<!-- КЕДЕН-транзит §1 Общие сведения — скаляры на ReestrEntry.transit -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="general" :header="t('transit.kedenTranzitObschieSvedeniya')">
        <div class="field-row">
          <div class="field">
            <div class="field-label">{{ t('transit.celPredstavleniya') }}</div>
            <a-select v-model:value="transit.purposeCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="purposeOptions"
              :filter-option="filterOption" placeholder="06" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.tamozhennyyOrganOtpravleniya') }}</div>
            <a-auto-complete v-model:value="transit.departureCustomsOffice" size="small" :disabled="readonly"
              :options="postOptions" :filter-option="filterOption" style="width: 100%"
              :placeholder="t('transit.kodNazvaniePosta')" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <div class="field-label">{{ t('transit.sposobVvoza') }}</div>
            <a-select v-model:value="transit.entryMethodCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="entryMethodOptions"
              :filter-option="filterOption" placeholder="RW" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.napravleniePeremescheniya') }}</div>
            <a-select v-model:value="transit.movementDirectionCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="movementDirectionOptions"
              :filter-option="filterOption" placeholder="ПИ" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.ispolzovanieKakTd') }}</div>
            <a-select v-model:value="transit.usedAsDeclarationCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="usedAsDeclarationOptions"
              :filter-option="filterOption" placeholder="СД" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <div class="field-label">{{ t('transit.kolichestvoTovarov') }}</div>
            <a-input-number v-model:value="transit.goodsQuantity" size="small" :disabled="readonly"
              :min="0" style="width: 100%" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.kolichestvoGruzovyhMest') }}</div>
            <a-input-number v-model:value="transit.cargoPlacesCount" size="small" :disabled="readonly"
              :min="0" style="width: 100%" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.massaBruttoKg') }}</div>
            <a-input-number v-model:value="transit.grossWeightKg" size="small" :disabled="readonly"
              :min="0" style="width: 100%" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <div class="field-label">{{ t('transit.stranaOtpravleniya') }}</div>
            <a-select v-model:value="transit.departureCountryCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="countryOptions"
              :filter-option="filterOption" placeholder="CN" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.stranaNaznacheniya') }}</div>
            <a-select v-model:value="transit.destinationCountryCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="countryOptions"
              :filter-option="filterOption" placeholder="KZ" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <div class="field-label">{{ t('transit.itogovayaObschayaStoimost') }}</div>
            <a-input-number v-model:value="transit.totalValue" size="small" :disabled="readonly"
              :min="0" style="width: 100%" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.valyutaDokumenta') }}</div>
            <a-select v-model:value="transit.docCurrencyCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="currencyOptions"
              :filter-option="filterOption" placeholder="USD" />
          </div>
        </div>

        <div class="subsection-title">{{ t('transit.transportnyyDokument') }}</div>
        <div class="field-row">
          <div class="field f-2">
            <div class="field-label">{{ t('transit.vid') }}</div>
            <a-select v-model:value="transit.transportDocTypeCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="docTypeOptions"
              :filter-option="filterOption" :placeholder="t('transit.vyberiteVidDokumenta')" />
          </div>
          <div class="field">
            <div class="field-label">{{ t('transit.nomer') }}</div>
            <a-input v-model:value="transit.transportDocNumber" size="small" :disabled="readonly" placeholder="—" />
          </div>
          <div class="field" style="flex: 0 0 160px;">
            <div class="field-label">{{ t('transit.data') }}</div>
            <a-date-picker v-model:value="transit.transportDocDate" size="small" :disabled="readonly"
              style="width: 100%" format="DD.MM.YYYY" value-format="YYYY-MM-DD" placeholder="дд.мм.гггг" allow-clear />
          </div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import type { ReestrTransitFields } from '@/types/api'
import { referencesApi } from '@/api/references'
import { useClassifiersStore } from '@/stores/classifiers'

const { t } = useI18n()

defineProps<{
  transit: ReestrTransitFields
  readonly?: boolean
}>()

type Option = { value: string; label: string }

const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const classifiers = useClassifiersStore()
const purposeOptions = computed(() => classifiers.options('presentation-purpose'))
const entryMethodOptions = computed(() => classifiers.options('entry-method'))
const movementDirectionOptions = computed(() => classifiers.options('movement-direction'))
const usedAsDeclarationOptions = computed(() => classifiers.options('used-as-declaration'))

// Виды документов — классификатор ЕЭК 2009 с сервера (сверяется с НСИ ЕЭК раз в неделю).
void classifiers.load('2009').catch(() => {})
const docTypeOptions = computed(() => classifiers.options('2009'))

const CURRENCIES: Option[] = [
  { value: 'USD', label: 'USD — Доллар США' },
  { value: 'EUR', label: 'EUR — Евро' },
  { value: 'CNY', label: 'CNY — Юань' },
  { value: 'KZT', label: 'KZT — Тенге' },
  { value: 'RUB', label: 'RUB — Рубль' },
  { value: 'GBP', label: 'GBP — Фунт стерлингов' },
  { value: 'CHF', label: 'CHF — Швейцарский франк' },
  { value: 'JPY', label: 'JPY — Иена' },
  { value: 'AED', label: 'AED — Дирхам ОАЭ' },
  { value: 'TRY', label: 'TRY — Турецкая лира' },
]
const currencyOptions = CURRENCIES

const postOptions = ref<Option[]>([])
const countryOptions = ref<Option[]>([])

onMounted(async () => {
  await classifiers.loadMany([
    'presentation-purpose',
    'entry-method',
    'movement-direction',
    'used-as-declaration',
  ])
  try {
    const posts = await referencesApi.listCustomsPosts()
    postOptions.value = posts.map((p) => ({ value: p.name, label: p.name }))
  } catch (e) {
    console.error('Failed to load customs posts', e)
  }
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch (e) {
    console.error('Failed to load countries', e)
  }
})
</script>

<style scoped>
.reestr-block { margin-top: 4px; }
.subsection-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--z-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 10px 0 4px;
}
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.field { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 3px; }
.field.f-2 { flex: 2; min-width: 220px; }
.field-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--z-ink-2);
}
</style>
