<!-- crm-frontend/src/components/reestr/PrecedingDocsBlock.vue -->
<!-- КЕДЕН-транзит §5 Предшествующие документы, повтор. -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="preceding-docs" :header="t('transit.kedenTranzitHdr', { title: t('transit.predshestvuyuschieDokumenty'), n: items.length })">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">{{ t('transit.dokument') }}</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">{{ t('transit.netPredshestvuyuschihDokumentov') }}</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <span class="row-num">{{ idx + 1 }}</span>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">{{ t('transit.tipDokumenta') }}</div>
              <a-select v-model:value="item.docTypeCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="docTypeOptions"
                :filter-option="filterOption" :placeholder="t('transit.vyberiteTip')" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">{{ t('transit.nomer') }}</div>
              <a-input v-model:value="item.number" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
            <div class="field" style="flex: 0 0 160px;">
              <div class="field-label">{{ t('transit.data') }}</div>
              <a-date-picker v-model:value="item.date" size="small" :disabled="readonly"
                style="width: 100%" format="DD.MM.YYYY" value-format="YYYY-MM-DD" placeholder="дд.мм.гггг" allow-clear @change="emitChange" />
            </div>
          </div>
          <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /> {{ t('transit.udalit') }}</a-button>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrPrecedingDocInput } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const { t } = useI18n()

const props = defineProps<{
  modelValue: ReestrPrecedingDocInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrPrecedingDocInput[]): void
}>()

type Option = { value: string; label: string }
const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

// Виды документов — классификатор ЕЭК 2009 с сервера (сверяется с НСИ ЕЭК раз в неделю).
const classifiers = useClassifiersStore()
void classifiers.load('2009').catch(() => {})
const docTypeOptions = computed(() => classifiers.options('2009'))

const items = ref<ReestrPrecedingDocInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({ docTypeCode: null, number: null, date: null })
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
  position: relative;
}
.row-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--atg-teal-soft, #e6f7f5); color: var(--atg-teal, #00b8a0);
  font-size: 12px; font-weight: 700;
}
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 2; }
.field-label {
  font-size: 12px; font-weight: 600; color: var(--atg-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.del-btn { align-self: flex-start; color: var(--atg-danger, #ff4d4f) !important; padding: 0 4px !important; height: 20px !important; font-size: 12px !important; }
</style>
