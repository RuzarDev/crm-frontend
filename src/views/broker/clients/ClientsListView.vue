<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCheck, PhDownloadSimple, PhEnvelopeSimple } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import RowActions from '@/components/broker/RowActions.vue'
import ClientDocsDrawer from './ClientDocsDrawer.vue'
import InviteClientModal, { type InviteReissue } from './InviteClientModal.vue'
import { clientsOnboardingApi, type ClientOnboardingRow } from '@/api/clientsOnboarding'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { exportXlsx, formatDay } from '@/views/broker/list'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import type { ZColumn } from '@/ui/table'
import {
  CLIENT_SEGMENTS, SEGMENT_LABEL, clientExcelRows, clientName, clientStatusLabelKey, clientStatusTone, filterClients, inviteUntil,
  segmentCounts, type ClientSegment,
} from './clients'

// «Клиенты» (редизайн, волна 3б, доска Clients): статус аккаунта, подписанные документы, приглашения.
// Один запрос без фильтров; поиск и сегмент считаются на клиенте. Строка открывает карточку клиента;
// «Документы», «Новая ссылка», блокировка — в меню строки, с теми же правами, что и раньше.
const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const { confirm } = useConfirm()

const canInvite = computed(() => auth.hasPermission('clients.invite'))
const canManage = computed(() => auth.hasPermission('clients.manage'))
// Документы клиента сервер отдаёт только при import40.read: без права был 403 и два тоста.
const canViewDocs = computed(() => auth.hasPermission('import40.read'))

const board = useBlock(true, () => clientsOnboardingApi.list({ silent: true }))
onMounted(() => { void board.load() })

const items = computed<ClientOnboardingRow[]>(() => board.data ?? [])

// ---- Поиск и сегмент ----
const query = ref('')
const segment = ref<ClientSegment>('all')
const filtered = computed(() => !!query.value.trim() || segment.value !== 'all')
const rows = computed(() => filterClients(items.value, query.value, segment.value))
const counts = computed(() => segmentCounts(items.value, query.value))
const ready = computed(() => !board.loading && !board.error)
const segmentOptions = computed(() => CLIENT_SEGMENTS.map((k) => ({
  value: k,
  label: t(SEGMENT_LABEL[k]),
  count: ready.value ? counts.value[k] : undefined,
})))
const resetFilters = () => { query.value = ''; segment.value = 'all' }
// Страница — управляемая: новый поиск или сегмент начинают с первой.
const page = ref(1)
watch([query, segment], () => { page.value = 1 })

// ---- Таблица ----
const columns = computed<ZColumn<ClientOnboardingRow>[]>(() => [
  { key: 'company', title: t('broker.clients.col.company'), width: 320 },
  { key: 'status', title: t('broker.clients.col.status'), width: 220 },
  { key: 'docs', title: t('broker.clients.col.docs'), width: 230 },
  { key: 'since', title: t('broker.clients.col.since'), width: 120, align: 'right', className: 'max-sm:hidden' },
  { key: 'actions', title: '', width: 56, align: 'right' },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.clients.range', { from, to, total }),
}))

const openCard = (c: ClientOnboardingRow) => { void router.push(`/clients/${c.id}`) }
const customRow = (c: ClientOnboardingRow) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    openCard(c)
  },
})

// ---- Действия строки ----
const menuItems = (c: ClientOnboardingRow): ZDropdownItem[] => [
  ...(canViewDocs.value ? [{ key: 'docs', label: t('broker.clients.action.documents') }] : []),
  ...(canInvite.value && c.status === 'Invited' ? [{ key: 'reissue', label: t('broker.clients.action.newLink') }] : []),
  ...(canManage.value && c.status !== 'Blocked' ? [{ key: 'block', label: t('broker.clients.action.block'), danger: true, divider: true }] : []),
  ...(canManage.value && c.status === 'Blocked' ? [{ key: 'unblock', label: t('broker.clients.action.unblock') }] : []),
]

const docsOpen = ref(false)
const docsClient = ref<ClientOnboardingRow | null>(null)
const inviteOpen = ref(false)
const reissue = ref<InviteReissue | null>(null)

const openInvite = () => { reissue.value = null; inviteOpen.value = true }
const onInviteOpen = (open: boolean) => {
  inviteOpen.value = open
  if (!open) reissue.value = null
}

const reissueLink = async (c: ClientOnboardingRow) => {
  const yes = await confirm({
    title: t('broker.clients.reissue.title'),
    content: t('broker.clients.reissue.text'),
    okText: t('broker.clients.reissue.ok'),
    cancelText: t('admin.otmena'),
  })
  if (!yes) return
  reissue.value = { email: c.email ?? c.username, bin: c.bin ?? '', companyName: c.companyName ?? '', phone: c.phone ?? '' }
  inviteOpen.value = true
}

// Блокировка и разблокировка: при ошибке тост показал перехватчик — список не перечитываем.
const toggleBlock = async (c: ClientOnboardingRow, block: boolean) => {
  if (block) {
    const yes = await confirm({
      title: t('admin.zablokirovatKlientaOnNe'),
      okText: t('admin.zablokirovat'),
      cancelText: t('admin.otmena'),
      danger: true,
    })
    if (!yes) return
  }
  try {
    await (block ? clientsOnboardingApi.block(c.id) : clientsOnboardingApi.unblock(c.id))
  } catch {
    return
  }
  message.success(t(block ? 'admin.klientZablokirovan' : 'admin.klientRazblokirovan'))
  await board.load()
}

