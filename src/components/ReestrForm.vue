<template>
  <a-modal
    :open="open"
    :title="isEdit ? 'Изменить запись' : 'Создать запись'"
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
import type { ReestrEntry } from '@/types/api'
import { message } from 'ant-design-vue'

const fixedFieldKeys = [
  '№',
  'Дата',
  'Контейнер',
  'Получатель',
  'Станция назначения',
  'Отправитель',
  'Отправка',
  'Груз',
  'Подкод',
  'Код ТНВЭД',
  'Количество мест',
  'Вес',
  'ТД',
  'Кол-во ТД',
  'Цена одной ТД, с НДС',
  'Количество доп.листов',
  'Цена одного доп.листа, с НДС',
  'Всего, ДЛ с НДС',
  'Итого, с НДС',
]

interface Props {
  open: boolean
  loading: boolean
  entry?: ReestrEntry | null
}

interface Emits {
  (e: 'submit', fields: Record<string, string | null>): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formState = reactive<{ fields: Record<string, string | null> }>({
  fields: {},
})

const isEdit = computed(() => !!props.entry)

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      const nextFields: Record<string, string | null> = {}
      for (const key of fixedFieldKeys) {
        nextFields[key] = props.entry?.fields[key] ?? null
      }
      formState.fields = nextFields
    }
  }
)

const handleSubmit = () => {
  const hasAnyValue = Object.values(formState.fields).some((value) => Boolean(value && String(value).trim()))
  if (!hasAnyValue) {
    message.error('Заполните хотя бы одно поле')
    return
  }

  emit('submit', formState.fields)
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
