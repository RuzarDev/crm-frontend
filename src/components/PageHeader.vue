<template>
  <div class="crm-page-header">
    <div>
      <div v-if="kicker" class="crm-page-kicker">{{ kicker }}</div>
      <h1 class="crm-page-title">{{ title }}</h1>
      <p v-if="subtitle" class="crm-page-subtitle">{{ subtitle }}</p>
      <div v-if="$slots.meta" class="crm-page-meta"><slot name="meta" /></div>
    </div>
    <div v-if="$slots.actions" class="crm-page-actions"><slot name="actions" /></div>
  </div>
</template>

<script setup lang="ts">
// Заголовок страницы CRM. Раньше эта разметка копировалась в каждый вью
// руками, и пять вью из 32 выложили её по-своему — компонент закрепляет
// уже принятую конвенцию классов crm-page-* из main.css.
defineProps<{
  kicker?: string
  title: string
  subtitle?: string
}>()
</script>

<style scoped>
/* Единственный стиль, которого не было в main.css: строка тегов и счётчиков
   под подзаголовком. Живёт здесь, а не в глобальном файле, потому что нужен
   только этому компоненту. */
.crm-page-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}
</style>
