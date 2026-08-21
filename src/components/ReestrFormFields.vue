<template>
  <a-form layout="vertical">
    <div class="form-fields-wrap">
      <a-form-item v-if="!readonly && !isEdit && clientOptions?.length" label="Клиент">
        <a-select
          v-model:value="formState.clientId"
          :options="clientOptions"
          placeholder="Выберите клиента"
          style="width: 100%"
        />
      </a-form-item>

      <a-form-item label="Статус">
        <a-select
          v-model:value="formState.status"
          :options="statusOptions"
          placeholder="Статус"
          style="width: 100%"
          :disabled="readonly || (isEdit && !canPickStatus)"
        />
      </a-form-item>

      <div class="fields-grid">
        <div
          v-for="(_value, key) in formState.fields"
          :key="key"
          class="field-row"
        >
          <div class="field-label">{{ key }}</div>
          <a-auto-complete
            v-if="key === 'Пост' || key === 'Станция назначения'"
            v-model:value="formState.fields[key]"
            :options="key === 'Пост' ? postOptions : stationOptions"
            :filter-option="filterRefOption"
            :placeholder="key === 'Пост' ? 'Код/название поста' : 'Код/название станции'"
            size="small" :disabled="readonly" style="width: 100%"
          />
          <a-input
            v-else
            v-model:value="formState.fields[key]"
            placeholder="—"
            size="small"
            :disabled="readonly"
          />
        </div>
      </div>

      <!-- ЖДН section -->
      <div class="subsection-title">ЖД накладная</div>
      <div class="fields-grid">
        <div class="field-row">
          <div class="field-label">№ Пломбы</div>
          <a-input
            v-model:value="formState.sealNumber"
            placeholder="—"
            size="small"
            :disabled="readonly"
          />
        </div>
        <div class="field-row">
          <div class="field-label">Вид упаковки</div>
          <a-input
            v-model:value="formState.packagingType"
            placeholder="—"
            size="small"
            :disabled="readonly"
          />
        </div>
      </div>

      <!-- Товары section -->
      <div class="subsection-title">Товары</div>
      <ReestrGoodsSection v-model="formState.goods" :readonly="readonly" />

      <!-- 44 графа section -->
      <div class="subsection-title">44 Графа ТД</div>
      <ReestrDoc44Section v-model="formState.doc44" :readonly="readonly" />

      <!-- КЕДЕН-транзит: сворачиваемые блоки, добавлены ниже существующей вёрстки -->
      <GeneralInfoBlock :transit="formState.transit" :readonly="readonly" />
      <GoodsShipmentBlock :transit="formState.transit" :readonly="readonly" />
      <TransportMeansBlock v-model="formState.transportMeans" :readonly="readonly" />
      <IdentificationMeansBlock v-model="formState.identificationMeans" :readonly="readonly" />
      <PackagingBlock v-model="formState.packages" :transit="formState.transit" :readonly="readonly" />
      <ContainersBlock v-model="formState.containers" :readonly="readonly" />
    </div>
  </a-form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type {
  ReestrEntryStatus,
  ReestrGoodsItemInput,
  ReestrDoc44ItemInput,
  ReestrTransitFields,
  ReestrTransportMeansInput,
  ReestrIdentificationMeansInput,
  ReestrPackageInput,
  ReestrContainerInput,
} from '@/types/api'
import ReestrGoodsSection from '@/components/ReestrGoodsSection.vue'
import ReestrDoc44Section from '@/components/ReestrDoc44Section.vue'
import GeneralInfoBlock from '@/components/reestr/GeneralInfoBlock.vue'
import GoodsShipmentBlock from '@/components/reestr/GoodsShipmentBlock.vue'
import TransportMeansBlock from '@/components/reestr/TransportMeansBlock.vue'
import IdentificationMeansBlock from '@/components/reestr/IdentificationMeansBlock.vue'
import PackagingBlock from '@/components/reestr/PackagingBlock.vue'
import ContainersBlock from '@/components/reestr/ContainersBlock.vue'
import { referencesApi } from '@/api/references'

type RefOption = { value: string; label: string }
const postOptions = ref<RefOption[]>([])
const stationOptions = ref<RefOption[]>([])

const filterRefOption = (input: string, option: RefOption) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

onMounted(async () => {
  try {
    const [posts, stations] = await Promise.all([
      referencesApi.listCustomsPosts(),
      referencesApi.listStations(),
    ])
    postOptions.value = posts.map((p) => ({ value: p.name, label: p.name }))
    stationOptions.value = stations.map((s) => ({ value: s.name, label: s.name }))
  } catch {
    // справочники недоступны — поля остаются свободным вводом
  }
})

interface FormState {
  fields: Record<string, string | null>
  status: ReestrEntryStatus
  clientId?: string
  sealNumber: string | null
  packagingType: string | null
  goods: ReestrGoodsItemInput[]
  doc44: ReestrDoc44ItemInput[]
  transit: ReestrTransitFields
  transportMeans: ReestrTransportMeansInput[]
  identificationMeans: ReestrIdentificationMeansInput[]
  packages: ReestrPackageInput[]
  containers: ReestrContainerInput[]
}

defineProps<{
  formState: FormState
  isEdit: boolean
  readonly?: boolean
  clientOptions?: { value: string; label: string }[]
  canPickStatus: boolean
  statusOptions: { value: ReestrEntryStatus; label: string }[]
}>()
</script>

<style scoped>
.form-fields-wrap {
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subsection-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  background: var(--atg-bg);
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-sm);
  transition: border-color var(--atg-transition), background var(--atg-transition);
}

.field-row:focus-within {
  border-color: var(--atg-accent);
  background: #fffdf6;
}

.field-label {
  font-size: 11px;
  line-height: 1.2;
  color: var(--atg-muted);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-row :deep(.ant-input-sm) {
  min-height: 28px;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  box-shadow: none !important;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--atg-text);
}

.field-row :deep(.ant-input-sm:focus) {
  box-shadow: none !important;
}

.field-row :deep(.ant-input-sm[disabled]) {
  background: transparent;
  color: var(--atg-text);
  cursor: default;
}
</style>
