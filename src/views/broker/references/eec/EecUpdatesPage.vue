<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTabs from '@/components/z/ZTabs.vue'
import { tnvedEecApi, type EecSyncStatus } from '@/api/tnvedEec'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import EecDecisionsTab from './EecDecisionsTab.vue'
import EecDiscrepanciesTab from './EecDiscrepanciesTab.vue'
import EecEditionsTab from './EecEditionsTab.vue'
import EecSyncPanel from './EecSyncPanel.vue'
import EecTreeAbsentTab from './EecTreeAbsentTab.vue'
import { EEC_TABS, P, parseTab, runActive, type EecTab } from './eec'
import { useEecSync } from './useEecSync'

// «Справочники → ТН ВЭД → Обновления ЕЭК» (право tnved.manage): ставки ЕТТ и дерево кодов из PDF ЕЭК.
// Сверху — последняя проверка сайта ЕЭК и «Обновить из ЕЭК» (прогон идёт на сервере, статус опрашивается).
// Вкладки (?tab=): редакции, даты решений, расхождения с КЕДЕН, коды дерева, которых нет в ЕЭК.
// Вкладки живут в KeepAlive: возврат не перезапрашивает отчёт; после прогона все перечитываются (version).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()

const version = ref(0)
const onFinished = (s: EecSyncStatus) => {
  version.value += 1
  void loadPendingCount()
  const r = s.run
  if (!r) return
  if (r.status === 'completed') {
    message.success(t(`${P}.run.done`, { applied: r.editionsApplied, held: r.editionsHeld }))
  } else {
    message.warning(t(`${P}.run.endedWith`, { status: t(`${P}.run.status.${r.status}`) }))
  }
}
const sync = useEecSync(onFinished)
onMounted(() => { void sync.load() })
const active = computed(() => runActive(sync.status))

const runSync = async () => {
  const ok = await confirm({ title: t(`${P}.run.confirmTitle`), content: t(`${P}.run.confirmText`), okText: t(`${P}.run.confirmOk`) })
  if (ok) await sync.start()
}

// Счётчик решений без даты — на вкладке (сама вкладка грузится при открытии).
const pendingDecisions = ref<number | undefined>(undefined)
const loadPendingCount = async () => {
  try {
    const { data } = await tnvedEecApi.decisions(true)
    pendingDecisions.value = Array.isArray(data) ? data.length : undefined
  } catch { /* счётчик не обязателен */ }
}
onMounted(() => { void loadPendingCount() })

const tab = computed<EecTab>(() => parseTab(route.query.tab))
const tabItems = computed(() => EEC_TABS.map((k) => ({
  key: k,
  label: t(`${P}.tabs.${k}`),
  count: k === 'decisions' && pendingDecisions.value ? pendingDecisions.value : undefined,
})))
const onTab = (k: string) => {
  const query = { ...route.query }
  if (k === 'editions') delete query.tab
  else query.tab = k
  void router.replace({ query })
}
</script>

<template>
  <div class="flex flex-col gap-5" data-eec-page>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t(`${P}.title`) }}</h1>
        <p class="m-0 mt-1 text-sm text-muted text-pretty">{{ t(`${P}.subtitle`) }}</p>
      </div>
      <ZButton
        variant="primary"
        :loading="sync.starting"
        :disabled="active"
        class="max-sm:h-11 max-sm:w-full"
        data-eec-run
        @click="runSync"
      >
        <template #icon><PhArrowsClockwise :size="15" aria-hidden="true" /></template>
        {{ t(`${P}.run.button`) }}
      </ZButton>
    </div>

    <EecSyncPanel
      :status="sync.status"
      :loading="sync.loading"
      :error="sync.error"
      :already-running="sync.alreadyRunning"
      @retry="sync.load()"
    />

    <ZTabs :active-key="tab" :items="tabItems" variant="line" data-eec-tabs @update:active-key="onTab" />

    <KeepAlive>
      <EecEditionsTab v-if="tab === 'editions'" :version="version" />
      <EecDecisionsTab v-else-if="tab === 'decisions'" :version="version" @count="pendingDecisions = $event" />
      <EecDiscrepanciesTab v-else-if="tab === 'discrepancies'" :version="version" />
      <EecTreeAbsentTab v-else-if="tab === 'absent'" :version="version" />
    </KeepAlive>
  </div>
</template>
