<template>
  <a-form layout="vertical">
    <a-space direction="vertical" style="width: 100%" :size="16">
      <a-alert
        v-if="!readonly"
        message="Поля записи"
        description="Состав полей фиксированный."
        type="info"
        show-icon
      />

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

      <div v-for="(_value, key) in formState.fields" :key="key" class="field-row">
        <a-row :gutter="10" align="middle">
          <a-col :span="8">
            <div class="field-label">{{ key }}</div>
          </a-col>
          <a-col :span="14">
            <a-input
              v-model:value="formState.fields[key]"
              placeholder="Значение"
              size="small"
              :disabled="readonly"
            />
          </a-col>
          <a-col :span="2" />
        </a-row>
      </div>
    </a-space>
  </a-form>
</template>

<script setup lang="ts">
import type { ReestrEntryStatus } from '@/types/api'

interface FormState {
  fields: Record<string, string | null>
  status: ReestrEntryStatus
  clientId?: string
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
.field-row {
  padding: 6px 8px;
  background: #fafafa;
  border-radius: 4px;
  margin-bottom: 6px;
}

.field-label {
  font-size: 12px;
  line-height: 1.2;
  color: #595959;
  word-break: break-word;
}
</style>
