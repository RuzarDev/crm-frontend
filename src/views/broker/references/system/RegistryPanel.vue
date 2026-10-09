<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhMagnifyingGlass } from '@phosphor-icons/vue'
import StatStrip, { type StatItem } from '@/components/broker/StatStrip.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { katoApi, type KatoDto, type KatoStatus, type KatoSyncResult } from '@/api/kato'
import { prohibitionCodesApi, type ProhibitionCodeItem, type ProhibitionCodeUsage } from '@/api/prohibitionCodes'
import { troisApi, type TroisItem, type TroisStatus } from '@/api/trois'
import {
  kedenRegistriesApi, warehouseNsiApi, warehouseRegistryApi,
  type KedenRefreshResult, type WarehouseImportKindResult, type WarehouseKind, type WarehouseKindStatus, type WarehouseNsiImportKindResult,
} from '@/api/warehouseRegistry'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import { formatCount, formatDateTime, formatDay, latest, type RegistryKind } from './systemData'

// Реестры «Данных системы»: гр.33, КАТО, СВХ/ТС (реестр КГД), НСИ КГД, ТРОИС. Подписи кнопок говорят, куда идёт
// загрузка: «… (xlsx) в реестр КГД» ≠ «… (xlsx) в НСИ КГД». «Обновить из КЕДЕН» обновляет СВХ, таможенные склады
// и ТРОИС сразу. Долгие операции — загрузка на кнопке и «Это может занять до 5 минут». Итоги — тостами, как раньше.
// changed — какие счётчики меню перечитать.
const props = defineProps<{ kind: RegistryKind; canEdit: boolean }>()
const emit = defineEmits<{ changed: [kinds: RegistryKind[]] }>()
const { t, locale } = useI18n()
const P = 'broker.references.system.registry'

const num = (n: number | null | undefined) => (n == null ? '—' : formatCount(n, locale.value))
const when = (iso: string | null | undefined) => formatDateTime(iso, locale.value)

// ---- Статус выбранного реестра (тихо; ошибка — «Не удалось загрузить» с «Повторить») ----
type Status =
  | { kind: 'gr33'; refs: ProhibitionCodeItem[]; usage: ProhibitionCodeUsage[] }
  | { kind: 'kato'; status: KatoStatus }
  | { kind: 'warehouses' | 'nsi'; kinds: WarehouseKindStatus[] }
  | { kind: 'trois'; status: TroisStatus }
const status = shallowRef<Status | null>(null)
const q = ref('') // поиск по кодам гр.33
const loading = ref(true)
const error = ref(false)
let seq = 0
const fetchStatus = async (kind: RegistryKind): Promise<Status> => {
  switch (kind) {
    case 'gr33': {
      const [refs, usage] = await Promise.all([prohibitionCodesApi.list(), prohibitionCodesApi.kedenUsage().catch(() => [] as ProhibitionCodeUsage[])])
      return { kind, refs, usage }
    }
    case 'kato': return { kind, status: await katoApi.status({ silent: true }) }
    case 'warehouses': return { kind, kinds: (await warehouseRegistryApi.status({ silent: true })).kinds }
    case 'nsi': return { kind, kinds: (await warehouseNsiApi.status({ silent: true })).kinds }
    case 'trois': return { kind, status: await troisApi.status({ silent: true }) }
  }
}
const load = async () => {
  const kind = props.kind
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const s = await fetchStatus(kind)
    if (my === seq) status.value = s
  } catch {
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => props.kind, () => { status.value = null; q.value = ''; void load() }, { immediate: true })

