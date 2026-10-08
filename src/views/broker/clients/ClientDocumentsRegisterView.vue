<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCheck, PhDownloadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import NoticeBanner from '@/components/broker/NoticeBanner.vue'
import { clientCardApi, type ClientDocumentRow } from '@/api/clientCard'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { exportXlsx, formatDay, pluralForm } from '@/views/broker/list'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import { docKindLabelKey, docStatusLabelKey, docStatusTone } from './clients'
import {
  DOC_KINDS, DOC_STATES, docExcelRows, filterDocs, kindLabelKey, needsAqniet, stateCounts, stateLabelKey, validity,
  type DocKind, type DocState, type Validity,
} from './clientDocs'

// «Документы клиентов» (редизайн, волна 3б, доска ClientDocs): договоры и доверенности по всем клиентам со сроками.
// Один запрос без фильтров; поиск, вид и состояние считаются на клиенте, порядок строк — как отдал сервер.
// Строка открывает карточку клиента; «Подписать за AQNIET» — только администратору и руководителю отдела.
const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()

// Как и на сервере (CanSignForProvider): администратор или бизнес-роль rop.
const canSignProvider = computed(() => (auth.role || '').toLowerCase() === 'administrator' || auth.hasBusinessRole('rop'))
// Мастер подписи — экран Импорта 40: без import40.read он вернул бы на главную.
const canOpenSigning = computed(() => canSignProvider.value && auth.hasPermission('import40.read'))

const board = useBlock(true, () => clientCardApi.documents(undefined, { silent: true }))
onMounted(() => { void board.load() })

const items = computed<ClientDocumentRow[]>(() => board.data ?? [])
const ready = computed(() => !board.loading && !board.error)

// ---- Плашки: счётчики по всем строкам, без поиска и фильтров ----
const aqnietCount = computed(() => items.value.filter(needsAqniet).length)
const expiringCount = computed(() => items.value.filter((r) => r.expiringSoon).length)
const showAqnietBanner = computed(() => !!board.data && canSignProvider.value && aqnietCount.value > 0)
const showExpiringBanner = computed(() => !!board.data && expiringCount.value > 0)

// «2 договора ждут…»: фраза — ключ по числу (один / много), счётчик — слот count, выделен жирным
// (число и существительное в нужной форме: ru — один/несколько/много, остальные языки — свои правила).
const bannerFor = (kind: 'aqniet' | 'expiring', n: number, noun: 'contract' | 'document') => {
  const p = pluralForm(n, locale.value)
  return { keypath: `broker.clientDocs.banner.${kind}.${p === 'one' ? 'one' : 'many'}`, count: `${n} ${t(`broker.clientDocs.noun.${noun}.${p}`)}` }
}
const aqnietBanner = computed(() => bannerFor('aqniet', aqnietCount.value, 'contract'))
const expiringBanner = computed(() => bannerFor('expiring', expiringCount.value, 'document'))

// ---- Поиск, вид, состояние ----
const query = ref('')
const kind = ref<DocKind>('all')
const state = ref<DocState>('all')
// «Показать» на плашке: только это состояние, без вида и поиска — иначе нужные строки могли бы быть скрыты.
const showState = (s: DocState) => { query.value = ''; kind.value = 'all'; state.value = s }
const filtered = computed(() => !!query.value.trim() || kind.value !== 'all' || state.value !== 'all')
const rows = computed(() => filterDocs(items.value, query.value, kind.value, state.value))
const counts = computed(() => stateCounts(items.value, query.value, kind.value))
const kindOptions = computed(() => DOC_KINDS.map((k) => ({ value: k, label: t(kindLabelKey(k)) })))
const stateOptions = computed(() => DOC_STATES
  .filter((s) => s !== 'aqniet' || canSignProvider.value)
  .map((s) => ({ value: s, label: t(stateLabelKey(s)), count: ready.value ? counts.value[s] : undefined })))
const resetFilters = () => { query.value = ''; kind.value = 'all'; state.value = 'all' }
// Страница — управляемая: новый поиск или фильтр начинают с первой.
const page = ref(1)
watch([query, kind, state], () => { page.value = 1 })

