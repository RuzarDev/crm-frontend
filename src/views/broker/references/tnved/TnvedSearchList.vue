<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { formatTnvedCode, type TnvedHit } from '@/views/references/tnvedShared'
import { percent } from './tnvedRules'

// Результаты слева: поиск по коду/названию или подбор по описанию (с вероятностью совпадения).
// Нажатие открывает код в карточке и на его месте в дереве.
defineProps<{
  hits: TnvedHit[]
  state: 'loading' | 'done' | 'error' | 'limit'
  source: 'search' | 'classify'
  selectedCode?: string | null
}>()
const emit = defineEmits<{ open: [hit: TnvedHit]; retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-0 flex-col" data-tnved-results>
    <div v-if="state === 'loading' && !hits.length" class="flex flex-col gap-3 p-3" aria-busy="true" data-results-skeleton>
      <div v-for="i in 5" :key="i" class="flex items-center gap-3">
        <ZSkeleton width="104px" height="14px" />
        <ZSkeleton :width="['60%', '48%', '66%', '40%', '54%'][i - 1]" height="14px" />
      </div>
    </div>
    <div v-else-if="state === 'error' || state === 'limit'" role="alert" class="flex flex-col items-start gap-2 px-3 py-4 text-sm text-ink-2" data-results-error>
      <span>{{ state === 'limit' ? t('broker.references.tnved.limit') : t('broker.references.tnved.loadError') }}</span>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-results-retry @click="emit('retry')">{{ t('broker.references.tnved.retry') }}</ZButton>
    </div>
    <div v-else-if="!hits.length" class="px-3 py-4" data-results-nothing>
      <p class="m-0 text-sm font-medium text-ink-2">{{ t('broker.references.tnved.nothing') }}</p>
      <p class="m-0 mt-0.5 text-[13px] text-ink-3">{{ t('broker.references.tnved.nothingHint') }}</p>
    </div>
    <template v-else>
      <p v-if="source === 'classify'" class="m-0 px-3 pt-2 pb-1 text-[13px] leading-5 text-ink-3" data-results-classified>{{ t('broker.references.tnved.classified') }}</p>
      <ul role="list" :class="['m-0 list-none p-1 transition-opacity duration-150 motion-reduce:transition-none', state === 'loading' && 'opacity-60']">
        <li v-for="h in hits" :key="h.code">
          <button
            type="button"
            :aria-current="h.code === selectedCode ? 'true' : undefined"
            :class="[
              'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-0.5 rounded-row border-0 bg-transparent px-2.5 py-2 text-left font-sans text-sm text-ink-2 outline-hidden max-sm:min-h-11',
              'transition-colors duration-150 ease-out hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none',
              h.code === selectedCode && 'bg-zircon-soft text-zircon-ink hover:bg-zircon-soft',
            ]"
            :data-result="h.code"
            @click="emit('open', h)"
          >
            <span class="font-mono font-semibold whitespace-nowrap text-ink tabular-nums">{{ formatTnvedCode(h.code) }}</span>
            <span class="min-w-0 line-clamp-2">{{ h.name }}</span>
            <span v-if="h.probability !== null || h.rateStr" class="col-start-2 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted">
              <span v-if="h.probability !== null" data-result-probability>{{ t('broker.references.tnved.probability', { n: percent(h.probability) }) }}</span>
              <span v-if="h.rateStr">{{ t('client.tnved.duty', { rate: h.rateStr }) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>
