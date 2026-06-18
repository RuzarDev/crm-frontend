<template>
  <div class="doc44-section">
    <div class="section-bar">
      <span class="section-label">44 ГРАФА ТД (ДОКУМЕНТЫ)</span>
      <a-button v-if="!readonly" type="dashed" size="small" @click="addItem">+ Добавить документ</a-button>
    </div>

    <div v-if="items.length === 0" class="empty-state">
      <span v-if="!readonly">Нажмите «+ Добавить документ» чтобы добавить позицию</span>
      <span v-else>Нет документов</span>
    </div>

    <div v-for="(item, idx) in items" :key="idx" class="doc-card">
      <div class="doc-num">{{ idx + 1 }}</div>

      <!-- Строка 1: тип документа (широко) -->
      <div class="doc-body">
        <div class="field-row">
          <div class="field f-grow">
            <div class="field-label">Тип документа (код ЕАЭС)</div>
            <a-select
              v-model:value="item.docTypeCode"
              size="small"
              :disabled="readonly"
              allow-clear
              show-search
              style="width: 100%"
              :options="eaesOptions"
              placeholder="Выберите тип"
              @change="(v: string | undefined) => onTypeCodeChange(item, v ?? null)"
            />
          </div>
          <div class="field f-grow">
            <div class="field-label">Наименование документа</div>
            <a-input
              v-model:value="item.docTypeName"
              size="small"
              :disabled="readonly"
              placeholder="—"
              @change="emitChange"
            />
          </div>
        </div>

        <!-- Строка 2: номер + дата -->
        <div class="field-row">
          <div class="field f-grow">
            <div class="field-label">Номер документа</div>
            <a-input
              v-model:value="item.docNumber"
              size="small"
              :disabled="readonly"
              placeholder="—"
              @change="emitChange"
            />
          </div>
          <div class="field" style="flex: 0 0 160px;">
            <div class="field-label">Дата документа</div>
            <a-date-picker
              v-model:value="item.docDate"
              size="small"
              :disabled="readonly"
              style="width: 100%"
              format="DD.MM.YYYY"
              value-format="YYYY-MM-DD"
              placeholder="дд.мм.гггг"
              allow-clear
              @change="emitChange"
            />
          </div>
        </div>
      </div>

      <a-button
        v-if="!readonly"
        type="text"
        danger
        size="small"
        class="del-btn"
        @click="removeItem(idx)"
      >✕</a-button>
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
  gap: 6px;
}

.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  letter-spacing: 0.06em;
}

.empty-state {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
  padding: 6px 0 2px;
}

.doc-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--atg-line);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--atg-surface, var(--atg-bg));
}

.doc-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--atg-teal-soft, #e6f7f5);
  color: var(--atg-teal, #00b8a0);
  font-size: 11px;
  font-weight: 700;
  margin-top: 20px;
}

.doc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.del-btn {
  flex-shrink: 0;
  color: var(--atg-danger, #ff4d4f) !important;
  padding: 0 4px !important;
  height: 20px !important;
  font-size: 13px !important;
  margin-top: 20px;
}

.field-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.f-grow {
  flex: 1;
  min-width: 0;
}

.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--atg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field :deep(.ant-input-sm),
.field :deep(.ant-select-sm .ant-select-selector),
.field :deep(.ant-picker-small) {
  font-size: 13px;
}
</style>
