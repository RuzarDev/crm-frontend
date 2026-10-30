<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { backFrom } from '@/router/backFrom'
import CarrierCard from './CarrierCard.vue'

// Страница перевозчика: клиент — /carriers/:carrierId (свой), сотрудник — /clients/:id/carriers/:carrierId
// (менять — с import40.read, как контракты и реестр документов; без него — просмотр).
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()
const isClient = computed(() => auth.role === 'client')
const clientId = computed(() => (isClient.value ? auth.userId ?? '' : String(route.params.id ?? '')))
const carrierId = computed(() => String(route.params.carrierId ?? ''))
// Пришли из заявки/поставки (?from=…) — «Назад» туда (30.10.2026, аудит S-6/C-15). Иначе клиенту — список,
// сотруднику — вкладка «Контракты» карточки клиента; без clients.read карточка закрыта — «Назад» по истории.
const from = computed(() => backFrom(route.query.from, isClient.value, t))
const backTo = computed(() => from.value?.to ?? (isClient.value
  ? '/carriers'
  : auth.hasPermission('clients.read') ? `/clients/${encodeURIComponent(clientId.value)}?tab=contracts` : null))
const readonly = computed(() => !isClient.value && !auth.hasPermission('import40.read'))
</script>

<template>
  <CarrierCard v-if="clientId && carrierId" :client-id="clientId" :carrier-id="carrierId" :back-to="backTo" :back-label="from?.label" :readonly="readonly" />
</template>
