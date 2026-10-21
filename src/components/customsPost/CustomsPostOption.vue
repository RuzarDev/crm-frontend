<script setup lang="ts">
import { computed } from 'vue'
import type { ZOption } from '@/ui/options'

// Вариант поста в выпадающем списке (слот #option у ZSelect): код моноширинным и название, ниже приглушённо —
// вид транспорта и краткий адрес из КЕДЕН. Опция — из buildCustomsPostOptions; у чужой опции — просто подпись.
// Каждая строка обрезается отдельно: окно не шире поля на телефоне.
const props = defineProps<{ option: ZOption }>()
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const code = computed(() => str(props.option.code))
const title = computed(() => str(props.option.title) || props.option.label)
const hint = computed(() => str(props.option.hint))
</script>

<template>
  <span class="flex min-w-0 flex-col" data-post-option>
    <span class="truncate"><span v-if="code" class="font-mono font-medium tabular-nums" data-post-code>{{ code }}</span> {{ title }}</span>
    <span v-if="hint" class="truncate text-xs text-ink-3" data-post-hint>{{ hint }}</span>
  </span>
</template>
