<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowSquareOut, PhMagnifyingGlass, PhSortAscending, PhSortDescending } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTable from '@/components/z/ZTable.vue'
import { tnvedApi } from '@/api/tnved'
import { useAuthStore } from '@/stores/auth'
import type { TnvedRegulationDto } from '@/types/api'
import type { ZColumn } from '@/ui/table'
import { useBlock } from '@/views/home/useBlock'
import { isRateLimited } from '@/views/references/tnvedShared'
import {
  filterRegulations, regulationRows, sortRegulations, type RegulationOrder, type RegulationRow,
} from '@/views/references/regulations'

// «Нормативные акты» (редизайн, волна 5а): один экран для сотрудника и клиента (нижняя навигация клиента ведёт сюда же).
// Номер документа — ссылка в новой вкладке; поиск по номеру и дате; порядок по дате (сначала новые).
// Чтение tnved/* — 60 в минуту: на 429 — «попробуйте через минуту» на месте, без тоста.
const { t, locale } = useI18n()
const auth = useAuthStore()

const limited = ref(false)
const block = useBlock<TnvedRegulationDto[]>(true, async () => {
  limited.value = false
  try {
    const { data } = await tnvedApi.regulations({ silent: true })
    return Array.isArray(data) ? data : []
  } catch (e) {
    limited.value = isRateLimited(e)
    throw e
  }
})
void block.load()

// ---- Поиск и порядок ----
const q = ref('')
const order = ref<RegulationOrder>('newest')
const rows = computed(() => regulationRows(block.data, locale.value))
const items = computed(() => sortRegulations(filterRegulations(rows.value, q.value), order.value))
const page = ref(1)
watch([q, order], () => { page.value = 1 })
const toggleOrder = () => { order.value = order.value === 'newest' ? 'oldest' : 'newest' }
const orderLabel = computed(() => t(order.value === 'newest' ? 'broker.references.regulations.sortNewest' : 'broker.references.regulations.sortOldest'))

// ---- Таблица ----
const columns = computed<ZColumn<RegulationRow>[]>(() => [
  { key: 'number', title: t('broker.references.regulations.col.number') },
  { key: 'date', title: t('broker.references.regulations.col.date'), width: 150 },
])
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.references.regulations.range', { from, to, total }),
}))
const rowKey = (r: RegulationRow) => String(r.id)
const customRow = (r: RegulationRow) => ({ 'data-regulation-row': r.id })
</script>

<template>
  <div class="flex flex-col gap-5" data-regulations-page>
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-0">
        <h1 :class="['m-0 font-semibold text-ink', auth.isClient ? 'text-[26px] leading-8 tracking-[-0.02em]' : 'text-[22px] leading-7 tracking-[-0.015em]']">
          {{ t('broker.references.regulations.title') }}
        </h1>
        <p :class="['m-0 mt-1 text-ink-3', auth.isClient ? 'text-base sm:text-[15px]' : 'text-sm text-muted']">{{ t('broker.references.regulations.subtitle') }}</p>
      </div>
      <div class="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <ZInput
          v-model:value="q"
          type="search"
          allow-clear
          autocomplete="off"
          :placeholder="t('broker.references.regulations.search')"
          :aria-label="t('broker.references.regulations.searchLabel')"
          class="w-full max-sm:h-11 max-sm:text-base sm:w-[280px]"
          data-regulations-search
        >
          <template #prefix><PhMagnifyingGlass :size="16" class="text-ink-3" aria-hidden="true" /></template>
        </ZInput>
        <ZButton
          class="max-sm:h-11 max-sm:w-full"
          :aria-label="t('broker.references.regulations.sortLabel') + ': ' + orderLabel"
          data-regulations-sort
          :data-order="order"
          @click="toggleOrder"
        >
          <template #icon>
            <PhSortDescending v-if="order === 'newest'" :size="15" aria-hidden="true" />
            <PhSortAscending v-else :size="15" aria-hidden="true" />
          </template>
          {{ orderLabel }}
        </ZButton>
      </div>
    </div>

    <section :aria-label="t('broker.references.regulations.title')" :aria-busy="block.loading || undefined">
      <div v-if="block.error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-regulations-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ limited ? t('broker.references.regulations.limit') : t('broker.references.regulations.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-regulations-retry @click="block.load()">{{ t('broker.references.regulations.retry') }}</ZButton>
      </div>
      <div v-else-if="!block.loading && !rows.length" class="rounded-panel border border-dashed border-line-strong" data-regulations-empty>
        <ZEmpty :title="t('broker.references.regulations.empty')" :hint="t('broker.references.regulations.emptyHint')" />
      </div>
      <div v-else-if="!block.loading && !items.length" class="rounded-panel border border-dashed border-line-strong" data-regulations-nothing>
        <ZEmpty :title="t('broker.references.regulations.nothing', { q: q.trim() })" :hint="t('broker.references.regulations.nothingHint')" />
      </div>
      <ZTable
        v-else
        :columns="columns"
        :data-source="items"
        :row-key="rowKey"
        :custom-row="customRow"
        :loading="block.loading"
        :pagination="pagination"
        :aria-label="t('broker.references.regulations.title')"
        data-regulations-table
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'number'">
            <a
              v-if="record.url"
              :href="record.url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('broker.references.regulations.openDoc', { number: record.number })"
              class="inline-flex min-h-8 items-center gap-1.5 rounded-field font-medium text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
              data-regulation-link
            >{{ record.number }}<PhArrowSquareOut :size="13" aria-hidden="true" class="shrink-0" /></a>
            <span v-else class="font-medium text-ink">{{ record.number }}</span>
          </template>
          <template v-else-if="column.key === 'date'">
            <span class="tabular-nums" :class="record.dateText ? 'text-ink-2' : 'text-muted'" data-regulation-date>{{ record.dateText || t('broker.references.regulations.noDate') }}</span>
          </template>
        </template>
      </ZTable>
    </section>
  </div>
</template>
