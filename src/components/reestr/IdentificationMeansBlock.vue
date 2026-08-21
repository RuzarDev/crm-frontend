<!-- crm-frontend/src/components/reestr/IdentificationMeansBlock.vue -->
<!-- КЕДЕН-транзит §5 Средства идентификации (повтор.) -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="identification-means" :header="`КЕДЕН-транзит: Средства идентификации (${items.length})`">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">+ Строка</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">Нет средств идентификации</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <a-checkbox v-model:checked="item.noSeal" :disabled="readonly" @change="emitChange">Без пломбы</a-checkbox>
          <div class="field-row">
            <div class="field">
              <div class="field-label">Вид</div>
              <a-select v-model:value="item.meansTypeCode" size="small" :disabled="readonly || item.noSeal"
                show-search allow-clear style="width: 100%" :options="meansTypeOptions"
                :filter-option="filterOption" placeholder="01" @change="emitChange" />
            </div>
            <div class="field f-narrow">
              <div class="field-label">Кол-во</div>
              <a-input-number v-model:value="item.quantity" size="small" :disabled="readonly || item.noSeal"
                :min="0" style="width: 100%" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Номер</div>
              <a-input v-model:value="item.number" size="small" :disabled="readonly || item.noSeal"
                placeholder="—" @change="emitChange" />
            </div>
          </div>
          <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /> Удалить</a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrIdentificationMeansInput } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const props = defineProps<{
  modelValue: ReestrIdentificationMeansInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrIdentificationMeansInput[]): void
}>()

type Option = { value: string; label: string }
const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const classifiers = useClassifiersStore()
const meansTypeOptions = computed(() => classifiers.options('identification-means'))

onMounted(() => {
  classifiers.loadMany(['identification-means'])
})

const items = ref<ReestrIdentificationMeansInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({ noSeal: false, meansTypeCode: null, quantity: null, number: null })
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
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field.f-narrow { flex: 0 0 90px; min-width: 0; }
.field-label {
  font-size: 10px; font-weight: 600; color: var(--atg-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.del-btn { align-self: flex-start; color: var(--atg-danger, #ff4d4f) !important; padding: 0 4px !important; height: 20px !important; font-size: 12px !important; }
</style>
