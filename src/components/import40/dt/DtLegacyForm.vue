<script setup lang="ts">
// Временный мост волны 6а: старый раздел ДТ, что ещё остался (ДТС, AntD), внутри новой страницы DtPage — вертикальные
// подписи и «только просмотр» ему даёт a-form, как в прежнем Import40DtView. Удаляется вместе с ним (6в).
defineProps<{ disabled: boolean }>()
</script>

<template>
  <a-form layout="vertical" :disabled="disabled">
    <slot />
  </a-form>
</template>
