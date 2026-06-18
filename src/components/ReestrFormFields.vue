<template>
  <a-form layout="vertical">
    <div class="form-fields-wrap">
      <a-form-item v-if="!readonly && !isEdit && clientOptions?.length" label="Клиент">
        <a-select
          v-model:value="formState.clientId"
          :options="clientOptions"
          placeholder="Выберите клиента"
          style="width: 100%"
        />
      </a-form-item>

      <a-form-item label="Статус">
        <a-select
          v-model:value="formState.status"
          :options="statusOptions"
          placeholder="Статус"
          style="width: 100%"
          :disabled="readonly || (isEdit && !canPickStatus)"
        />
      </a-form-item>

      <div class="fields-grid">
        <div
          v-for="(_value, key) in formState.fields"
          :key="key"
          class="field-row"
        >
          <div class="field-label">{{ key }}</div>
          <a-input
            v-model:value="formState.fields[key]"
            placeholder="—"
            size="small"
            :disabled="readonly"
          />
        </div>
      </div>

      <!-- ЖДН section -->
      <div class="subsection-title">ЖД накладная</div>
      <div class="fields-grid">
        <div class="field-row">
          <div class="field-label">№ Пломбы</div>
          <a-input
            v-model:value="formState.sealNumber"
            placeholder="—"
            size="small"
            :disabled="readonly"
          />
        </div>
        <div class="field-row">
          <div class="field-label">Вид упаковки</div>
          <a-input
            v-model:value="formState.packagingType"
            placeholder="—"
            size="small"
            :disabled="readonly"
          />
        </div>
      </div>

      <!-- Товары section -->
      <div class="subsection-title">Товары</div>
      <ReestrGoodsSection v-model="formState.goods" :readonly="readonly" />

      <!-- 44 графа section -->
      <div class="subsection-title">44 Графа ТД</div>
      <ReestrDoc44Section v-model="formState.doc44" :readonly="readonly" />
    </div>
  </a-form>
</template>

<script setup lang="ts">
import type { ReestrEntryStatus, ReestrGoodsItemInput, ReestrDoc44ItemInput } from '@/types/api'
import ReestrGoodsSection from '@/components/ReestrGoodsSection.vue'
import ReestrDoc44Section from '@/components/ReestrDoc44Section.vue'

interface FormState {
  fields: Record<string, string | null>
  status: ReestrEntryStatus
  clientId?: string
  sealNumber: string | null
  packagingType: string | null
  goods: ReestrGoodsItemInput[]
  doc44: ReestrDoc44ItemInput[]
}

defineProps<{
  formState: FormState
  isEdit: boolean
  readonly?: boolean
  clientOptions?: { value: string; label: string }[]
  canPickStatus: boolean
  statusOptions: { value: ReestrEntryStatus; label: string }[]
}>()
</script>

<style scoped>
.form-fields-wrap {
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subsection-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--atg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  background: var(--atg-bg);
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-sm);
  transition: border-color var(--atg-transition), background var(--atg-transition);
}

.field-row:focus-within {
  border-color: var(--atg-accent);
  background: #fffdf6;
}

.field-label {
  font-size: 11px;
  line-height: 1.2;
  color: var(--atg-muted);
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-row :deep(.ant-input-sm) {
  min-height: 28px;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  box-shadow: none !important;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--atg-text);
}

.field-row :deep(.ant-input-sm:focus) {
  box-shadow: none !important;
}

.field-row :deep(.ant-input-sm[disabled]) {
  background: transparent;
  color: var(--atg-text);
  cursor: default;
}
</style>
