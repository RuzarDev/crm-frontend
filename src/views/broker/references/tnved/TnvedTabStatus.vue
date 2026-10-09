<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import type { LoadStatus } from './tnvedRules'

// Ошибка загрузки вкладки карточки кода: лимит запросов (429) — «подождите минуту», иначе «Не удалось загрузить»;
// в обоих случаях «Повторить» (ошибки не кэшируются).
defineProps<{ status: LoadStatus }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div role="alert" class="flex flex-wrap items-center gap-3 rounded-row bg-canvas px-4 py-3" data-tab-error>
    <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">
      {{ status === 'limit' ? t('broker.references.tnved.limit') : t('broker.references.tnved.loadError') }}
    </p>
    <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-tab-retry @click="emit('retry')">{{ t('broker.references.tnved.retry') }}</ZButton>
  </div>
</template>
