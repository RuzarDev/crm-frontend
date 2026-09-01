<template>
  <div class="dt-section">
    <div class="dt-section-bar"><DtGraphLabel graph="48" text="Отсрочка платежей" /></div>
    <div class="dt-grid-4">
      <a-form-item label="Вид документа">
        <a-input v-uppercase v-model:value="form.deferralDocType" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Номер">
        <a-input v-uppercase v-model:value="form.deferralNumber" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Дата">
        <a-date-picker v-model:value="form.deferralDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Срок">
        <a-date-picker v-model:value="form.deferralDueDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>

    <a-form-item>
      <template #label><DtGraphLabel graph="52" text="Гарантия недействительна для" /></template>
      <a-input v-uppercase v-model:value="form.guaranteeInvalidFor" :disabled="readonly" @change="emitChange" />
    </a-form-item>

    <div class="dt-section-bar"><DtGraphLabel graph="54" text="Место, дата, подписант" /></div>
    <div class="dt-grid-3">
      <a-form-item label="ФИО">
        <a-input v-uppercase v-model:value="form.signatoryFullName" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Должность">
        <a-input v-uppercase v-model:value="form.signatoryPosition" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Документ">
        <a-input v-uppercase v-model:value="form.signatoryDocument" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Телефон">
        <a-input v-model:value="form.signatoryPhone" :disabled="readonly" @change="emitChange" />
      </a-form-item>
      <a-form-item label="Дата подписания">
        <a-date-picker v-model:value="form.signedDate" format="DD.MM.YYYY" value-format="YYYY-MM-DD" :disabled="readonly" style="width: 100%" @change="emitChange" />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

// Все поля секции — плоские скаляры (гр.48/52/54, без вложенных массивов),
// поэтому используем тот же простой reactive-спред, что и DtSectionFinance.vue,
// а не буфер с ручным deep-copy как в Parties/Transport.
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })
</script>
