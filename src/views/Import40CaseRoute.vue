<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

// /import-40/:id: карточка поставки. Клиентская карточка (ClientShipmentView) придёт в задаче 6 волны 2a —
// до неё и клиент, и сотрудник видят прежнюю Import40CaseView.
const Import40CaseView = defineAsyncComponent(() => import('@/views/Import40CaseView.vue'))
</script>

<template>
  <Import40CaseView />
</template>
