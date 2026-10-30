<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { backFrom } from '@/router/backFrom'
import ContractCard from './ContractCard.vue'

// Страница контракта: клиент — /contracts/:contractId (свой), сотрудник — /clients/:id/contracts/:contractId
// (менять — с import40.read, как реестр документов; без него — просмотр).
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()
const isClient = computed(() => auth.role === 'client')
const clientId = computed(() => (isClient.value ? auth.userId ?? '' : String(route.params.id ?? '')))
const contractId = computed(() => String(route.params.contractId ?? ''))
// Пришли из заявки/поставки или ДТ (?from=…) — «Назад» туда (30.10.2026, аудит S-6/C-15). Иначе клиенту — список,
// сотруднику — вкладка «Контракты» карточки клиента; без clients.read карточка закрыта — «Назад» по истории.
const from = computed(() => backFrom(route.query.from, isClient.value, t))
const backTo = computed(() => from.value?.to ?? (isClient.value
  ? '/contracts'
  : auth.hasPermission('clients.read') ? `/clients/${encodeURIComponent(clientId.value)}?tab=contracts` : null))
const readonly = computed(() => !isClient.value && !auth.hasPermission('import40.read'))
</script>

<template>
  <ContractCard
    v-if="clientId && contractId"
    :client-id="clientId"
    :contract-id="contractId"
    :back-to="backTo"
    :back-label="from?.label"
    :readonly="readonly"
    :dt-links="!isClient && auth.hasPermission('import40.read')"
  />
</template>