const onAction = (c: ClientOnboardingRow, key: string) => {
  if (key === 'docs') { docsClient.value = c; docsOpen.value = true }
  else if (key === 'reissue') void reissueLink(c)
  else if (key === 'block') void toggleBlock(c, true)
  else if (key === 'unblock') void toggleBlock(c, false)
}

// ---- Excel: отфильтрованные строки ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value || !rows.value.length) return
  exporting.value = true
  try {
    await exportXlsx('clients', t('admin.klienty'), clientExcelRows(rows.value, t))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}

const now = () => Date.now()
const emptyTitle = computed(() => (filtered.value ? t('broker.list.nothingFound') : t('admin.klientovPokaNet')))
</script>

<template>
  <div class="flex flex-col gap-4" data-clients>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.clients.title') }}</h1>
        <span
          v-if="board.data"
          class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
          data-clients-count
        >{{ board.data.length }}</span>
      </div>
      <div class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="board.loading && !!board.data" class="max-sm:h-11 max-sm:flex-1" data-clients-refresh @click="board.load()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          variant="secondary"
          :loading="exporting"
          :disabled="!rows.length"
          :title="rows.length ? undefined : t('broker.list.exportEmpty')"
          class="max-sm:h-11 max-sm:flex-1"
          data-clients-export
          @click="exportExcel"
        >
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.clients.export') }}
        </ZButton>
        <ZButton v-if="canInvite" variant="primary" class="max-sm:h-11 max-sm:flex-1" data-clients-invite @click="openInvite">
          <template #icon><PhEnvelopeSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.clients.inviteButton') }}
        </ZButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.clients.search')" class="min-w-0 max-sm:basis-full sm:basis-60 sm:flex-1" @update:value="query = $event" />
      <ZSegmented
        :value="segment"
        :options="segmentOptions"
        :aria-label="t('broker.clients.segmentsLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-clients-segments
        @update:value="segment = $event as ClientSegment"
      />
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-clients-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-clients-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-clients-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-clients-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :loading="board.loading"
        :custom-row="customRow"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.clients.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-clients-table
      >
        <template #headerCell="{ column }">
          <span v-if="column.key === 'actions'" class="sr-only">{{ t('broker.list.actions') }}</span>
        </template>
        <template #bodyCell="{ column, record }">
          <button
            v-if="column.key === 'company'"
            type="button"
            class="flex min-w-0 max-w-full cursor-pointer items-center gap-2.5 rounded-field border-0 bg-transparent p-0 text-left font-sans outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
            data-client-open
            @click="openCard(record)"
          >
            <ZAvatar :name="clientName(record)" class="size-8!" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-ink" :title="record.companyName || '—'" data-client-name>{{ record.companyName || '—' }}</span>
              <span class="block truncate text-xs text-muted">{{ record.email || record.username }}<template v-if="record.bin"> · {{ t('admin.bin') }} {{ record.bin }}</template></span>
            </span>
          </button>
          <span v-else-if="column.key === 'status'" class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <ZTag :tone="clientStatusTone(record.status)" data-client-status>{{ t(clientStatusLabelKey(record.status)) }}</ZTag>
            <template v-if="inviteUntil(record, now())">
              <span v-if="inviteUntil(record, now())!.expired" class="text-xs text-gold-ink" data-client-expired>{{ t('admin.ssylkaIstekla') }}</span>
              <span v-else class="text-xs text-muted" data-client-until>{{ t('admin.doDate', { date: inviteUntil(record, now())!.date }) }}</span>
            </template>
          </span>
          <span v-else-if="column.key === 'docs'" class="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-client-docs>
            <span v-for="d in ([['contract', record.hasContract, 'admin.dogovor'], ['poa', record.hasPoa, 'admin.doverennost']] as const)" :key="d[0]" :class="d[1] ? 'text-ink-2' : 'text-muted'" :data-doc="d[0]" :data-has="d[1]">
              <PhCheck v-if="d[1]" :size="14" weight="bold" class="mr-1 inline-block align-[-2px] text-tone-done-fg" aria-hidden="true" /><template v-else>— </template>{{ t(d[2]) }}
            </span>
          </span>
          <span v-else-if="column.key === 'since'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ formatDay(record.createdAtUtc) }}</span>
          <RowActions
            v-else-if="column.key === 'actions'"
            :items="menuItems(record)"
            :label="t('broker.clients.actionsLabel', { name: clientName(record) })"
            @action="onAction(record, $event)"
          />
        </template>
        <template #emptyText>
          <ZEmpty :title="emptyTitle" :hint="filtered ? t('broker.list.nothingFoundHint') : (canInvite ? t('broker.clients.emptyHint') : undefined)">
            <template v-if="filtered || canInvite" #action>
              <ZButton v-if="filtered" data-clients-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
              <ZButton v-else variant="primary" @click="openInvite">{{ t('broker.clients.inviteButton') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>
    </template>

    <ClientDocsDrawer v-if="canViewDocs" v-model:open="docsOpen" :client="docsClient" />
    <InviteClientModal v-if="canInvite" :open="inviteOpen" :reissue="reissue" @update:open="onInviteOpen" @invited="board.load()" />
  </div>
</template>