// ---- Таблица ----
const columns = computed<ZColumn<ClientDocumentRow>[]>(() => [
  { key: 'client', title: t('broker.clientDocs.col.client'), width: 280 },
  { key: 'doc', title: t('broker.clientDocs.col.doc'), width: 230 },
  { key: 'status', title: t('broker.clientDocs.col.status'), width: 150 },
  { key: 'signs', title: t('broker.clientDocs.col.signs'), width: 230 },
  { key: 'validity', title: t('broker.clientDocs.col.validUntil'), width: 150 },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))

const openClient = (r: ClientDocumentRow) => { void router.push(`/clients/${r.clientId}`) }
const customRow = (r: ClientDocumentRow) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    openClient(r)
  },
})
const signForAqniet = (r: ClientDocumentRow) => {
  void router.push({ path: '/import-40/company', query: { client: r.clientId, step: 'contract' } })
}
type Hint = NonNullable<Validity['hint']>
const hintText = (h: Hint) =>
  h.kind === 'overdue' ? t('broker.clientDocs.overdue', { n: h.n }) : h.kind === 'left' ? t('broker.clientDocs.daysLeft', { n: h.n }) : t('broker.clientDocs.noLimit')
// Просрочен — красным, истекает в ближайшие 30 дней — золотым, остальное приглушено.
const hintClass = (h: Hint) => (h.kind === 'overdue' ? 'font-semibold text-tone-danger-fg' : h.kind === 'left' && h.soon ? 'font-semibold text-gold-ink' : 'text-muted')
const signs = (r: ClientDocumentRow) => [
  { key: 'client', on: r.clientSigned, label: 'broker.clientDocs.signClient' },
  ...(r.kind === 'contract' ? [{ key: 'provider', on: r.providerSigned, label: 'broker.clientDocs.signProvider' }] : []),
]

// ---- Excel: отфильтрованные строки ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value || !rows.value.length) return
  exporting.value = true
  try {
    await exportXlsx('client-documents', t('clientDocs.title'), docExcelRows(rows.value, t))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}

const emptyTitle = computed(() => (filtered.value ? t('broker.list.nothingFound') : t('clientDocs.empty')))
</script>

