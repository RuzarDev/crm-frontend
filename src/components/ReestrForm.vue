<template>
  <a-modal
    :open="open"
    :title="isEdit ? 'Изменить запись' : 'Создать запись'"
    ok-text="Сохранить"
    cancel-text="Отмена"
    :confirm-loading="loading"
    @ok="handleSubmit"
    @cancel="handleCancel"
    width="800px"
  >
    <a-form :model="formState" layout="vertical">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-alert
          message="Поля записи"
          description="Состав полей фиксированный."
          type="info"
          show-icon
        />

        <a-form-item label="Статус">
          <a-select
            v-model:value="formState.status"
            :options="reestrStatusOptions"
            placeholder="Статус"
            style="width: 100%"
            :disabled="isEdit && !canPickStatusInForm"
          />
        </a-form-item>

        <div v-for="(value, key) in formState.fields" :key="key" class="field-row">
          <a-row :gutter="10" align="middle">
            <a-col :span="8">
              <div class="field-label">{{ key }}</div>
            </a-col>
            <a-col :span="14">
              <a-input
                v-model:value="formState.fields[key]"
                placeholder="Значение"
                size="small"
              />
            </a-col>
            <a-col :span="2" />
          </a-row>
        </div>
      </a-space>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { ReestrEntry, ReestrEntryStatus } from '@/types/api'
import { REESTR_COLUMN_KEYS } from '@/types/api'
import { ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { formatReestrDateForForm, normalizeReestrFieldsForSubmit } from '@/utils/reestrFormat'
import { REESTR_STATUS_OPTIONS } from '@/utils/reestrDtoMap'
import { message } from 'ant-design-vue'

interface Props {
  open: boolean
  loading: boolean
  entry?: ReestrEntry | null
}

interface Emits {
  (e: 'submit', payload: { data: Record<string, string | null>; status: ReestrEntryStatus }): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const authStore = useAuthStore()

const reestrStatusOptions = REESTR_STATUS_OPTIONS

const isEdit = computed(() => !!props.entry)

const canPickStatusInForm = computed(
  () => !isEdit.value || authStore.hasPermission('status.change'),
)

const formState = reactive<{
  fields: Record<string, string | null>
  status: ReestrEntryStatus
}>({
  fields: {},
  status: ReestrEntryStatusValues.Release,
})

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      const nextFields: Record<string, string | null> = {}
      for (const key of REESTR_COLUMN_KEYS) {
        const raw = props.entry?.data[key] ?? null
        nextFields[key] = key === 'Дата' ? formatReestrDateForForm(raw) : raw
      }
      formState.fields = nextFields
      formState.status = props.entry?.status ?? ReestrEntryStatusValues.Release
    }
  },
)

const handleSubmit = () => {
  const hasAnyValue = Object.values(formState.fields).some((value) => Boolean(value && String(value).trim()))
  if (!hasAnyValue) {
    message.error('Заполните хотя бы одно поле')
    return
  }

  emit('submit', {
    data: normalizeReestrFieldsForSubmit(formState.fields),
    status: canPickStatusInForm.value ? formState.status : (props.entry?.status ?? ReestrEntryStatusValues.Release),
  })
}

const handleCancel = () => {
  emit('cancel')
}
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
