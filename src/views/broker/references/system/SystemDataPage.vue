<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { referencesApi } from '@/api/references'
import { katoApi } from '@/api/kato'
import { prohibitionCodesApi } from '@/api/prohibitionCodes'
import { troisApi } from '@/api/trois'
import { tnvedApi } from '@/api/tnved'
import { warehouseNsiApi, warehouseRegistryApi } from '@/api/warehouseRegistry'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/ui/cn'
import type { ClassifierGroup } from '@/types/api'
import ClassifierList from './ClassifierList.vue'
import RefList from './RefList.vue'
import RegistryPanel from './RegistryPanel.vue'
import TnvedSyncPanel from './TnvedSyncPanel.vue'
import {
  CLS_PREFIX, REF_KINDS, REGISTRY_KINDS, SYNC_ITEM, classifierOf, classifierTitle, formatCount, formatDayMonth, isRefKind, isRegistryKind,
  parseItem, type RefKind, type RegistryKind, type SystemItem,
} from './systemData'

// «Данные системы» (редизайн, волна 5а, доска SystemData) — /references (администратор) и /tnved/sync (tnved.manage).
// Слева группы: «Основные» (станции, посты), «Классификаторы ЕЭК», «Реестры», «ТН ВЭД» (синхронизация) со счётчиками;
// справа — выбранный пункт (?item= в адресе; на /tnved/sync — синхронизация). Сотрудник с tnved.manage без роли
// администратора видит только синхронизацию. Счётчики грузятся параллельно и тихо: ошибка — «—» с подсказкой, а не 0.
// На телефоне меню — горизонтальная лента.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const admin = computed(() => (auth.role || '').trim().toLowerCase() === 'administrator')
const canSync = computed(() => auth.hasPermission('tnved.manage'))
const access = computed(() => ({ admin: admin.value, sync: canSync.value }))

const defaultItem = computed<SystemItem | null>(() => (admin.value ? 'stations' : canSync.value ? SYNC_ITEM : null))
const active = computed<SystemItem | null>(() => {
  if (route.path === '/tnved/sync') return canSync.value ? SYNC_ITEM : null
  return parseItem(route.query.item, access.value) ?? defaultItem.value
})
const activeClassifier = computed(() => (active.value ? classifierOf(active.value) : null))
const activeRef = computed<RefKind | null>(() => (active.value && isRefKind(active.value) ? active.value : null))
const activeRegistry = computed<RegistryKind | null>(() => (active.value && isRegistryKind(active.value) ? active.value : null))

const select = (item: SystemItem) => {
  if (item === active.value) return
  void router.replace({ path: '/references', query: { item } })
}

// ---- Счётчики ----
type CounterKey = RefKind | RegistryKind | typeof SYNC_ITEM
interface Counter { state: 'loading' | 'ready' | 'error'; value: number | string | null }
const counters = reactive<Partial<Record<CounterKey, Counter>>>({})
const COUNTERS: Record<CounterKey, () => Promise<number | string | null>> = {
  stations: async () => (await referencesApi.listStations({ silent: true })).length,
  posts: async () => (await referencesApi.listCustomsPosts({ silent: true })).length,
  gr33: async () => (await prohibitionCodesApi.list()).length,
  kato: async () => (await katoApi.status({ silent: true })).total,
  warehouses: async () => (await warehouseRegistryApi.status({ silent: true })).kinds.reduce((s, k) => s + k.total, 0),
  nsi: async () => (await warehouseNsiApi.status({ silent: true })).kinds.reduce((s, k) => s + k.total, 0),
  trois: async () => (await troisApi.status({ silent: true })).active,
  [SYNC_ITEM]: async () => {
    const { data } = await tnvedApi.syncHistory({ silent: true })
    return Array.isArray(data) && data.length ? data[0].startedAtUtc : null
  },
}
const seqs: Partial<Record<CounterKey, number>> = {}
const loadCounter = async (key: CounterKey) => {
  const my = (seqs[key] = (seqs[key] ?? 0) + 1)
  if (!counters[key] || counters[key]!.state === 'error') counters[key] = { state: 'loading', value: null }
  try {
    const value = await COUNTERS[key]()
    if (my === seqs[key]) counters[key] = { state: 'ready', value }
  } catch {
    if (my === seqs[key]) counters[key] = { state: 'error', value: null }
  }
}
const setCounter = (key: CounterKey, value: number | string | null) => {
  seqs[key] = (seqs[key] ?? 0) + 1
  counters[key] = { state: 'ready', value }
}

