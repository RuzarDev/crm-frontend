<template>
  <div class="dt-section">
    <div class="dt-section-bar"><DtGraphLabel graph="40" text="Общая декларация / предшествующий документ" /></div>
    <DtPrevDocsSection v-model="prevDocs" :readonly="readonly" />

    <div class="dt-section-bar"><DtGraphLabel graph="44" text="Дополнительная информация / представленные документы" /></div>
    <ReestrDoc44Section v-model="doc44" :readonly="readonly" extended :goods-options="goodsOptions" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import DtPrevDocsSection from './DtPrevDocsSection.vue'
import ReestrDoc44Section from '@/components/ReestrDoc44Section.vue'
import type { Import40DtFormState } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{ modelValue: Import40DtFormState; readonly: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [Import40DtFormState] }>()

// Обёртка над двумя массивами (гр.40 prevDocItems, гр.44 doc44Items), поэтому
// сами дочерние компоненты (DtPrevDocsSection/ReestrDoc44Section) держат
// собственные копии со своей глубокой копией — здесь достаточно точечных
// get/set-computed по образцу DtSectionGoods.
const prevDocs = computed({
  get: () => props.modelValue.prevDocItems ?? [],
  set: (v) => emit('update:modelValue', { ...props.modelValue, prevDocItems: v }),
})

const doc44 = computed({
  get: () => props.modelValue.doc44Items ?? [],
  set: (v) => emit('update:modelValue', { ...props.modelValue, doc44Items: v }),
})

const goodsOptions = computed(() =>
  (props.modelValue.goodsItems ?? []).map((g, i) => ({
    value: i,
    label: `Товар ${i + 1}: ${g.tnvedCode || g.description || ''}`,
  })),
)
</script>
