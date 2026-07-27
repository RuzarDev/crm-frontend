<template>
  <div class="crm-page-header" :class="{ 'crm-page-header--stacked': stacked }">
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
  // Класть действия под заголовок, а не справа от него. Нужно там, где кнопок
  // столько, что в одну строку с заголовком они не помещаются (реестр).
  stacked?: boolean
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
  /* Приглушённый мелкий текст — как было у .case-meta до выноса в компонент:
     мета-строка не должна спорить с заголовком. Теги внутри задают свой
     размер сами, поэтому наследование их не задевает. */
  color: var(--atg-muted);
  font-size: 13px;
}

.crm-page-header--stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}
</style>
