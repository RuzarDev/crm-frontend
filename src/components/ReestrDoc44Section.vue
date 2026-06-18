<template>
  <div class="doc44-section">
    <div class="section-header">
      <span class="section-title">44 Графа ТД (документы)</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">+ Добавить документ</a-button>
    </div>

    <div v-if="items.length === 0" class="empty-hint">
      {{ readonly ? 'Нет документов' : 'Нажмите «+ Добавить документ» чтобы добавить позицию' }}
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="doc-row">
      <div class="doc-row-header">
        <span class="doc-row-num">{{ idx + 1 }}</span>
        <a-button v-if="!readonly" type="text" danger size="small" @click="removeItem(idx)">✕</a-button>
      </div>
      <div class="doc-fields">
        <div class="df df-wide">
          <div class="df-label">Тип документа (код ЕАЭС)</div>
          <a-select
            v-model:value="item.docTypeCode"
            size="small"
            :disabled="readonly"
            allow-clear
            show-search
            style="width: 100%"
            :options="eaesOptions"
            @change="(v: string | undefined) => onTypeCodeChange(item, v ?? null)"
          />
        </div>
        <div class="df df-wide">
          <div class="df-label">Наименование документа</div>
          <a-input
            v-model:value="item.docTypeName"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @change="emitChange"
          />
        </div>
        <div class="df df-wide">
          <div class="df-label">Номер документа</div>
          <a-input
            v-model:value="item.docNumber"
            size="small"
            :disabled="readonly"
            placeholder="—"
            @change="emitChange"
          />
        </div>
        <div class="df">
          <div class="df-label">Дата документа</div>
          <a-input
            v-model:value="item.docDate"
            size="small"
            :disabled="readonly"
            placeholder="ГГГГ-ММ-ДД"
            @change="emitChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ReestrDoc44ItemInput } from '@/types/api'
import { EAES_DOC_CODES } from '@/types/api'

const props = defineProps<{
  modelValue: ReestrDoc44ItemInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrDoc44ItemInput[]): void
}>()

const eaesOptions = EAES_DOC_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
}))

const items = ref<ReestrDoc44ItemInput[]>([])

watch(
  () => props.modelValue,
  (v) => {
    items.value = (v ?? []).map((d) => ({ ...d }))
  },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((d) => ({ ...d })))
}

function onTypeCodeChange(item: ReestrDoc44ItemInput, code: string | null) {
  item.docTypeCode = code
  const found = EAES_DOC_CODES.find((c) => c.code === code)
  if (found) item.docTypeName = found.name
  emitChange()
}

function addItem() {
  items.value.push({ docTypeCode: null, docTypeName: null, docNumber: null, docDate: null })
  emitChange()
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emitChange()
}
</script>

<style scoped>
.doc44-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--atg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.empty-hint {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
  padding: 4px 0;
}
.doc-row {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-sm);
  padding: 8px 10px;
  background: var(--atg-bg);
}
.doc-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.doc-row-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-teal);
}
.doc-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}
.df-wide {
  grid-column: span 2;
}
.df {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.df-label {
  font-size: 10px;
  color: var(--atg-muted);
  font-weight: 600;
  white-space: nowrap;
}
.df :deep(.ant-input-sm),
.df :deep(.ant-select-sm) {
  font-size: 13px;
}
</style>
