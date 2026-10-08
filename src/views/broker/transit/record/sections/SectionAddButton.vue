<script setup lang="ts">
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'

// «Добавить …» в действиях раздела (контурная кнопка, как «Добавить товар» на доске TransitRecord).
defineProps<{ label: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <ZButton class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11" data-section-add @click="$emit('click')">
    <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
    {{ label }}
  </ZButton>
</template>
