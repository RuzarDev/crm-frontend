<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import CarriersPanel from '@/views/carriers/CarriersPanel.vue'

// «Перевозчики» клиента (/carriers, очередь 4): перевозчики, договоры перевозки и счета за фрахт.
const { t } = useI18n()
const auth = useAuthStore()
const href = (id: string) => `/carriers/${encodeURIComponent(id)}`
</script>

<template>
  <div class="flex flex-col gap-[22px]" data-client-carriers>
    <div class="min-w-0">
      <h1 class="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{{ t('carriers.pageTitle') }}</h1>
      <p class="m-0 mt-1 text-base text-ink-3 sm:text-[15px]">{{ t('carriers.pageSubtitle') }}</p>
    </div>
    <CarriersPanel v-if="auth.userId" :client-id="auth.userId" :href="href" />
  </div>
</template>
