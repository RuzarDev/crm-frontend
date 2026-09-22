<template>
  <div class="dt-section">
    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="1" :text="t('dt.tipDeklaracii')" /></template>
        <a-auto-complete v-model:value="form.declarationTypeCode" :options="classifiers.options('declaration-types')"
          :disabled="readonly" placeholder="ИМ" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="1" :text="t('dt.procedura')" /></template>
        <a-auto-complete v-model:value="form.procedureCode" :options="classifiers.options('customs-procedures')"
          :disabled="readonly" placeholder="40" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="1" :text="t('dt.priznak')" /></template>
        <a-input v-model:value="form.declarationFeatureCode" :disabled="readonly" placeholder="ЭД" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="3" :text="t('dt.listNomer')" /></template>
        <a-input-number v-model:value="form.sheetNumber" :disabled="readonly" style="width: 100%" :min="1" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="3" :text="t('dt.vsegoListov')" /></template>
        <a-input-number v-model:value="form.totalSheets" :disabled="readonly" style="width: 100%" :min="1" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="4" :text="t('dt.otgruzochnyeSpecifikacii')" /></template>
        <a-input-number v-model:value="form.shippingSpecSheets" :disabled="readonly" style="width: 100%" :min="0" @change="emitChange" />
      </a-form-item>
    </div>

    <div class="dt-grid-3">
      <a-form-item>
        <template #label><DtGraphLabel graph="7" :text="t('dt.osobennostiDeklarirovaniya')" /></template>
        <a-auto-complete v-model:value="form.referenceNumber" :options="classifiers.options('declaring-features')"
          :disabled="readonly" :placeholder="t('dt.ptdNtdPdt')" style="width: 100%" @change="emitChange" />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="5" :text="t('dt.vsegoTovarov')" /></template>
        <a-input :value="totals.goods" disabled />
      </a-form-item>
      <a-form-item>
        <template #label><DtGraphLabel graph="6" :text="t('dt.vsegoMest')" /></template>
        <a-input :value="totals.places" disabled />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { reactive, watch } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40DtFormState
  readonly: boolean
  totals: { goods: number; places: number; customsValue: number }
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

const classifiers = useClassifiersStore()
const form = reactive({ ...props.modelValue })

watch(() => props.modelValue, (v) => Object.assign(form, v), { deep: true })

const emitChange = () => emit('update:modelValue', { ...props.modelValue, ...form })
</script>