// Классификаторы ЕЭК: список пунктов и их счётчики — один запрос.
const groups = shallowRef<ClassifierGroup[]>([])
const groupsState = ref<'loading' | 'ready' | 'error'>('loading')
let groupsSeq = 0
const loadGroups = async () => {
  const my = ++groupsSeq
  if (groupsState.value === 'error') groupsState.value = 'loading'
  try {
    const data = await referencesApi.listClassifierGroups({ silent: true })
    if (my !== groupsSeq) return
    groups.value = data
    groupsState.value = 'ready'
  } catch {
    if (my === groupsSeq) groupsState.value = 'error'
  }
}

onMounted(() => {
  // Счётчик открытого справочника / синхронизации присылает сам раздел — второй запрос не нужен.
  const own = active.value && (isRefKind(active.value) || active.value === SYNC_ITEM) ? active.value : null
  if (admin.value) {
    void loadGroups()
    for (const k of [...REF_KINDS, ...REGISTRY_KINDS]) if (k !== own) void loadCounter(k)
  }
  if (canSync.value && own !== SYNC_ITEM) void loadCounter(SYNC_ITEM)
})

const counterText = (key: CounterKey): string | null => {
  const c = counters[key]
  if (!c || c.state !== 'ready') return c?.state === 'error' ? '—' : null
  if (key === SYNC_ITEM) return c.value ? formatDayMonth(String(c.value), locale.value) : '—'
  return typeof c.value === 'number' ? formatCount(c.value, locale.value) : null
}

// ---- Меню ----
interface NavItem { key: SystemItem; title: string; count: string | null; countError: boolean; countLoading: boolean }
const item = (key: SystemItem, title: string, counterKey: CounterKey | null, groupCount?: number): NavItem => {
  if (counterKey) {
    const c = counters[counterKey]
    return { key, title, count: counterText(counterKey), countError: c?.state === 'error', countLoading: !c || c.state === 'loading' }
  }
  return { key, title, count: groupCount == null ? null : formatCount(groupCount, locale.value), countError: false, countLoading: false }
}
const tr = (k: string) => t(k)
const nav = computed(() => {
  const list: { key: string; title: string; items: NavItem[]; state?: 'loading' | 'ready' | 'error' }[] = []
  if (admin.value) {
    list.push({ key: 'base', title: t('broker.references.system.group.base'), items: REF_KINDS.map((k) => item(k, t(`broker.references.system.item.${k}`), k)) })
    list.push({
      key: 'eec',
      title: t('broker.references.system.group.eec'),
      state: groupsState.value,
      items: groups.value.map((g) => item(`${CLS_PREFIX}${g.classifierCode}`, classifierTitle(g.classifierCode, tr), null, g.count)),
    })
    list.push({ key: 'registries', title: t('broker.references.system.group.registries'), items: REGISTRY_KINDS.map((k) => item(k, t(`broker.references.system.item.${k}`), k)) })
  }
  if (canSync.value) list.push({ key: 'tnved', title: t('broker.references.system.group.tnved'), items: [item(SYNC_ITEM, t('broker.references.system.item.tnvedSync'), SYNC_ITEM)] })
  return list
})

