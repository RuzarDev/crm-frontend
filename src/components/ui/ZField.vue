<!-- Поле формы на 12-колоночной сетке (.zf-grid): подпись (с номером графы ДТ при graph), сам элемент
     ввода в слоте по умолчанию, подсказка/ошибка под ним. Ширина — span из 12. -->
<template>
  <div :class="['zf-field', `zf-s${span}`]">
    <div class="zf-label" :title="title ?? label">
      <span v-if="graph" class="z-field-graph">{{ graphLabel }}</span>
      <slot name="label">{{ label }}</slot>
      <span v-if="required" class="z-field-req" aria-hidden="true">*</span>
    </div>
    <slot />
    <div v-if="error" class="z-field-error">{{ error }}</div>
    <div v-else-if="help" class="zf-help">{{ help }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  label?: string
  /** Номер графы ДТ: «31» → «Гр.31» перед подписью. */
  graph?: string | number
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12
  help?: string
  error?: string
  required?: boolean
  /** Всплывающий полный текст, если подпись обрезается. */
  title?: string
}>(), { span: 6 })

const { t } = useI18n()
const graphLabel = computed(() => t('common.graphShort', { n: props.graph }))
</script>

<style scoped>
.z-field-graph { color: var(--z-muted); margin-right: 6px; font-variant-numeric: tabular-nums; }
.z-field-req { color: var(--z-danger); margin-left: 3px; }
.z-field-error { font-size: 12px; color: var(--z-danger); }
</style>
