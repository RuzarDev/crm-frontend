<!-- crm-frontend/src/components/reestr/OrganizationsBlock.vue -->
<!-- КЕДЕН-транзит §2 Организации (декларант/отправитель/получатель), повтор. -->
<template>
  <div class="reestr-block">
    <a-collapse ghost>
      <a-collapse-panel key="organizations" :header="`КЕДЕН-транзит: Организации (${items.length})`">
        <template #extra>
          <a-button v-if="!readonly" type="dashed" size="small" @click.stop="addItem">+ Организация</a-button>
        </template>

        <div v-if="items.length === 0" class="empty-state">Нет организаций</div>

        <div v-for="(item, idx) in items" :key="idx" class="row-card">
          <div class="row-top">
            <span class="row-num">{{ idx + 1 }}</span>
            <a-button v-if="!readonly" type="text" danger size="small" class="del-btn" @click="removeItem(idx)"><CloseOutlined /></a-button>
          </div>
          <div class="field-row">
            <div class="field">
              <div class="field-label">Роль</div>
              <a-select v-model:value="item.role" size="small" :disabled="readonly"
                style="width: 100%" :options="roleOptions" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Тип лица</div>
              <a-select v-model:value="item.subjectType" size="small" :disabled="readonly"
                allow-clear style="width: 100%" :options="subjectTypeOptions" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">БИН/ИИН</div>
              <a-input v-model:value="item.bin" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">Наименование</div>
              <a-input v-model:value="item.name" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Краткое наименование</div>
              <a-input v-model:value="item.shortName" size="small" :disabled="readonly" placeholder="—" @change="emitChange" />
            </div>
          </div>
          <div class="field-row">
            <div class="field f-grow">
              <div class="field-label">Адрес</div>
              <a-input v-model:value="item.address" size="small" :disabled="readonly" placeholder="Страна, регион, город, улица, дом" @change="emitChange" />
            </div>
            <div class="field">
              <div class="field-label">Телефон</div>
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
import { ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { ReestrOrganizationInput } from '@/types/api'
import { ORGANIZATION_ROLE_OPTIONS, SUBJECT_TYPE_OPTIONS } from './reestrLocalOptions'

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
    role: 'Декларант',
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
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 8px; }
.field { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.field.f-grow { flex: 2; }
.field-label {
  font-size: 10px; font-weight: 600; color: var(--atg-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>