<template>
  <div class="flex flex-col gap-4" data-client-docs-register>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <div class="flex min-w-0 items-center gap-3">
          <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('clientDocs.title') }}</h1>
          <span
            v-if="board.data"
            class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
            data-docs-count
          >{{ board.data.length }}</span>
        </div>
        <p class="m-0 mt-1 text-sm text-ink-3">{{ t('clientDocs.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="board.loading && !!board.data" class="max-sm:h-11 max-sm:flex-1" data-docs-refresh @click="board.load()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          variant="secondary"
          :loading="exporting"
          :disabled="!rows.length"
          :title="rows.length ? undefined : t('broker.list.exportEmpty')"
          class="max-sm:h-11 max-sm:flex-1"
          data-docs-export
          @click="exportExcel"
        >
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
      </div>
    </div>

    <div v-if="showAqnietBanner || showExpiringBanner" class="flex flex-wrap gap-2.5 [&>*]:flex-1 [&>*]:basis-80">
      <NoticeBanner v-if="showAqnietBanner" tone="gold" data-docs-banner-aqniet>
        <i18n-t :keypath="aqnietBanner.keypath" tag="span" scope="global">
          <template #count><b class="font-semibold">{{ aqnietBanner.count }}</b></template>
        </i18n-t>
        <template #action>
          <ZButton class="bg-gold text-navy enabled:hover:bg-gold/85 max-sm:h-11" data-docs-show-aqniet @click="showState('aqniet')">
            {{ t('broker.clientDocs.show') }}
          </ZButton>
        </template>
      </NoticeBanner>
      <NoticeBanner v-if="showExpiringBanner" tone="neutral" data-docs-banner-expiring>
        <i18n-t :keypath="expiringBanner.keypath" tag="span" scope="global">
          <template #count><b class="font-semibold">{{ expiringBanner.count }}</b></template>
        </i18n-t>
        <template #action>
          <ZButton class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11" data-docs-show-expiring @click="showState('expiring')">
            {{ t('broker.clientDocs.show') }}
          </ZButton>
        </template>
      </NoticeBanner>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.clientDocs.search')" @update:value="query = $event" />
      <ZSegmented
        :value="kind"
        :options="kindOptions"
        :aria-label="t('broker.clientDocs.kindLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-docs-kinds
        @update:value="kind = $event as DocKind"
      />
      <ZSegmented
        :value="state"
        :options="stateOptions"
        :aria-label="t('broker.clientDocs.stateLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-docs-states
        @update:value="state = $event as DocState"
      />
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-docs-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-docs-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-docs-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-docs-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :loading="board.loading"
        :custom-row="customRow"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.clientDocs.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-docs-table
      >
        <template #bodyCell="{ column, record }">
          <button
            v-if="column.key === 'client'"
            type="button"
            class="flex min-w-0 max-w-full cursor-pointer flex-col items-start gap-0.5 rounded-field border-0 bg-transparent p-0 text-left font-sans outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
            data-doc-client
            @click="openClient(record)"
          >
            <ClientCell :name="record.clientName" class="max-w-full" data-doc-client-name />
            <span class="block max-w-full truncate pl-8 text-xs text-muted" :title="record.clientEmail">{{ record.clientEmail }}</span>
          </button>
          <span v-else-if="column.key === 'doc'" class="block min-w-0">
            <span class="block truncate text-sm font-semibold text-ink" data-doc-title>{{ t('broker.clients.docs.number', { kind: t(docKindLabelKey(record.kind)), number: record.number, year: record.year }) }}</span>
            <span class="block truncate text-xs text-muted" data-doc-generated>{{ t('broker.clientDocs.generated', { date: formatDay(record.generatedAtUtc) }) }}<template v-if="record.isSingleUse"> · {{ t('broker.clientDocs.singleUseNote') }}</template></span>
          </span>
          <ZTag v-else-if="column.key === 'status'" :tone="docStatusTone(record.status)" data-doc-status>{{ t(docStatusLabelKey(record.status)) }}</ZTag>
          <span v-else-if="column.key === 'signs'" class="block min-w-0">
            <span class="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-doc-signs>
              <span v-for="s in signs(record)" :key="s.key" :class="s.on ? 'text-ink-2' : 'text-muted'" :data-sign="s.key" :data-on="s.on">
                <PhCheck v-if="s.on" :size="14" weight="bold" class="mr-1 inline-block align-[-2px] text-tone-done-fg" aria-hidden="true" /><template v-else>— </template>{{ t(s.label) }}<span class="sr-only"> ({{ t(s.on ? 'broker.clientDocs.signed' : 'broker.clientDocs.notSigned') }})</span>
              </span>
            </span>
            <ZButton
              v-if="canOpenSigning && needsAqniet(record)"
              variant="link"
              class="mt-0.5 block text-xs text-zircon-ink max-sm:h-11"
              :aria-label="t('broker.clientDocs.signAqnietFor', { name: record.clientName })"
              data-doc-sign-aqniet
              @click="signForAqniet(record)"
            >{{ t('broker.clientDocs.signAqniet') }}</ZButton>
          </span>
          <span v-else-if="column.key === 'validity'" class="block min-w-0">
            <span :class="['block text-sm tabular-nums', validity(record).date === '—' ? 'text-muted' : 'text-ink']" data-doc-until>{{ validity(record).date }}</span>
            <span
              v-if="validity(record).hint"
              :class="['block text-xs', hintClass(validity(record).hint!)]"
              :data-doc-hint="validity(record).hint!.kind"
            >{{ hintText(validity(record).hint!) }}</span>
          </span>
        </template>
        <template #emptyText>
          <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.list.nothingFoundHint') : undefined">
            <template v-if="filtered" #action>
              <ZButton data-docs-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>
    </template>
  </div>
</template>
