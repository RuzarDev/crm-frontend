<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue'
import { cn } from '@/ui/cn'
import { DEFAULT_PAGE_SIZE, pageCount, pageItems } from '@/ui/table'

// Замена a-pagination: «‹ 1 2 3 4 5 … 9 ›». v-model:current (без него листается сама), change(page, pageSize).
// Переключателя размера страницы нет — стандарт платформы 25 строк.
const props = withDefaults(defineProps<{ current?: number; total: number; pageSize?: number; disabled?: boolean }>(), {
  current: undefined,
  pageSize: DEFAULT_PAGE_SIZE,
})
const emit = defineEmits<{ 'update:current': [page: number]; change: [page: number, pageSize: number] }>()
const { t } = useI18n()

const inner = ref(props.current ?? 1)
watch(() => props.current, (v) => { if (v !== undefined) inner.value = v })

const count = computed(() => Math.max(1, pageCount(props.total, props.pageSize)))
const page = computed(() => Math.min(Math.max(1, props.current ?? inner.value), count.value))
const items = computed(() => pageItems(page.value, count.value))

const go = (p: number) => {
  if (props.disabled || p < 1 || p > count.value || p === page.value) return
  inner.value = p
  emit('update:current', p)
  emit('change', p, props.pageSize)
}

const base = cn(
  'inline-flex h-8 min-w-8 items-center justify-center rounded-field border-0 px-2 text-sm tabular-nums select-none',
  'outline-hidden focus-visible:shadow-focus transition-colors duration-150 ease-out motion-reduce:transition-none',
)
const pageClass = (p: number) => cn(
  base,
  p === page.value
    ? 'bg-zircon-soft font-semibold text-zircon-ink cursor-default'
    : 'bg-transparent text-ink-2 cursor-pointer enabled:hover:bg-sunken enabled:hover:text-ink',
  'disabled:cursor-not-allowed disabled:opacity-45',
)
const arrowClass = cn(
  base,
  'bg-transparent text-ink-2 cursor-pointer enabled:hover:bg-sunken enabled:hover:text-ink disabled:cursor-not-allowed disabled:text-faint',
)
</script>

<template>
  <nav :aria-label="t('z.pagination')">
    <ul class="m-0 flex list-none flex-wrap items-center gap-1 p-0">
      <li>
        <button type="button" :class="arrowClass" :aria-label="t('z.prevPage')" :disabled="disabled || page <= 1" @click="go(page - 1)">
          <PhCaretLeft :size="14" aria-hidden="true" />
        </button>
      </li>
      <li v-for="(item, i) in items" :key="item === '…' ? `gap-${i}` : item">
        <span v-if="item === '…'" aria-hidden="true" class="inline-flex h-8 min-w-6 items-center justify-center text-sm text-ink-3">…</span>
        <button
          v-else
          type="button"
          :class="pageClass(item)"
          :aria-label="t('z.pageN', { n: item })"
          :aria-current="item === page ? 'page' : undefined"
          :disabled="disabled"
          @click="go(item)"
        >{{ item }}</button>
      </li>
      <li>
        <button type="button" :class="arrowClass" :aria-label="t('z.nextPage')" :disabled="disabled || page >= count" @click="go(page + 1)">
          <PhCaretRight :size="14" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </nav>
</template>
