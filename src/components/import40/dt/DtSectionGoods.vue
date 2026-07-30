<template>
  <div class="dt-section">
    <div class="dt-section-bar"><DtGraphLabel graph="31–47" text="Товары" /></div>
    <ReestrGoodsSection v-model="items" :readonly="readonly" />
    <Import40GoodsKedenPanel v-model="items" :readonly="readonly" @calc-tpin="emit('calc-tpin')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import ReestrGoodsSection from '@/components/ReestrGoodsSection.vue'
import Import40GoodsKedenPanel from '@/components/Import40GoodsKedenPanel.vue'
import type { Import40GoodsItemInput } from '@/types/api'
import './dt-sections.css'

const props = defineProps<{ modelValue: Import40GoodsItemInput[]; readonly: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [Import40GoodsItemInput[]]; 'calc-tpin': [] }>()

// Тонкая обёртка: сами товарные поля живут в ReestrGoodsSection/Import40GoodsKedenPanel,
// поэтому здесь достаточно get/set-computed без локальной копии/watch (в отличие
// от DtSectionParties/Transport) — дочерние компоненты уже делают собственные копии.
const items = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>