const kindCount = (list: WarehouseKindStatus[], k: WarehouseKind) => list.find((x) => x.kind === k)?.total ?? 0
const stats = computed<StatItem[]>(() => {
  const s = status.value
  if (!s) return []
  switch (s.kind) {
    case 'gr33': return [
      { key: 'total', label: t(`${P}.gr33.total`), value: num(s.refs.length) },
      { key: 'missing', label: t(`${P}.gr33.missingCount`), value: num(gr33Missing.value.length), tone: gr33Missing.value.length ? 'gold' : null },
    ]
    case 'kato': return [
      { key: 'total', label: t(`${P}.kato.total`), value: num(s.status.total) },
      { key: 'updated', label: t(`${P}.updated`), value: when(s.status.updatedAtUtc) },
    ]
    case 'warehouses':
    case 'nsi': return [
      { key: 'svh', label: t(`${P}.kindSvh`), value: num(kindCount(s.kinds, 'svh')) },
      { key: 'ts', label: t(`${P}.kindTs`), value: num(kindCount(s.kinds, 'customs_warehouse')) },
      { key: 'updated', label: t(`${P}.updated`), value: when(latest(s.kinds.map((k) => k.importedAtUtc))) },
    ]
    case 'trois': return [
      { key: 'total', label: t(`${P}.trois.total`), value: num(s.status.total) },
      { key: 'active', label: t(`${P}.trois.active`), value: num(s.status.active) },
      { key: 'updated', label: t(`${P}.updated`), value: when(s.status.importedAtUtc) },
    ]
  }
  return []
})

// ---- Долгие операции ----
const busy = ref<string | null>(null)
const run = async (op: string, job: () => Promise<RegistryKind[]>) => {
  if (busy.value) return
  busy.value = op
  try {
    const changed = await job()
    emit('changed', changed)
    await load()
  } catch { /* текст ошибки показал общий перехватчик */ } finally {
    busy.value = null
  }
}
const kindLabel = (k: string) => (k === 'svh' ? t(`${P}.kindSvh`) : k === 'trois' ? t(`${P}.trois.short`) : t(`${P}.kindTs`))

// КАТО
const reportKato = (r: KatoSyncResult) => message.success(t(`${P}.kato.result`, { total: r.total, added: r.added, updated: r.updated, removed: r.removed }))
const syncKato = () => run('kato-sync', async () => { reportKato(await katoApi.sync()); return ['kato'] })
const uploadKato = (f: File) => run('kato-file', async () => { reportKato(await katoApi.import(f)); return ['kato'] })

// Реестр КГД (СВХ / ТС) и КЕДЕН
const reportWarehouses = (kinds: WarehouseImportKindResult[]) => {
  for (const k of kinds) {
    const kind = kindLabel(k.kind)
    if (k.error) message.warning(t(`${P}.importError`, { kind }))
    else if (k.removed) message.success(t(`${P}.kedenResult`, { registry: kind, total: k.total, added: k.added, updated: k.updated, removed: k.removed }))
    else message.success(t(`${P}.importResult`, { kind, total: k.total, added: k.added, updated: k.updated }))
  }
}
const reportKeden = (list: KedenRefreshResult[]) => {
  for (const r of list) {
    const registry = kindLabel(r.registry)
    if (r.error) message.warning(t(`${P}.kedenError`, { registry, error: r.error }))
    else message.success(t(`${P}.kedenResult`, { registry, total: r.total, added: r.added, updated: r.updated, removed: r.removed }))
  }
}
const refreshKeden = () => run('keden', async () => { reportKeden((await kedenRegistriesApi.refresh()).registries); return ['warehouses', 'trois'] })
const uploadWarehouse = (kind: WarehouseKind, f: File) =>
  run(`wh-${kind}`, async () => { reportWarehouses((await warehouseRegistryApi.importFile(kind, f)).kinds); return ['warehouses'] })

// НСИ КГД
const reportNsi = (kinds: WarehouseNsiImportKindResult[]) => {
  for (const k of kinds) {
    const kind = kindLabel(k.kind)
    if (k.error) message.warning(t(`${P}.importError`, { kind }))
    else message.success(t(`${P}.nsi.result`, { kind, total: k.total }))
  }
}
const importNsi = () => run('nsi', async () => { reportNsi((await warehouseNsiApi.importFromKgd()).kinds); return ['nsi'] })
const uploadNsi = (kind: WarehouseKind, f: File) =>
  run(`nsi-${kind}`, async () => { reportNsi((await warehouseNsiApi.importFile(kind, f)).kinds); return ['nsi'] })

// ТРОИС
const uploadTrois = (f: File) => run('trois-file', async () => {
  const r = await troisApi.importFile(f)
  message.success(t(`${P}.trois.result`, { total: r.total, added: r.added, updated: r.updated, removed: r.removed }))
  return ['trois']
})

