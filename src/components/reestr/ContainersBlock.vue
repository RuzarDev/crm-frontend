<!-- crm-frontend/src/components/reestr/ContainersBlock.vue -->
<!-- КЕДЕН-транзит §5 Контейнеры (повтор.) -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="containers" :header="`КЕДЕН-транзит: Контейнеры (${items.length})`">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">+ Контейнер</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">Нет контейнеров</div>

        <div v-for="(item, idx) in items" :key="idx" class="field-row">
          <div class="field">
            <div class="field-label">№ контейнера</div>
            <a-input v-model:value="item.containerNumber" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
          </div>
          <div class="field f-grow">
            <div class="field-label">Примечание</div>
            <a-input v-model:value="item.note" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
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
import type { ReestrContainerInput } from '@/types/api'

const props = defineProps<{
  modelValue: ReestrContainerInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrContainerInput[]): void
}>()

const items = ref<ReestrContainerInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({ containerNumber: null, note: null })
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
.field-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--atg-surface, var(--atg-bg));
  margin-bottom: 8px;
}
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 2; }
.field-label {
  font-size: 10px; font-weight: 600; color: var(--atg-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.del-btn { color: var(--atg-danger, #ff4d4f) !important; padding: 0 4px !important; height: 20px !important; font-size: 13px !important; }
</style>
