<!-- crm-frontend/src/components/reestr/TransportMeansBlock.vue -->
<!-- КЕДЕН-транзит §4 ТС на границе (повтор.) -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="transport-means" :header="`КЕДЕН-транзит: ТС на границе (${items.length})`">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">+ ТС</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">Нет транспортных средств</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <div class="row-top">
            <span class="row-num">{{ idx + 1 }}</span>
            <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /></a-button>
          </div>
          <div class="field-row">
            <div class="field">
              <div class="field-label">Вид транспорта</div>
              <a-select v-model:value="item.transportModeCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="transportModeOptions"
                :filter-option="filterOption" placeholder="20" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Цель ввоза</div>
              <a-select v-model:value="item.purposeCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="purposeOptions"
                :filter-option="filterOption" placeholder="1" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Тип ТС</div>
              <a-select v-model:value="item.vehicleTypeCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="vehicleTypeOptions"
                :filter-option="filterOption" placeholder="201" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">№ вагона/контейнера</div>
              <a-input v-model:value="item.wagonOrContainerNumber" size="small" :disabled="readonly"
                placeholder="—" @change="emitChange" />
            </div>
          </div>
          <div class="flags-row">
            <a-checkbox v-model:checked="item.isEmpty" :disabled="readonly" @change="emitChange">Порожнее</a-checkbox>
            <a-checkbox v-model:checked="item.isWagonReturn" :disabled="readonly" @change="emitChange">Возврат</a-checkbox>
            <a-checkbox v-model:checked="item.inContainer" :disabled="readonly" @change="emitChange">В контейнере</a-checkbox>
            <a-checkbox v-model:checked="item.matchesTransitVehicle" :disabled="readonly" @change="emitChange">Совпадает с ТС при транзите</a-checkbox>
          </div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrTransportMeansInput } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const props = defineProps<{
  modelValue: ReestrTransportMeansInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrTransportMeansInput[]): void
}>()

type Option = { value: string; label: string }
const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const classifiers = useClassifiersStore()
const transportModeOptions = computed(() => classifiers.options('transport-mode'))
const purposeOptions = computed(() => classifiers.options('transport-purpose'))
const vehicleTypeOptions = computed(() => classifiers.options('2024'))

onMounted(() => {
  classifiers.loadMany(['transport-mode', 'transport-purpose', '2024'])
})

const items = ref<ReestrTransportMeansInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({
    transportModeCode: null,
    purposeCode: null,
    vehicleTypeCode: null,
    wagonOrContainerNumber: null,
    isEmpty: false,
    isWagonReturn: false,
    inContainer: false,
    matchesTransitVehicle: false,
  })
  emitChange()
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emitChange()
}
</script>

<style scoped>
.reestr-block { margin-top: 4px; }
.empty-state { font-size: 12px; color: var(--atg-muted); font-style: italic; padding: 4px 0; }
.row-card {
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 10px 12px 8px;
  background: var(--atg-surface, var(--atg-bg));
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 8px;
}
.row-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: -2px; }
.row-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--atg-teal-soft, #e6f7f5); color: var(--atg-teal, #00b8a0);
  font-size: 11px; font-weight: 700;
}
.del-btn { color: var(--atg-danger, #ff4d4f) !important; padding: 0 4px !important; height: 20px !important; font-size: 13px !important; }
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field-label {
  font-size: 10px; font-weight: 600; color: var(--atg-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.flags-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 2px; }
.flags-row :deep(.ant-checkbox-wrapper) { font-size: 12px; }
</style>
