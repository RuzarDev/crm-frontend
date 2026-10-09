<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import StatusDot from '@/components/broker/StatusDot.vue'
import { formatDateText } from '@/ui/date'
import { formatTnvedCode } from '@/views/references/tnvedShared'
import { changeText, typeKey, typeTone, type ChangeEntry } from './changes'

// Лента изменений: дата, тип точкой с подписью, текст из структурных полей, коды-ссылки на карточку в ТН ВЭД.
// Состояния (загрузка, ошибка, пусто) — на странице; здесь только список.
defineProps<{ entries: ChangeEntry[]; today: string }>()
const { t } = useI18n()
const tr = (key: string, named?: Record<string, unknown>) => t(key, named ?? {})

const codeLink = 'inline-flex min-h-7 items-center rounded-field font-mono text-[12.5px] tabular-nums text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <section class="overflow-hidden rounded-panel border border-line bg-surface" data-changes-feed :aria-label="t('broker.references.changes.listLabel')">
    <p class="m-0 px-[18px] py-3 text-[12.5px] text-muted">{{ t('broker.references.changes.hint') }}</p>
    <ul class="m-0 list-none p-0">
      <li
        v-for="e in entries"
        :key="e.key"
        class="grid gap-x-4 gap-y-1 border-t border-line px-[18px] py-3.5 sm:grid-cols-[110px_minmax(0,1fr)_auto]"
        data-change-row
        :data-kind="e.kind"
      >
        <time :datetime="e.date" class="text-[13px] font-medium tabular-nums text-ink-2" data-change-date>{{ formatDateText(e.date) }}</time>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusDot :tone="typeTone(e, today)" :label="t(`broker.references.changes.type.${typeKey(e, today)}`)" class="!text-[13px]" data-change-type />
            <span class="min-w-0 text-sm text-ink [overflow-wrap:anywhere]" data-change-text>{{ changeText(e, tr) }}</span>
          </div>
          <p v-if="e.kind === 'rate'" class="m-0 mt-1 text-[13px] text-ink-2" data-change-rate>
            {{ t('broker.references.changes.rateWas', { from: e.oldRate ?? '—', to: e.newRate ?? '—' }) }}
          </p>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5" data-change-codes>
            <RouterLink
              v-for="c in e.codes"
              :key="c"
              :to="{ path: '/tnved/tree', query: { code: c } }"
              :class="codeLink"
              :aria-label="t('broker.references.changes.openCode', { code: formatTnvedCode(c) })"
              data-change-code
            >{{ formatTnvedCode(c) }}</RouterLink>
            <span v-if="e.moreCodes > 0" class="text-[12.5px] text-muted" data-change-more>{{ t('broker.references.changes.more', { n: e.moreCodes }) }}</span>
          </div>
        </div>
        <p v-if="e.kind === 'rate'" class="m-0 text-[12.5px] text-muted sm:text-right">{{ t('broker.references.changes.source') }}</p>
      </li>
    </ul>
  </section>
</template>
