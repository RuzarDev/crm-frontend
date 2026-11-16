<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Заготовка карточки машины «Авто-транзита» (задача 7): маршрут уже есть, сама карточка — задача 9.
const { t } = useI18n()
</script>

<template>
  <h1 class="text-xl font-semibold">{{ t('broker.autoTransit.truck.title') }}</h1>
</template>
