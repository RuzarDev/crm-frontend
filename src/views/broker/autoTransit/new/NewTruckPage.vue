<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Заготовка страницы «Новая машина» (задача 7): маршрут уже есть, сама страница — задача 10.
const { t } = useI18n()
</script>

<template>
  <h1 class="text-xl font-semibold">{{ t('broker.autoTransit.new.title') }}</h1>
</template>
