<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TnvedEttRateDto } from '@/types/api'
import { ettSourceView } from './eec'

// Источник ставки ввозной пошлины ЕТТ (карточка кода ТН ВЭД, товар ДТ): откуда действующая ставка
// («ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028» или «КЕДЕН»), вторая ставка при расхождении («в КЕДЕН: 5%»),
// почему взята запасная ставка КЕДЕН и «проверить вручную». Нет ettRate (старый сервер) — ничего не рисует.
// hideSource — строка источника уже показана рядом со ставкой (таблица «Ставки» карточки кода).
const props = defineProps<{ ett?: TnvedEttRateDto | null; hideSource?: boolean }>()
const { t } = useI18n()
const view = computed(() => ettSourceView(props.ett, t))
</script>

<template>
  <div v-if="view && (!hideSource || view.other || view.fallback || view.uncertain)" class="flex flex-col gap-0.5 text-[13px] leading-5" data-ett-source>
    <span v-if="!hideSource" class="text-ink-2" data-ett-source-main>{{ view.source }}</span>
    <span v-if="view.other" :class="view.differs ? 'font-semibold text-tone-wait-fg' : 'text-muted'" data-ett-source-other>{{ view.other }}</span>
    <span v-if="view.fallback" class="text-ink-3" data-ett-source-fallback>{{ view.fallback }}</span>
    <span v-if="view.uncertain" class="text-tone-wait-fg" data-ett-source-uncertain>{{ view.uncertain }}</span>
  </div>
</template>
