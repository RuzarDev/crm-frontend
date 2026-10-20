<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import CarrierCard from './CarrierCard.vue'

// Страница перевозчика: клиент — /carriers/:carrierId (свой), сотрудник — /clients/:id/carriers/:carrierId
// (менять — с import40.read, как контракты и реестр документов; без него — просмотр).
const route = useRoute()
const auth = useAuthStore()
const isClient = computed(() => auth.role === 'client')
const clientId = computed(() => (isClient.value ? auth.userId ?? '' : String(route.params.id ?? '')))
const carrierId = computed(() => String(route.params.carrierId ?? ''))
// Сотрудник без clients.read (пришёл из заявки) в карточку клиента не попадёт — «Назад» по истории.
const backTo = computed(() => (isClient.value
  ? '/carriers'
  : auth.hasPermission('clients.read') ? `/clients/${encodeURIComponent(clientId.value)}?tab=contracts` : null))
const readonly = computed(() => !isClient.value && !auth.hasPermission('import40.read'))
</script>

<template>
  <CarrierCard v-if="clientId && carrierId" :client-id="clientId" :carrier-id="carrierId" :back-to="backTo" :readonly="readonly" />
</template>
