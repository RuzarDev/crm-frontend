<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import ContractsPanel from '@/views/foreignContracts/ContractsPanel.vue'

// «Контракты» клиента (/contracts, 17.10): внешнеторговые контракты, остаток, оплаты поставщику, сроки валютного контроля.
const { t } = useI18n()
const auth = useAuthStore()
const href = (id: string) => `/contracts/${encodeURIComponent(id)}`
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-contracts>
    <div class="min-w-0">
      <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('foreignContracts.pageTitle') }}</h1>
      <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('foreignContracts.pageSubtitle') }}</p>
    </div>
    <ContractsPanel v-if="auth.userId" :client-id="auth.userId" :href="href" />
  </div>
</template>
