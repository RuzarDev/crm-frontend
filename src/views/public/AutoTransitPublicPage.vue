<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Заготовка страницы получателя «Авто-транзита» (задача 7): открывается по ссылке /t/:token без входа, сама страница — задача 11.
const { t } = useI18n()
</script>

<template>
  <h1 class="text-xl font-semibold">{{ t('broker.autoTransit.public.title') }}</h1>
</template>
