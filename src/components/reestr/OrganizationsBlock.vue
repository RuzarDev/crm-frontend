<!-- crm-frontend/src/components/reestr/OrganizationsBlock.vue -->
<!-- КЕДЕН-транзит §2 Организации (декларант/отправитель/получатель), повтор. -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="organizations" :header="t('transit.kedenTranzitHdr', { title: t('transit.organizacii'), n: items.length })">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">{{ t('transit.organizaciya') }}</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">{{ t('transit.netOrganizaciy') }}</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <div class="row-top">
            <span class="row-num">{{ idx + 1 }}</span>
            <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)" :title="$t('common.delete')" :aria-label="$t('common.delete')"><CloseOutlined /></a-button>
          </div>
          <div class="field-row">
            <div class="field">
              <div class="field-label">{{ t('transit.rol') }}</div>
              <a-select v-model:value="item.role" size="small" :disabled="readonly"
                style="width: 100%" :options="roleOptions" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">{{ t('transit.tipLica') }}</div>
              <a-select v-model:value="item.subjectType" size="small" :disabled="readonly"
                allow-clear style="width: 100%" :options="subjectTypeOptions" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">{{ t('transit.binIin') }}</div>
              <a-input v-model:value="item.bin" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">{{ t('transit.naimenovanie') }}</div>
              <a-input v-model:value="item.name" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">{{ t('transit.kratkoeNaimenovanie') }}</div>
              <a-input v-model:value="item.shortName" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">{{ t('transit.adres') }}</div>
              <a-input v-model:value="item.address" size="small" :disabled="readonly" :placeholder="t('transit.stranaRegionGorodUlica')" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">{{ t('transit.telefon') }}</div>
              <a-input v-model:value="item.phone" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Email</div>
              <a-input v-model:value="item.email" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
        </div>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrOrganizationInput } from '@/types/api'
import { ORGANIZATION_ROLE_OPTIONS, SUBJECT_TYPE_OPTIONS } from './reestrLocalOptions'

const { t } = useI18n()

const props = defineProps<{
  modelValue: ReestrOrganizationInput[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReestrOrganizationInput[]): void
}>()

const roleOptions = ORGANIZATION_ROLE_OPTIONS
const subjectTypeOptions = SUBJECT_TYPE_OPTIONS

const items = ref<ReestrOrganizationInput[]>([])

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
    role: t('transit.deklarant'),
    subjectType: null,
    bin: null,
    name: null,
    shortName: null,
    address: null,
    phone: null,
    email: null,
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
:not(#z) .del-btn { color: var(--z-danger); padding: 0 4px; height: 20px; font-size: 13px; }
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 8px; }
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 2; }
.field-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  color: var(--z-ink-2);
}
</style>
