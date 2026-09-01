<template>
  <div class="dt-number-bar">
    <a-form-item label="Код поста" class="dt-number-bar-post">
      <a-select
        v-model:value="form.submissionCustomsOfficeCode"
        show-search
        allow-clear
        :options="props.postOptions"
        :filter-option="filterOption"
        placeholder="код/название поста"
        :disabled="readonly"
        style="width: 100%"
        @change="emitChange"
      />
    </a-form-item>
    <a-form-item label="Дата" class="dt-number-bar-date">
      <a-date-picker
        v-model:value="form.submissionDate"
        format="DD.MM.YYYY"
        value-format="YYYY-MM-DD"
        :disabled="readonly"
        style="width: 100%"
        @change="emitChange"
      />
    </a-form-item>
    <a-form-item label="Последние 7 цифр" class="dt-number-bar-tail">
      <a-input
        v-model:value="tail"
        :disabled="readonly"
        :maxlength="7"
        placeholder="0000000"
        @input="onTailInput"
      />
    </a-form-item>
    <a-button type="primary" :disabled="readonly" @click="register">Зарегистрировать</a-button>
    <div v-if="form.declarationNumber" class="dt-number-bar-result">{{ form.declarationNumber }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { message } from 'ant-design-vue'
import type { Import40DtFormState } from '@/api/import40'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  postOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  'update:modelValue': [Import40DtFormState]
  register: []
}>()

// Поле — плоские скаляры (код поста, дата, номер декларации), тот же
// простой reactive-спред, что и в остальных секциях без вложенных массивов.
const form = reactive({ ...props.modelValue })
watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const filterOption = (input: string, option: { label?: string }) =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })

// Дата по умолчанию — сегодня, если ещё не заполнена (влияет на расчёт
// платежей ниже по форме), но остаётся полностью редактируемой. Как и
// autocopy в DtSectionParties.vue (см. 384bb44), выставлять значение в
// локальный `form` без emitChange() недостаточно — dtForm родителя не
// узнает о значении до правки другого поля, и saveDt() уйдёт с null.
onMounted(() => {
  if (!form.submissionDate) {
    form.submissionDate = dayjs().format('YYYY-MM-DD')
    emitChange()
  }
})

// Последние 7 цифр номера ДТ вводятся отдельно от уже собранного
// declarationNumber — только цифры, до 7 символов. При открытии уже
// зарегистрированной ДТ разбираем хвост из «код/ддммгг/хвост» — иначе поле
// молча выглядело бы пустым, хотя номер уже есть.
const tail = ref('')
const parseTail = (num: string | null | undefined) => {
  const m = /\/(\d{7})$/.exec(num ?? '')
  return m ? m[1] : ''
}
watch(
  () => props.modelValue.declarationNumber,
  (v) => { tail.value = parseTail(v) },
  { immediate: true },
)
const onTailInput = (e: Event) => {
  const raw = (e.target as HTMLInputElement).value
  tail.value = raw.replace(/\D/g, '').slice(0, 7)
}

const register = () => {
  if (!form.submissionCustomsOfficeCode) {
    message.warning('Укажите код поста')
    return
  }
  if (!form.submissionDate) {
    message.warning('Укажите дату')
    return
  }
  if (tail.value.length !== 7) {
    message.warning('Введите ровно 7 цифр номера ДТ')
    return
  }
  const ddmmyy = dayjs(form.submissionDate).format('DDMMYY')
  form.declarationNumber = `${form.submissionCustomsOfficeCode}/${ddmmyy}/${tail.value}`
  emitChange()
  emit('register')
}
</script>

<style scoped>
.dt-number-bar {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border: 1px solid var(--atg-border, #e5e7eb);
  border-radius: 8px;
  margin-bottom: 16px;
}
.dt-number-bar-post {
  min-width: 220px;
  margin-bottom: 0;
}
.dt-number-bar-date {
  min-width: 160px;
  margin-bottom: 0;
}
.dt-number-bar-tail {
  min-width: 160px;
  margin-bottom: 0;
}
.dt-number-bar-result {
  font-weight: 600;
  align-self: center;
}
</style>
