<!-- Таблица платформы: стандарты в одном месте — 25 строк на страницу (без переключателя, страница
     скрыта, если всё помещается), карточки вместо горизонтальной прокрутки на телефоне, общее пустое
     состояние (renderEmpty в App.vue). Все атрибуты и слоты a-table проходят насквозь, поэтому при
     смене UI-библиотеки меняется только этот файл. -->
<template>
  <a-table
    v-bind="$attrs"
    :pagination="mergedPagination"
    :class="['z-table', { 'crm-table-cards': cards }]"
  >
    <template v-for="(_, name) in $slots" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
  </a-table>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** false — без пагинации; объект — свои настройки поверх стандартных. */
  pagination?: false | Record<string, unknown>
  /** Строки-карточки на телефоне (по умолчанию да). */
  cards?: boolean
}>(), { pagination: () => ({}), cards: true })

const mergedPagination = computed(() =>
  props.pagination === false
    ? false
    : { pageSize: 25, showSizeChanger: false, hideOnSinglePage: true, ...props.pagination })
</script>
