<script setup lang="ts">
// Временный мост волны 6а: старые разделы ДТ (AntD a-form-item) внутри новой страницы DtPage — вертикальные подписи
// и «только просмотр» им даёт a-form, как в прежнем Import40DtView. Удаляется вместе со старыми разделами (Task 8).
defineProps<{ disabled: boolean }>()
</script>

<template>
  <a-form layout="vertical" :disabled="disabled">
    <slot />
  </a-form>
</template>
