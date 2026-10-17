<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ContractCard from './ContractCard.vue'

// Страница контракта: клиент — /contracts/:contractId (свой), сотрудник — /clients/:id/contracts/:contractId
// (менять — с import40.read, как реестр документов; без него — просмотр).
const route = useRoute()
const auth = useAuthStore()
const isClient = computed(() => auth.role === 'client')
const clientId = computed(() => (isClient.value ? auth.userId ?? '' : String(route.params.id ?? '')))
const contractId = computed(() => String(route.params.contractId ?? ''))
const backTo = computed(() => (isClient.value ? '/contracts' : `/clients/${encodeURIComponent(clientId.value)}?tab=contracts`))
const readonly = computed(() => !isClient.value && !auth.hasPermission('import40.read'))
</script>

<template>
  <ContractCard
    v-if="clientId && contractId"
    :client-id="clientId"
    :contract-id="contractId"
    :back-to="backTo"
    :readonly="readonly"
    :dt-links="!isClient && auth.hasPermission('import40.read')"
  />
</template>