// На телефоне лента: выбранный пункт — в зону видимости.
const navRef = ref<HTMLElement | null>(null)
const revealActive = async () => {
  await nextTick()
  if (!window.matchMedia?.('(max-width: 1023px)').matches) return
  navRef.value?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
onMounted(revealActive)
watch(active, revealActive)
watch(() => groups.value.length, revealActive)

const itemClass = (on: boolean) => cn(
  'flex h-8 w-full min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-row border-0 px-2.5 text-left font-sans text-[13px] outline-hidden',
  'focus-visible:shadow-focus transition-colors duration-150 motion-reduce:transition-none',
  'max-lg:h-11 max-lg:w-auto max-lg:rounded-pill max-lg:border max-lg:border-line max-lg:px-3.5 max-lg:text-sm max-lg:whitespace-nowrap',
  on ? 'bg-sunken font-semibold text-ink max-lg:border-line-strong' : 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink max-lg:bg-surface',
)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5" data-system-page>
    <div>
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.references.system.title') }}</h1>
      <p class="m-0 mt-1 text-sm text-muted">{{ t('broker.references.system.subtitle') }}</p>
    </div>

    <div v-if="!nav.length" class="rounded-panel border border-dashed border-line-strong" data-system-no-access>
      <ZEmpty :title="t('broker.references.system.noAccess')" />
    </div>
    <div v-else class="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
      <nav
        :aria-label="t('broker.references.system.menuLabel')"
        class="min-w-0 overflow-x-clip lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto"
        data-system-nav
      >
        <div ref="navRef" class="flex min-w-0 gap-1.5 max-lg:overflow-x-auto max-lg:pb-1 lg:flex-col lg:gap-0.5">
          <div v-for="g in nav" :key="g.key" class="flex gap-1.5 max-lg:contents lg:flex-col lg:gap-px" :data-nav-group="g.key">
            <div class="px-2.5 pt-3 pb-1 text-xs font-medium text-ink-3 first:pt-0 max-lg:hidden">{{ g.title }}</div>
            <template v-if="g.state === 'loading' && !g.items.length">
              <div class="px-2.5 py-1 max-lg:hidden" data-nav-groups-loading><ZSkeleton :lines="3" height="16px" /></div>
            </template>
            <div v-else-if="g.state === 'error' && !g.items.length" class="flex shrink-0 flex-wrap items-center gap-2 px-2.5 py-1 text-xs text-ink-3" data-nav-groups-error>
              <span class="max-lg:hidden">{{ t('broker.references.system.groupsError') }}</span>
              <ZButton size="sm" variant="ghost" class="max-lg:h-11" data-nav-groups-retry @click="loadGroups">{{ t('broker.references.system.groupsRetry') }}</ZButton>
            </div>
            <button
              v-for="it in g.items"
              :key="it.key"
              type="button"
              :class="itemClass(it.key === active)"
              :aria-current="it.key === active ? 'page' : undefined"
              :data-nav-item="it.key"
              @click="select(it.key)"
            >
              <span class="min-w-0 flex-1 truncate" :title="it.title">{{ it.title }}</span>
              <span
                v-if="it.countError"
                class="shrink-0 text-xs text-muted"
                :title="t('broker.references.system.counterError')"
                data-nav-count="error"
              >—<span class="sr-only"> {{ t('broker.references.system.counterError') }}</span></span>
              <span v-else-if="it.count !== null" class="shrink-0 text-xs tabular-nums text-muted" data-nav-count>{{ it.count }}</span>
            </button>
          </div>
        </div>
      </nav>

      <div class="min-w-0" data-system-content>
        <RefList v-if="activeRef" :kind="activeRef" :can-edit="admin" @count="setCounter(activeRef, $event)" />
        <ClassifierList v-else-if="activeClassifier" :code="activeClassifier" :can-edit="admin" @changed="loadGroups" />
        <RegistryPanel v-else-if="activeRegistry" :kind="activeRegistry" :can-edit="admin" @changed="(ks) => ks.forEach((k) => loadCounter(k))" />
        <TnvedSyncPanel v-else-if="active === SYNC_ITEM" @last="setCounter(SYNC_ITEM, $event)" />
      </div>
    </div>
  </div>
</template>
