<!-- crm-frontend/src/components/reestr/GuaranteeBlock.vue -->
<!-- КЕДЕН-транзит §10 Обеспечение, повтор. -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="guarantees" :header="`КЕДЕН-транзит: Обеспечение (${items.length})`">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">+ Обеспечение</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">Нет сведений об обеспечении</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <span class="row-num">{{ idx + 1 }}</span>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">Вид</div>
              <a-select v-model:value="item.guaranteeTypeCode" size="small" :disabled="readonly"
                allow-clear style="width: 100%" :options="guaranteeTypeOptions" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Сумма</div>
              <a-input-number v-model:value="item.amount" size="small" :disabled="readonly"
                :min="0" style="width: 100%" @change="emitChange" />
            </div>
            <div class="field f-narrow">
              <div class="field-label">Валюта</div>
              <a-select v-model:value="item.currencyCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="currencyOptions"
                :filter-option="filterOption" placeholder="USD" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Номер</div>
              <a-input v-model:value="item.number" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
          <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /> Удалить</a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrGuaranteeInput } from '@/types/api'
import { CURRENCY_OPTIONS, GUARANTEE_TYPE_OPTIONS } from './reestrLocalOptions'

const props = defineProps<{
  modelValue: ReestrGuaranteeInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrGuaranteeInput[]): void
}>()

type Option = { value: string; label: string }
const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const guaranteeTypeOptions = GUARANTEE_TYPE_OPTIONS
const currencyOptions = CURRENCY_OPTIONS

const items = ref<ReestrGuaranteeInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({ guaranteeTypeCode: null, amount: null, currencyCode: null, number: null })
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
.row-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--atg-teal-soft, #e6f7f5); color: var(--atg-teal, #00b8a0);
  font-size: 11px; font-weight: 700;
}
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 2; }
.field.f-narrow { flex: 0 0 100px; min-width: 0; }
.field-label {
  font-size: 10px; font-weight: 600; color: var(--atg-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.del-btn { align-self: flex-start; color: var(--atg-danger, #ff4d4f) !important; padding: 0 4px !important; height: 20px !important; font-size: 12px !important; }
</style>
