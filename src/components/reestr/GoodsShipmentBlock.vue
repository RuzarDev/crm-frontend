<!-- crm-frontend/src/components/reestr/GoodsShipmentBlock.vue -->
<!-- КЕДЕН-транзит §5 Товарная партия — мультимодал, места погрузки/разгрузки, орган назначения -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="shipment" header="КЕДЕН-транзит: Товарная партия (гр.15–18/25/26)">
        <div class="field-row">
          <div class="field f-narrow">
            <div class="field-label">Мультимодальная перевозка</div>
            <a-switch v-model:checked="transit.isMultimodal" size="small" :disabled="readonly" />
          </div>
          <div class="field">
            <div class="field-label">Вид транспорта</div>
            <a-select v-model:value="transit.transportModeCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="transportModeOptions"
              :filter-option="filterOption" placeholder="20" />
          </div>
        </div>

        <div class="subsection-title">Место погрузки</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Страна</div>
            <a-select v-model:value="transit.loadingCountryCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="countryOptions"
              :filter-option="filterOption" placeholder="CN" />
          </div>
          <div class="field">
            <div class="field-label">ЖД станция</div>
            <a-auto-complete v-model:value="transit.loadingRailStation" size="small" :disabled="readonly"
              :options="stationOptions" :filter-option="filterOption" style="width: 100%"
              placeholder="Код/название станции" />
          </div>
        </div>

        <div class="subsection-title">Место разгрузки</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Страна</div>
            <a-select v-model:value="transit.unloadingCountryCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="countryOptions"
              :filter-option="filterOption" placeholder="KZ" />
          </div>
          <div class="field">
            <div class="field-label">ЖД станция</div>
            <a-auto-complete v-model:value="transit.unloadingRailStation" size="small" :disabled="readonly"
              :options="stationOptions" :filter-option="filterOption" style="width: 100%"
              placeholder="Код/название станции" />
          </div>
        </div>

        <div class="field-row">
          <div class="field f-2">
            <div class="field-label">Таможенный орган назначения</div>
            <a-select v-model:value="transit.destinationCustomsOffice" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="foreignOfficeOptions"
              :filter-option="filterOption" placeholder="Код/название органа" />
          </div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ReestrTransitFields } from '@/types/api'
import { referencesApi } from '@/api/references'
import { useClassifiersStore } from '@/stores/classifiers'

defineProps<{
  transit: ReestrTransitFields
  readonly?: boolean
}>()

type Option = { value: string; label: string }

const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const classifiers = useClassifiersStore()
const transportModeOptions = computed(() => classifiers.options('transport-mode'))

const countryOptions = ref<Option[]>([])
const stationOptions = ref<Option[]>([])
const foreignOfficeOptions = ref<Option[]>([])

onMounted(async () => {
  await classifiers.loadMany(['transport-mode'])
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch (e) {
    console.error('Failed to load countries', e)
  }
  try {
    const stations = await referencesApi.listStations()
    stationOptions.value = stations.map((s) => ({ value: s.name, label: s.name }))
  } catch (e) {
    console.error('Failed to load stations', e)
  }
  try {
    const offices = await referencesApi.listForeignCustomsOffices()
    foreignOfficeOptions.value = offices.map((o) => ({
      value: o.code,
      label: `${o.code} — ${o.name}${o.countryCode ? ` (${o.countryCode})` : ''}`,
    }))
  } catch (e) {
    console.error('Failed to load foreign customs offices', e)
  }
})
</script>

<style scoped>
.reestr-block { margin-top: 4px; }
.subsection-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 10px 0 4px;
}
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; align-items: flex-end; }
.field { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 3px; }
.field.f-2 { flex: 2; min-width: 220px; }
.field.f-narrow { flex: 0 0 auto; min-width: 0; }
.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--atg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
