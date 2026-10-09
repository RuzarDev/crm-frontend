<script setup lang="ts">
// Временный мост волны 6а: старые разделы ДТ, что ещё остались («Товары» и ДТС, AntD), внутри новой страницы DtPage —
// вертикальные подписи и «только просмотр» им даёт a-form, как в прежнем Import40DtView. Удаляется вместе с ними (6б/6в).
defineProps<{ disabled: boolean }>()
</script>

<template>
  <a-form layout="vertical" :disabled="disabled">
    <slot />
  </a-form>
</template>
