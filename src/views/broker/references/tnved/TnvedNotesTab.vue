<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut } from '@phosphor-icons/vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import TnvedTabStatus from './TnvedTabStatus.vue'
import type { TnvedExplanationDto } from '@/types/api'
import { sanitizeHtml } from '@/ui/sanitizeHtml'
import { EEC_LINKS, formatUpdated, type Loaded } from './tnvedPage'

// Вкладка «Пояснения»: ссылки на пояснения и решения ЕЭК и текст пояснений к коду.
// HTML пояснений приходит из синхронизации как есть — показываем только очищенный (sanitizeHtml).
const props = defineProps<{ state?: Loaded<TnvedExplanationDto> }>()
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()

const html = computed(() => sanitizeHtml(props.state?.data?.htmlContent))
const updated = computed(() => formatUpdated(props.state?.data?.updatedAtUtc, locale.value))
</script>

<template>
  <div class="flex flex-col gap-4" data-tnved-notes>
    <nav :aria-label="t('broker.references.tnved.notes.links')">
      <ul role="list" class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13.5px]">
        <li v-for="l in EEC_LINKS" :key="l.url">
          <a
            :href="l.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-8 items-center gap-1 rounded-field text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
          >{{ t(l.key) }}<PhArrowSquareOut :size="13" aria-hidden="true" /></a>
        </li>
      </ul>
    </nav>

    <div v-if="!state || state.status === 'loading'" class="flex flex-col gap-2.5" aria-busy="true">
      <ZSkeleton v-for="i in 4" :key="i" height="14px" :width="['92%', '84%', '88%', '60%'][i - 1]" />
    </div>
    <p v-else-if="state.status === 'missing' || (state.status === 'done' && !html)" class="m-0 text-sm text-ink-3" data-notes-empty>
      {{ t('broker.references.tnved.notes.empty') }}
    </p>
    <TnvedTabStatus v-else-if="state.status !== 'done'" :status="state.status" @retry="emit('retry')" />
    <template v-else>
      <!-- eslint-disable-next-line vue/no-v-html -- очищено sanitizeHtml: белый список тегов, без скриптов и on* -->
      <div class="tnved-notes-html overflow-x-auto text-sm leading-6 text-ink" data-notes-html v-html="html" />
      <p v-if="updated" class="m-0 text-[13px] text-muted">{{ t('broker.references.tnved.notes.updated', { date: updated }) }}</p>
    </template>
  </div>
</template>

<style scoped>
/* Разметка пояснений — из чужого HTML: только базовая типографика и таблицы. */
.tnved-notes-html :deep(p) { margin: 0 0 8px; }
.tnved-notes-html :deep(ul),
.tnved-notes-html :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.tnved-notes-html :deep(table) { border-collapse: collapse; width: 100%; margin: 0 0 8px; font-size: 13px; }
.tnved-notes-html :deep(td),
.tnved-notes-html :deep(th) { border: 1px solid var(--color-line); padding: 4px 8px; vertical-align: top; }
.tnved-notes-html :deep(a) { color: var(--color-zircon-ink); text-underline-offset: 2px; }
</style>
