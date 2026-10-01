<!-- Полоса фильтров над таблицей: поиск и фильтры слева, действия (Excel, сброс) — в слоте end справа.
     Раскладка и поведение на телефоне — классы .crm-filter-bar в main.css. -->
<template>
  <div class="crm-filter-bar z-filter-bar">
    <slot />
    <div v-if="$slots.end" class="crm-filter-bar-end"><slot name="end" /></div>
  </div>
</template>

<style scoped>
.z-filter-bar { margin-bottom: 14px; }
</style>
