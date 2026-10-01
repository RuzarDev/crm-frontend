<!-- crm-frontend/src/components/reestr/PackagingBlock.vue -->
<!-- КЕДЕН-транзит §5 Упаковка — PackagingInfoCode (скаляр) + ReestrPackage (повтор.) -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="packaging" :header="t('transit.kedenTranzitHdr', { title: t('transit.upakovkaHdr'), n: items.length })">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">{{ t('transit.upakovka') }}</a-button>
        </template>

        <div class="field-row">
          <div class="field">
            <div class="field-label">{{ t('transit.informaciyaObUpakovke') }}</div>
            <a-select v-model:value="transit.packagingInfoCode" size="small" :disabled="readonly"
              show-search allow-clear style="width: 100%" :options="packagingInfoOptions"
              :filter-option="filterOption" placeholder="1" />
          </div>
        </div>

        <div v-if="items.length === 0" class="empty-state">{{ t('transit.netUpakovok') }}</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <div class="row-top">
            <span class="row-num">{{ idx + 1 }}</span>
            <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
          </div>
          <div class="field-row">
            <div class="field">
              <div class="field-label">{{ t('transit.vidInformaciiObUpakovke') }}</div>
              <a-select v-model:value="item.packagingInfoKindCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="packagingInfoKindOptions"
                :filter-option="filterOption" placeholder="0" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">{{ t('transit.vidUpakovki') }}</div>
              <a-select v-model:value="item.packageTypeCode" size="small" :disabled="readonly"
                show-search allow-clear style="width: 100%" :options="packageTypeOptions"
                :filter-option="filterOption" placeholder="BG" @change="emitChange" />
            </div>
            <div class="field f-narrow">
              <div class="field-label">{{ t('transit.kolVo') }}</div>
              <a-input-number v-model:value="item.packageCount" size="small" :disabled="readonly"
                :min="0" style="width: 100%" @change="emitChange" />
            </div>
          </div>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">{{ t('transit.opisanie') }}</div>
              <a-input v-model:value="item.description" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrPackageInput, ReestrTransitFields } from '@/types/api'
import { useClassifiersStore } from '@/stores/classifiers'

const { t } = useI18n()

const props = defineProps<{
  modelValue: ReestrPackageInput[]
  transit: ReestrTransitFields
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrPackageInput[]): void
}>()

type Option = { value: string; label: string }
const filterOption = (input: string, option: Option) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const classifiers = useClassifiersStore()
const packagingInfoOptions = computed(() => classifiers.options('packaging-info'))
const packagingInfoKindOptions = computed(() => classifiers.options('packaging-info-kind'))
const packageTypeOptions = computed(() => classifiers.options('2013'))

onMounted(() => {
  classifiers.loadMany(['packaging-info', 'packaging-info-kind', '2013'])
})

const items = ref<ReestrPackageInput[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((i) => ({ ...i })) },
  { immediate: true },
)

function emitChange() {
  emit('update:modelValue', items.value.map((i) => ({ ...i })))
}

function addItem() {
  items.value.push({ packagingInfoKindCode: null, packageTypeCode: null, packageCount: null, description: null })
  emitChange()
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
  emitChange()
}
</script>

<style scoped>
.reestr-block { margin-top: 4px; }
.empty-state { font-size: 12px; color: var(--z-muted); font-style: italic; padding: 4px 0; }
.row-card {
  border: 1px solid var(--z-line);
  border-radius: 6px;
  padding: 10px 12px 8px;
  background: var(--z-surface);
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 8px;
}
.row-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: -2px; }
.row-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--z-teal-soft); color: var(--z-teal);
  font-size: 12px; font-weight: 700;
}
.del-btn { color: var(--z-danger) !important; padding: 0 4px !important; height: 20px !important; font-size: 13px !important; }
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 8px; }
.field { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 1; }
.field.f-narrow { flex: 0 0 90px; min-width: 0; }
.field-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--z-ink-2);
}
</style>