const first = (files: File[]) => files[0]

// ---- Гр.33 ----
const gr33Missing = computed(() => (status.value?.kind === 'gr33' ? status.value.usage.filter((u) => !u.inReference) : []))
interface Gr33Row { code: string; name: string; measure: string; tnvedCount: number }
const gr33Rows = computed<Gr33Row[]>(() => {
  const s = status.value
  if (s?.kind !== 'gr33') return []
  const usage = new Map(s.usage.map((u) => [u.code, u.tnvedCount]))
  const rows = [
    ...s.refs.map((c) => ({ code: c.code, name: c.name, measure: `${c.categoryCode} — ${c.categoryName}`, tnvedCount: usage.get(c.code) ?? 0 })),
    ...gr33Missing.value.map((u) => ({ code: u.code, name: '', measure: '', tnvedCount: u.tnvedCount })),
  ].sort((a, b) => a.code.localeCompare(b.code))
  const term = q.value.trim().toLocaleLowerCase('ru')
  return term ? rows.filter((r) => `${r.code} ${r.name} ${r.measure}`.toLocaleLowerCase('ru').includes(term)) : rows
})
const gr33Columns = computed<ZColumn<Gr33Row>[]>(() => [
  { key: 'code', title: t(`${P}.gr33.colCode`), width: 100 },
  { key: 'name', title: t(`${P}.gr33.colName`) },
  { key: 'measure', dataIndex: 'measure', title: t(`${P}.gr33.colMeasure`), width: 260 },
  { key: 'keden', title: t(`${P}.gr33.colKeden`), width: 110, align: 'right' },
])

// ---- КАТО: проверка поиска (как в ДТ, гр. 8/9/14) ----
const probe = ref('')
const probeRows = shallowRef<KatoDto[]>([])
const probeState = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
let probeSeq = 0
let probeTimer: ReturnType<typeof setTimeout> | undefined
const searchKato = async (v: string) => {
  clearTimeout(probeTimer)
  const term = v.trim()
  const my = ++probeSeq
  if (term.length < 2) { probeRows.value = []; probeState.value = 'idle'; return }
  probeState.value = 'loading'
  try {
    const rows = await katoApi.search(term, 10, { silent: true })
    if (my !== probeSeq) return
    probeRows.value = rows
    probeState.value = 'done'
  } catch {
    if (my === probeSeq) probeState.value = 'error'
  }
}
const onProbe = (v: string) => {
  probe.value = v
  clearTimeout(probeTimer)
  probeTimer = setTimeout(() => { void searchKato(v) }, 350)
}

// ---- ТРОИС: проверка знака ----
const trois = ref('')
const troisRows = shallowRef<TroisItem[]>([])
const troisState = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
let troisSeq = 0
let troisTimer: ReturnType<typeof setTimeout> | undefined
const searchTrois = async (v: string) => {
  clearTimeout(troisTimer)
  const term = v.trim()
  const my = ++troisSeq
  if (!term) { troisRows.value = []; troisState.value = 'idle'; return }
  troisState.value = 'loading'
  try {
    const rows = await troisApi.search(term)
    if (my !== troisSeq) return
    troisRows.value = rows
    troisState.value = 'done'
  } catch {
    if (my === troisSeq) troisState.value = 'error'
  }
}
const onTrois = (v: string) => {
  trois.value = v
  clearTimeout(troisTimer)
  troisTimer = setTimeout(() => { void searchTrois(v) }, 350)
}
const troisColumns = computed<ZColumn<TroisItem>[]>(() => [
  { key: 'registrationNumber', dataIndex: 'registrationNumber', title: t(`${P}.trois.colNumber`), width: 150 },
  { key: 'objectName', title: t(`${P}.trois.colName`), width: 200 },
  { key: 'rightHolder', dataIndex: 'rightHolder', title: t(`${P}.trois.colHolder`), ellipsis: true },
  { key: 'validUntil', title: t(`${P}.trois.colUntil`), width: 120 },
  { key: 'status', title: t(`${P}.trois.colStatus`), width: 140 },
])
onBeforeUnmount(() => { clearTimeout(probeTimer); clearTimeout(troisTimer) })

