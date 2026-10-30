<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HomePanel from '@/views/home/HomePanel.vue'
import { expeditorImport40Api } from '@/api/expeditorImport40'
import { useBlock } from '@/views/home/useBlock'
import { isFinished } from './expeditorImport40'

// Главная экспедитора (30.10.2026, аудит C-35): кроме транзита — сводка «Импорт 40 ваших клиентов» со ссылкой
// на экран логиста. Те же данные, что на самом экране (только чтение).
const { t } = useI18n()
const block = useBlock(true, () => expeditorImport40Api.overview())
void block.load()

const active = computed(() => (block.data?.shipments ?? []).filter((s) => !isFinished(s.status)))
const customs = computed(() => active.value.filter((s) => s.customsRequestOpen).length)
const clients = computed(() => block.data?.clients.length ?? 0)
</script>

<template>
  <HomePanel
    :title="t('expeditor40.title')"
    link-to="/expeditor/import-40"
    :link-label="t('expeditor40.home.open')"
    :loading="block.loading"
    :error="block.error"
    data-home-expeditor40
    @retry="block.load()"
  >
    <dl v-if="block.data" class="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
      <dt class="text-ink-2">{{ t('expeditor40.home.active') }}</dt>
      <dd class="m-0 text-right font-semibold tabular-nums" data-home-expeditor40-active>{{ active.length }}</dd>
      <template v-if="customs">
        <dt class="text-ink-2">{{ t('expeditor40.customsWaiting') }}</dt>
        <dd class="m-0 text-right font-semibold tabular-nums text-tone-danger-fg" data-home-expeditor40-customs>{{ customs }}</dd>
      </template>
      <dt class="text-ink-2">{{ t('expeditor40.home.clients') }}</dt>
      <dd class="m-0 text-right font-semibold tabular-nums" data-home-expeditor40-clients>{{ clients }}</dd>
    </dl>
  </HomePanel>
</template>
