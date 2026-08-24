<!-- crm-frontend/src/components/reestr/MiscSectionsBlock.vue -->
<!-- КЕДЕН-транзит §8-12: грузовые операции (повтор.), место временного хранения,
     пункт назначения, лицо представившее ПИ (скаляры на transit) -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="misc" header="КЕДЕН-транзит: ВХ / Пункт назначения / Лицо ПИ / Грузовые операции">
        <div class="subsection-title">Место временного хранения</div>
        <div class="field-row">
          <div class="field f-grow">
            <div class="field-label">Место временного хранения (код/наименование)</div>
            <a-input v-model:value="transit.tempStoragePlace" size="small" :disabled="readonly" placeholder="—" />
          </div>
        </div>

        <div class="subsection-title">Пункт назначения</div>
        <div class="field-row">
          <div class="field f-grow">
            <div class="field-label">Пункт назначения</div>
            <a-input v-model:value="transit.destinationPlace" size="small" :disabled="readonly" placeholder="—" />
          </div>
        </div>

        <div class="subsection-title">Лицо, представившее предварительную информацию</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Тип лица</div>
            <a-select v-model:value="transit.submitterType" size="small" :disabled="readonly"
              allow-clear style="width: 100%" :options="subjectTypeOptions" />
          </div>
          <div class="field">
            <div class="field-label">БИН/ИИН</div>
            <a-input v-model:value="transit.submitterBin" size="small" :disabled="readonly" placeholder="—" />
          </div>
          <div class="field f-grow">
            <div class="field-label">Наименование</div>
            <a-input v-model:value="transit.submitterName" size="small" :disabled="readonly" placeholder="—" />
          </div>
        </div>

        <div class="subsection-title">Грузовые операции ({{ items.length }})</div>
        <div class="cargo-ops-header">
          <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">+ Операция</a-button>
        </div>
        <div v-if="items.length === 0" class="empty-state">Нет грузовых операций</div>
        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <div class="field">
            <div class="field-label">Вид операции</div>
            <a-select v-model:value="item.operationTypeCode" size="small" :disabled="readonly"
              allow-clear style="width: 100%" :options="cargoOperationOptions" @change="emitChange" />
          </div>
          <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /></a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrCargoOperationInput, ReestrTransitFields } from '@/types/api'
import { CARGO_OPERATION_OPTIONS, SUBJECT_TYPE_OPTIONS } from './reestrLocalOptions'

const props = defineProps<{
  modelValue: ReestrCargoOperationInput[]
  transit: ReestrTransitFields
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrCargoOperationInput[]): void
}>()

const subjectTypeOptions = SUBJECT_TYPE_OPTIONS
const cargoOperationOptions = CARGO_OPERATION_OPTIONS

const items = ref<ReestrCargoOperationInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({ operationTypeCode: null })
  emitChange()
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emitChange()
}
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
.cargo-ops-header { display: flex; justify-content: flex-end; margin-bottom: 6px; }
.empty-state { font-size: 12px; color: var(--atg-muted); font-style: italic; padding: 4px 0; }
.field-row { display: flex; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; align-items: flex-end; }
.field { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 2; min-width: 220px; }
.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--atg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-card {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--atg-surface, var(--atg-bg));
  margin-bottom: 8px;
}
.row-card .field { flex: 1; }
.del-btn { color: var(--atg-danger, #ff4d4f) !important; padding: 0 4px !important; height: 20px !important; font-size: 13px !important; }
</style>
