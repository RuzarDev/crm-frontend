<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Заготовка списка машин «Авто-транзита» (задача 7): маршрут и меню уже есть, сам список — задача 8.
const { t } = useI18n()
</script>

<template>
  <h1 class="text-xl font-semibold">{{ t('broker.autoTransit.list.title') }}</h1>
</template>