const BTN = 'max-sm:h-11 max-sm:w-full'
// Кнопка загрузки — внутри ZUpload: длинная подпись переносится (не раздвигает страницу), на телефоне — во всю ширину и 44px.
const UPLOAD = 'max-w-full max-sm:w-full [&>button]:h-auto [&>button]:min-h-9 [&>button]:max-w-full [&>button]:py-1.5 [&>button]:whitespace-normal max-sm:[&>button]:min-h-11 max-sm:[&>button]:w-full'
const OUTLINE = 'border border-line-strong bg-surface'
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" :aria-labelledby="`sd-title-${kind}`" :data-registry="kind">
    <div class="min-w-0">
      <h2 :id="`sd-title-${kind}`" class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ t(`${P}.${kind}.title`) }}</h2>
      <p class="m-0 mt-1 text-sm text-ink-3">{{ t(`${P}.${kind}.sub`) }}</p>
    </div>

    <!-- Действия: куда идёт каждая загрузка — в подписи кнопки -->
    <div v-if="canEdit && kind !== 'gr33'" class="flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-4" data-registry-actions>
      <template v-if="kind === 'kato'">
        <div class="flex flex-wrap items-center gap-2">
          <ZButton variant="primary" :class="BTN" :loading="busy === 'kato-sync'" :disabled="!!busy && busy !== 'kato-sync'" data-kato-sync @click="syncKato">
            <template #icon><PhArrowsClockwise :size="15" aria-hidden="true" /></template>
            {{ t(`${P}.kato.sync`) }}
          </ZButton>
          <ZUpload accept=".xlsx" :loading="busy === 'kato-file'" :disabled="!!busy && busy !== 'kato-file'" :button-variant="'secondary'" :class="UPLOAD" data-kato-upload @select="uploadKato(first($event))">
            {{ t(`${P}.kato.upload`) }}
          </ZUpload>
        </div>
      </template>
      <template v-else-if="kind === 'warehouses'">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ZButton variant="primary" :class="BTN" :loading="busy === 'keden'" :disabled="!!busy && busy !== 'keden'" data-keden-refresh @click="refreshKeden">
            <template #icon><PhArrowsClockwise :size="15" aria-hidden="true" /></template>
            {{ t(`${P}.warehouses.keden`) }}
          </ZButton>
          <span class="text-sm text-ink-3" data-keden-caption>{{ t(`${P}.warehouses.kedenCaption`) }}</span>
        </div>
        <p class="m-0 text-xs text-muted">{{ t(`${P}.fallback`) }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <ZUpload accept=".xlsx" :loading="busy === 'wh-svh'" :disabled="!!busy && busy !== 'wh-svh'" :class="UPLOAD" data-wh-upload="svh" @select="uploadWarehouse('svh', first($event))">
            {{ t(`${P}.warehouses.uploadSvh`) }}
          </ZUpload>
          <ZUpload accept=".xlsx" :loading="busy === 'wh-customs_warehouse'" :disabled="!!busy && busy !== 'wh-customs_warehouse'" :class="UPLOAD" data-wh-upload="ts" @select="uploadWarehouse('customs_warehouse', first($event))">
            {{ t(`${P}.warehouses.uploadTs`) }}
          </ZUpload>
        </div>
      </template>
      <template v-else-if="kind === 'nsi'">
        <div class="flex flex-wrap items-center gap-2">
          <ZButton variant="primary" :class="BTN" :loading="busy === 'nsi'" :disabled="!!busy && busy !== 'nsi'" data-nsi-import @click="importNsi">
            <template #icon><PhArrowsClockwise :size="15" aria-hidden="true" /></template>
            {{ t(`${P}.nsi.import`) }}
          </ZButton>
        </div>
        <p class="m-0 text-xs text-muted">{{ t(`${P}.fallback`) }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <ZUpload accept=".xlsx" :loading="busy === 'nsi-svh'" :disabled="!!busy && busy !== 'nsi-svh'" :class="UPLOAD" data-nsi-upload="svh" @select="uploadNsi('svh', first($event))">
            {{ t(`${P}.nsi.uploadSvh`) }}
          </ZUpload>
          <ZUpload accept=".xlsx" :loading="busy === 'nsi-customs_warehouse'" :disabled="!!busy && busy !== 'nsi-customs_warehouse'" :class="UPLOAD" data-nsi-upload="ts" @select="uploadNsi('customs_warehouse', first($event))">
            {{ t(`${P}.nsi.uploadTs`) }}
          </ZUpload>
        </div>
      </template>
      <template v-else-if="kind === 'trois'">
        <div class="flex flex-wrap items-center gap-2">
          <ZUpload accept=".xlsx" :loading="busy === 'trois-file'" :disabled="!!busy && busy !== 'trois-file'" :class="UPLOAD" data-trois-upload @select="uploadTrois(first($event))">
            {{ t(`${P}.trois.upload`) }}
          </ZUpload>
        </div>
        <p class="m-0 text-xs text-muted">{{ t(`${P}.trois.kedenNote`) }}</p>
      </template>
      <p v-if="busy" class="m-0 text-sm text-ink-2" role="status" data-registry-long>{{ t(`${P}.long`) }}</p>
    </div>

    <!-- Состояние реестра -->
    <div v-if="error && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-registry-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.references.system.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-registry-retry @click="load">{{ t('broker.references.system.retry') }}</ZButton>
    </div>
    <div v-else-if="loading && !status" class="rounded-panel border border-line bg-surface px-5 py-5" data-registry-loading>
      <ZSkeleton :lines="3" height="18px" />
    </div>
    <template v-else-if="status">
      <StatStrip :items="stats" data-registry-stats />

      <!-- Гр.33 -->
      <template v-if="status.kind === 'gr33'">
        <ZAlert v-if="gr33Missing.length" type="warning" show-icon :message="t(`${P}.gr33.missingTitle`, { n: gr33Missing.length })" data-gr33-missing>
          <template #description>
            <span v-for="u in gr33Missing" :key="u.code" class="mr-3.5 inline-block">
              <b class="font-mono">{{ u.code }}</b> — {{ t(`${P}.gr33.tnvedCount`, { n: u.tnvedCount }) }}<template v-if="u.sampleTnved">, {{ t(`${P}.gr33.example`, { code: u.sampleTnved }) }}</template>
            </span>
          </template>
        </ZAlert>
        <ZInput
          :value="q"
          type="search"
          allow-clear
          autocomplete="off"
          :placeholder="t(`${P}.gr33.search`)"
          :aria-label="t(`${P}.gr33.search`)"
          class="w-full max-sm:h-11 sm:max-w-[360px]"
          data-gr33-search
          @update:value="q = $event ?? ''"
        >
          <template #prefix><PhMagnifyingGlass :size="16" class="text-ink-3" aria-hidden="true" /></template>
        </ZInput>
        <ZTable
          :columns="gr33Columns"
          :data-source="gr33Rows"
          row-key="code"
          :aria-label="t(`${P}.gr33.title`)"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
          data-gr33-table
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'code'" class="font-mono text-sm text-ink">{{ record.code }}</span>
            <template v-else-if="column.key === 'name'">
              <span v-if="record.name" class="text-sm text-ink">{{ record.name }}</span>
              <ZTag v-else tone="wait" size="sm">{{ t(`${P}.gr33.noName`) }}</ZTag>
            </template>
            <span v-else-if="column.key === 'keden'" class="text-sm tabular-nums" :class="record.tnvedCount ? 'text-ink' : 'text-muted'">{{ record.tnvedCount ? num(record.tnvedCount) : '—' }}</span>
          </template>
          <template #emptyText>
            <ZEmpty :title="q.trim() ? t('broker.references.system.list.nothing') : t(`${P}.gr33.empty`)" />
          </template>
        </ZTable>
        <p class="m-0 text-sm text-muted">{{ t(`${P}.gr33.hint`) }}</p>
      </template>

      <!-- КАТО -->
      <template v-else-if="status.kind === 'kato'">
        <p class="m-0 text-sm text-ink-2">
          {{ t(`${P}.kato.source`) }}:
          <a v-if="status.status.sourceUrl" :href="status.status.sourceUrl" target="_blank" rel="noopener" class="break-all text-zircon-ink underline-offset-4 hover:underline">{{ status.status.sourceUrl }}</a>
          <span v-else>—</span>
        </p>
        <p class="m-0 text-sm text-muted">{{ t(`${P}.kato.hint`) }}</p>
        <div class="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4" data-kato-probe>
          <label for="sd-kato-probe" class="text-sm font-medium text-ink-2">{{ t(`${P}.kato.probe`) }}</label>
          <ZInput
            id="sd-kato-probe"
            :value="probe"
            type="search"
            allow-clear
            autocomplete="off"
            :placeholder="t(`${P}.kato.probePlaceholder`)"
            class="w-full max-sm:h-11 sm:max-w-[520px]"
            data-kato-probe-input
            @update:value="onProbe($event ?? '')"
            @search="searchKato"
          />
          <p v-if="probeState === 'loading'" class="m-0 text-sm text-muted" role="status">{{ t(`${P}.searching`) }}</p>
          <p v-else-if="probeState === 'error'" class="m-0 text-sm text-tone-danger-fg" role="alert">{{ t('broker.references.system.loadError') }}</p>
          <p v-else-if="probeState === 'done' && !probeRows.length" class="m-0 text-sm text-muted" role="status">{{ t('broker.references.system.list.nothing') }}</p>
          <ul v-else-if="probeRows.length" class="m-0 flex list-none flex-col gap-1 p-0" data-kato-probe-rows>
            <li v-for="k in probeRows" :key="k.code" class="flex min-w-0 flex-col rounded-row px-2 py-1.5 text-sm hover:bg-sunken">
              <span class="text-ink">{{ k.nameRu }}</span>
              <span class="text-xs text-muted"><span class="font-mono">{{ k.code }}</span><template v-if="k.path"> · {{ k.path }}</template></span>
            </li>
          </ul>
        </div>
      </template>

      <!-- СВХ / ТС (реестр КГД), НСИ КГД -->
      <p v-else-if="status.kind === 'warehouses' || status.kind === 'nsi'" class="m-0 text-sm text-muted">{{ t(`${P}.${status.kind}.hint`) }}</p>

      <!-- ТРОИС -->
      <template v-else-if="status.kind === 'trois'">
        <p class="m-0 text-sm text-muted">{{ t(`${P}.trois.hint`) }}</p>
        <ZInput
          :value="trois"
          type="search"
          allow-clear
          autocomplete="off"
          :placeholder="t(`${P}.trois.search`)"
          :aria-label="t(`${P}.trois.search`)"
          class="w-full max-sm:h-11 sm:max-w-[520px]"
          data-trois-search
          @update:value="onTrois($event ?? '')"
          @search="searchTrois"
        >
          <template #prefix><PhMagnifyingGlass :size="16" class="text-ink-3" aria-hidden="true" /></template>
        </ZInput>
        <p v-if="troisState === 'error'" class="m-0 text-sm text-tone-danger-fg" role="alert">{{ t('broker.references.system.loadError') }}</p>
        <ZTable
          v-else-if="trois.trim() && troisState !== 'idle'"
          :columns="troisColumns"
          :data-source="troisRows"
          row-key="id"
          :loading="troisState === 'loading'"
          :pagination="false"
          size="small"
          :aria-label="t(`${P}.trois.title`)"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
          data-trois-table
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'objectName'" class="text-sm text-ink">{{ record.objectName || '—' }}</span>
            <span v-else-if="column.key === 'validUntil'" class="text-sm tabular-nums text-ink-2">{{ formatDay(record.validUntil, locale) }}</span>
            <StatusDot v-else-if="column.key === 'status'" :tone="record.isActive ? 'done' : 'neutral'" :label="record.isActive ? t(`${P}.trois.tagActive`) : t(`${P}.trois.tagInactive`)" />
          </template>
          <template #emptyText>
            <ZEmpty :title="t('broker.references.system.list.nothing')" />
          </template>
        </ZTable>
      </template>
    </template>
  </section>
</template>
