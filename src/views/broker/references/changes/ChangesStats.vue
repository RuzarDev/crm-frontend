<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZCollapse from '@/components/z/ZCollapse.vue'
import ZCollapseItem from '@/components/z/ZCollapseItem.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPanel from '@/components/z/ZPanel.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { tnvedApi } from '@/api/tnved'
import type { TnvedTopCodeDto, TnvedVtoSectionDto } from '@/types/api'
import { useBlock } from '@/views/home/useBlock'
import { cleanName, formatTnvedCode, isRateLimited } from '@/views/references/tnvedShared'

// «Статистика» (только сотрудникам с правом, у клиента сервер отвечает 403): топ кодов по записям транзита и разделы ВТО.
// Блоки грузятся независимо: ошибка одного не трогает другой; 429 — «попробуйте через минуту» на месте, без тоста.
const { t } = useI18n()

const topLimited = ref(false)
const vtoLimited = ref(false)
const top = useBlock<TnvedTopCodeDto[]>(true, async () => {
  topLimited.value = false
  try {
    const { data } = await tnvedApi.topCodes(20, { silent: true })
    return Array.isArray(data) ? data : []
  } catch (e) {
    topLimited.value = isRateLimited(e)
    throw e
  }
})
const vto = useBlock<TnvedVtoSectionDto[]>(true, async () => {
  vtoLimited.value = false
  try {
    const { data } = await tnvedApi.vtoSections({ silent: true })
    return Array.isArray(data) ? data : []
  } catch (e) {
    vtoLimited.value = isRateLimited(e)
    throw e
  }
})
void top.load()
void vto.load()

const open = ref<string[]>([])
const sectionKey = (name: string, i: number) => `${i}:${name}`

const codeLink = 'inline-flex min-h-7 shrink-0 items-center rounded-field font-mono text-[12.5px] tabular-nums text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11'
const treeTo = (code: string) => ({ path: '/tnved/tree', query: { code } })
</script>

<template>
  <div class="grid items-start gap-[18px] lg:grid-cols-2" data-changes-stats>
    <!-- Топ кодов -->
    <ZPanel :title="t('broker.references.changes.stat.topTitle')" padding="none" :aria-busy="top.loading || undefined" data-stats-top>
      <p class="m-0 border-b border-line px-4 py-2.5 text-[12.5px] text-muted" data-stats-top-hint>{{ t('broker.references.changes.stat.topHint') }}</p>
      <div v-if="top.error" role="alert" class="flex flex-wrap items-center gap-3 px-4 py-4" data-stats-top-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ topLimited ? t('broker.references.changes.limit') : t('broker.references.changes.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-stats-top-retry @click="top.load()">{{ t('broker.references.changes.retry') }}</ZButton>
      </div>
      <div v-else-if="top.loading && !top.data" class="px-4 py-4"><ZSkeleton :lines="5" height="18px" /></div>
      <ZEmpty v-else-if="!top.data?.length" :title="t('broker.references.changes.stat.topEmpty')" data-stats-top-empty />
      <ol v-else class="m-0 list-none p-0">
        <li
          v-for="(item, i) in top.data"
          :key="item.code"
          class="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
          data-top-row
          :data-code="item.code"
        >
          <span class="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted" :aria-label="t('broker.references.changes.stat.rank', { n: i + 1 })">{{ i + 1 }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <RouterLink :to="treeTo(item.code)" :class="codeLink" data-top-code>{{ formatTnvedCode(item.code) }}</RouterLink>
              <ZTag v-if="item.rateStr" tone="wait" size="sm">{{ item.rateStr }}</ZTag>
            </div>
            <p v-if="cleanName(item.treeName)" class="m-0 truncate text-[13px] text-muted">{{ cleanName(item.treeName) }}</p>
          </div>
          <span class="shrink-0 text-[13px] tabular-nums text-ink-2" data-top-count>{{ t('broker.references.changes.stat.topCount', { n: item.declarationCount }) }}</span>
        </li>
      </ol>
    </ZPanel>

    <!-- Разделы ВТО -->
    <ZPanel :title="t('broker.references.changes.stat.vtoTitle')" padding="none" :aria-busy="vto.loading || undefined" data-stats-vto>
      <div v-if="vto.error" role="alert" class="flex flex-wrap items-center gap-3 px-4 py-4" data-stats-vto-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ vtoLimited ? t('broker.references.changes.limit') : t('broker.references.changes.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-stats-vto-retry @click="vto.load()">{{ t('broker.references.changes.retry') }}</ZButton>
      </div>
      <div v-else-if="vto.loading && !vto.data" class="px-4 py-4"><ZSkeleton :lines="5" height="18px" /></div>
      <ZEmpty v-else-if="!vto.data?.length" :title="t('broker.references.changes.stat.vtoEmpty')" data-stats-vto-empty />
      <ZCollapse v-else v-model:active-key="open" class="px-4">
        <ZCollapseItem
          v-for="(s, i) in vto.data"
          :key="sectionKey(s.name, i)"
          :value="sectionKey(s.name, i)"
          :header="s.name"
          data-vto-section
        >
          <template #extra>
            <ZTag tone="info" size="sm">{{ t('broker.references.changes.stat.vtoCodes', { n: s.totalCodes }) }}</ZTag>
          </template>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="g in s.groups" :key="g.code" class="flex items-start gap-3" data-vto-group>
              <RouterLink :to="treeTo(g.code)" :class="codeLink" data-vto-code>{{ formatTnvedCode(g.code) }}</RouterLink>
              <span class="min-w-0 pt-1 text-[13px] leading-snug text-ink max-sm:pt-3">{{ g.hint }}</span>
            </li>
          </ul>
        </ZCollapseItem>
      </ZCollapse>
    </ZPanel>
  </div>
</template>
