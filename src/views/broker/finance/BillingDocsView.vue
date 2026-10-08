<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhDownloadSimple, PhPaperclip, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import type { ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import RowActions, { type RowPrimary } from '@/components/broker/RowActions.vue'
import StatStrip, { type StatItem } from '@/components/broker/StatStrip.vue'
import { billingApi, type BrokerInvoice, type PaymentCheckFile } from '@/api/billing'
import { import40Api, type Import40CaseDto } from '@/api/import40'
import { salesApi, type SalesServiceItem } from '@/api/sales'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import { caseFilterSearch, watchCaseQuery } from '@/views/billingQuery'
import { exportXlsx, formatDay, pluralForm } from '@/views/broker/list'
import { formatMoney } from '@/ui/number'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import type { ZColumn } from '@/ui/table'
import CreateBillingDocModal, { type BillingDocPreset } from './CreateBillingDocModal.vue'
import {
  KIND_FILTERS, STATUS_FILTERS, ST_CANCELLED, ST_DRAFT, billingExcelRows, billingStats, docTitle, dueDay, filterBilling,
  menuActions, overdueDays, pdfFileName, primaryAction, statusCounts, statusLabelKey, statusTone,
  type BillingAction, type BillingKindFilter, type BillingStatusFilter,
} from './billing'

// «Счета и акты» сотрудника (редизайн, волна 3б, доска Billing): счета AQNIET и акты клиентам — выставление,
// оплата, напоминание, печать. Один запрос без фильтров; поиск, вид и статус считаются на клиенте.
// Запись (новый документ и все действия, кроме PDF и чеков) — администратору и праву finance.write, как раньше.
// ?case= — только фильтр по заявке (уведомление о чеке); ?caseId= — фильтр и окно нового счёта по заявке.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { confirm } = useConfirm()

const canWrite = computed(() => (auth.role || '').toLowerCase() === 'administrator' || auth.hasPermission('finance.write'))

const board = useBlock(true, () => billingApi.list(undefined, { silent: true }))
const rows = computed<BrokerInvoice[]>(() => board.data ?? [])
const loadingFirst = computed(() => board.loading && !board.data)
const ready = computed(() => !board.loading && !board.error)

// ---- Справочники окна создания (как раньше: что загрузилось, то и применяем) ----
const clientOptions = ref<{ value: string; label: string }[]>([])
const allCases = ref<Import40CaseDto[]>([])
const tariffs = ref<SalesServiceItem[]>([])
const vatRate = ref<number | null>(null)
let refsReady = false
const loadRefs = async () => {
  const [clientsRes, casesRes, servicesRes, orgRes] = await Promise.allSettled([
    import40Api.listClients(),
    import40Api.list(),
    salesApi.listServices(),
    billingApi.organization(),
  ])
  if (clientsRes.status === 'fulfilled') {
    clientOptions.value = clientsRes.value.map((c) => ({ value: c.id, label: c.companyName || c.username }))
  }
  if (casesRes.status === 'fulfilled') allCases.value = casesRes.value
  if (servicesRes.status === 'fulfilled') tariffs.value = servicesRes.value.filter((s) => s.isActive)
  if (orgRes.status === 'fulfilled') vatRate.value = orgRes.value.vatPayer ? orgRes.value.vatRate : 0
  refsReady = true
}

// ---- Окно создания ----
const createOpen = ref(false)
const createPreset = ref<BillingDocPreset | null>(null)
const openCreate = (preset: BillingDocPreset | null = null) => {
  createPreset.value = preset
  createOpen.value = true
}
const onCreateOpen = (v: boolean) => {
  createOpen.value = v
  if (!v) createPreset.value = null
}

// ---- Поиск, вид, статус ----
const query = ref('')
const kind = ref<BillingKindFilter>('all')
const status = ref<BillingStatusFilter>('all')
const isFiltered = computed(() => !!query.value.trim() || kind.value !== 'all' || status.value !== 'all')
const items = computed(() => filterBilling(rows.value, query.value, kind.value, status.value))
const counts = computed(() => statusCounts(rows.value, query.value, kind.value))
const kindOptions = computed(() => KIND_FILTERS.map((k) => ({ value: k, label: t(`broker.billing.kind.${k}`) })))
const statusOptions = computed(() => STATUS_FILTERS.map((s) => ({
  value: s, label: t(`broker.billing.filter.${s}`), count: ready.value ? counts.value[s] : undefined,
})))
const resetFilters = () => { query.value = ''; kind.value = 'all'; status.value = 'all' }
const page = ref(1)
watch([query, kind, status], () => { page.value = 1 })

// /billing?case=… (уведомление о чеке): только фильтр. Повторный клик на открытом экране — перечитать и отфильтровать.
watchCaseQuery(() => route.query.case, async (caseId) => {
  await board.load()
  query.value = caseFilterSearch(rows.value, caseId)
})

// /billing?caseId=… (карточка заявки, «Финансы»): фильтр по номеру заявки; при праве записи — окно нового
// документа с заявкой и клиентом, после чего параметр убирается из адреса: «Назад» и обновление окно не открывают.
const applyCaseId = (raw: unknown) => {
  const caseId = Array.isArray(raw) ? raw[0] : raw
  if (!caseId || typeof caseId !== 'string') return
  const target = allCases.value.find((c) => c.id === caseId)
  query.value = target?.number ?? ''
  if (!canWrite.value) return
  openCreate({ caseId, clientId: target?.clientId })
  const { caseId: _drop, ...rest } = route.query
  void router.replace({ query: rest })
}
watch(() => route.query.caseId, (v) => { if (refsReady && v) applyCaseId(v) })

// Параметры адреса запоминаем до ожиданий: после ухода с экрана route.query — уже чужой страницы, а окно
// нового документа на размонтированном экране открывать нельзя.
let alive = true
onBeforeUnmount(() => { alive = false })
onMounted(async () => {
  const { case: caseAtMount, caseId: caseIdAtMount } = route.query
  await board.load()
  if (!alive) return
  const byCase = caseFilterSearch(rows.value, caseAtMount)
  if (byCase) query.value = byCase
  await loadRefs()
  if (!alive) return
  applyCaseId(caseIdAtMount)
})

// ---- Показатели (по всем строкам, без поиска и фильтров) ----
const stats = computed<StatItem[]>(() => {
  const d = board.data ? billingStats(rows.value) : null
  const invoices = (n: number) => t(`broker.billing.invoices.${pluralForm(n, locale.value)}`, { n })
  const awaitingHint = (s: NonNullable<typeof d>) => [
    invoices(s.awaitingCount),
    s.overdueCount ? t(`broker.billing.overdue.${pluralForm(s.overdueCount, locale.value)}`, { n: s.overdueCount }) : '',
  ].filter(Boolean).join(' · ')
  return [
    { key: 'issued', label: t('broker.billing.stat.issued'), value: d ? formatMoney(d.issuedSum) : '', hint: d ? invoices(d.issuedCount) : undefined },
    { key: 'paid', label: t('broker.billing.stat.paid'), value: d ? formatMoney(d.paidSum) : '', hint: d ? invoices(d.paidCount) : undefined, tone: 'done' },
    { key: 'awaiting', label: t('broker.billing.stat.awaiting'), value: d ? formatMoney(d.awaitingSum) : '', hint: d ? awaitingHint(d) : undefined, tone: 'gold' },
    { key: 'drafts', label: t('broker.billing.stat.drafts'), value: d ? String(d.drafts) : '', hint: d ? t('broker.billing.stat.draftsHint') : undefined },
  ]
})

// ---- Таблица ----
const columns = computed<ZColumn<BrokerInvoice>[]>(() => [
  { key: 'doc', title: t('broker.billing.col.doc'), width: 190 },
  { key: 'client', title: t('broker.billing.col.client'), width: 230 },
  { key: 'status', title: t('broker.billing.col.status'), width: 130 },
  { key: 'total', title: t('broker.billing.col.total'), width: 160, align: 'right' },
  { key: 'dates', title: t('broker.billing.col.dates'), width: 170 },
  { key: 'checks', title: t('broker.billing.col.checks'), width: 170 },
  { key: 'actions', title: '', width: 200, align: 'right' },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))
const rowClass = (r: BrokerInvoice) => (r.status === ST_CANCELLED ? 'opacity-60' : '')

const vatLine = (r: BrokerInvoice) =>
  (r.vatRate > 0 ? t('broker.billing.vatSum', { rate: r.vatRate, sum: formatMoney(r.vatAmount) }) : t('broker.billing.noVat'))
const firstDate = (r: BrokerInvoice) => (r.issuedAtUtc
  ? t('broker.billing.date.issued', { date: formatDay(r.issuedAtUtc) })
  : r.status === ST_DRAFT ? t('broker.billing.date.created', { date: formatDay(r.createdAtUtc) }) : '')
/** Вторая строка дат: оплачен / просрочен N дн. / срок. */
const secondDate = (r: BrokerInvoice): { text: string; overdue: boolean } | null => {
  if (r.paidAtUtc) return { text: t('broker.billing.date.paid', { date: formatDay(r.paidAtUtc) }), overdue: false }
  const days = overdueDays(r)
  if (days > 0) return { text: t('broker.billing.date.overdue', { n: days }), overdue: true }
  const due = dueDay(r.dueDateUtc)
  return due ? { text: t('broker.billing.date.due', { date: formatDay(due) }), overdue: false } : null
}

// ---- Действия строки ----
const ACTION_LABEL: Record<BillingAction, string> = {
  issue: 'broker.billing.action.issue',
  markPaid: 'broker.billing.action.markPaid',
  remind: 'broker.billing.action.remind',
  pdf: 'broker.billing.action.pdf',
  delete: 'broker.billing.action.delete',
  cancel: 'broker.billing.action.cancel',
}
// Одно действие за раз: пока идёт запрос, кнопки действий остальных строк и пункты записи в меню неактивны.
const busy = ref<string | null>(null)
const rowPrimary = (r: BrokerInvoice): RowPrimary | null => {
  if (!canWrite.value) return null
  const key = primaryAction(r)
  if (!key) return null
  return {
    key, label: t(ACTION_LABEL[key]), variant: key === 'issue' ? 'primary' : 'outline',
    loading: busy.value === r.id, disabled: !!busy.value && busy.value !== r.id,
  }
}
const menuItems = (r: BrokerInvoice): ZDropdownItem[] => menuActions(r, canWrite.value).map((k, i, all) => ({
  key: k,
  label: t(ACTION_LABEL[k]),
  disabled: k !== 'pdf' && !!busy.value,
  danger: k === 'delete' || k === 'cancel',
  // Разделитель перед первым опасным пунктом.
  divider: (k === 'delete' || k === 'cancel') && i > 0 && all[i - 1] !== 'delete' && all[i - 1] !== 'cancel',
}))

const isHttp = (e: unknown) => !!(e as { response?: unknown })?.response
// HTTP-ошибку уже показал общий перехватчик (api/client.ts) — здесь только не-HTTP случай.
const failed = (e: unknown) => { if (!isHttp(e)) message.error(t('billing.actionError')) }

const ask = (title: string, okText: string, danger = false) =>
  confirm({ title, okText, cancelText: t('common.cancel'), danger })

// Занято другим действием — говорим сразу, до вопроса-подтверждения (а не молча отказываем после «Да»).
const isBusy = () => {
  if (!busy.value) return false
  message.info(t('broker.billing.busy'))
  return true
}
const run = async (r: BrokerInvoice, fn: () => Promise<void>) => {
  if (isBusy()) return
  busy.value = r.id
  try {
    await fn()
  } catch (e) {
    failed(e)
  } finally {
    busy.value = null
  }
}

const issue = async (r: BrokerInvoice) => {
  if (isBusy()) return
  if (!(await ask(t('billing.issueConfirm'), t('billing.issueBtn')))) return
  await run(r, async () => {
    await billingApi.issue(r.id)
    message.success(t('billing.issuedOk'))
    await board.load()
  })
}
const markPaid = async (r: BrokerInvoice) => {
  if (isBusy()) return
  if (!(await ask(t('billing.markPaidConfirm'), t('billing.markPaid')))) return
  await run(r, async () => {
    await billingApi.markPaid(r.id)
    message.success(t('broker.billing.paidOk'))
    await board.load()
  })
}
const remind = (r: BrokerInvoice) => run(r, async () => {
  const res = await billingApi.remind(r.id)
  // Письмо не ушло — не успех, а повод проверить email клиента и настройки почты.
  if (res.emailSent) message.success(t('billing.remindSent', { to: res.to }))
  else message.warning(t('billing.remindNoEmail'))
})
const remove = async (r: BrokerInvoice) => {
  if (isBusy()) return
  if (!(await ask(t('billing.deleteConfirm'), t('broker.billing.action.delete'), true))) return
  await run(r, async () => {
    await billingApi.remove(r.id)
    message.success(t('broker.billing.deletedOk'))
    await board.load()
  })
}
const cancelDoc = async (r: BrokerInvoice) => {
  if (isBusy()) return
  if (!(await ask(t('billing.cancelConfirm'), t('broker.billing.action.cancel'), true))) return
  await run(r, async () => {
    await billingApi.cancel(r.id)
    message.success(t('broker.billing.cancelledOk'))
    await board.load()
  })
}
const downloadPdf = async (r: BrokerInvoice) => {
  try {
    saveBlob(await billingApi.pdf(r.id), pdfFileName(r, t))
  } catch (e) {
    failed(e)
  }
}
const downloadCheck = async (r: BrokerInvoice, f: PaymentCheckFile) => {
  try {
    saveBlob(await billingApi.downloadPaymentCheck(r.id, f.id), f.fileName)
  } catch (e) {
    failed(e)
  }
}

const onAction = (r: BrokerInvoice, key: string) => {
  switch (key as BillingAction) {
    case 'issue': if (canWrite.value) void issue(r); break
    case 'markPaid': if (canWrite.value) void markPaid(r); break
    case 'remind': if (canWrite.value) void remind(r); break
    case 'delete': if (canWrite.value) void remove(r); break
    case 'cancel': if (canWrite.value) void cancelDoc(r); break
    case 'pdf': void downloadPdf(r); break
  }
}

// ---- Excel: отфильтрованные строки ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value || !items.value.length) return
  exporting.value = true
  try {
    await exportXlsx('billing', t('billing.title'), billingExcelRows(items.value, t, (s) => t(statusLabelKey(s))))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-billing>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.billing.title') }}</h1>
        <span
          v-if="board.data"
          class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
          data-billing-count
        >{{ rows.length }}</span>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="board.loading && !!board.data" class="max-sm:h-11 max-sm:flex-1" data-billing-refresh @click="board.load()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          variant="secondary"
          :loading="exporting"
          :disabled="!items.length"
          :title="items.length ? undefined : t('broker.list.exportEmpty')"
          class="max-sm:h-11 max-sm:flex-1"
          data-billing-export
          @click="exportExcel"
        >
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
        <ZButton v-if="canWrite" variant="primary" class="max-sm:h-11 max-sm:flex-1" data-billing-new @click="openCreate()">
          <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
          {{ t('billing.newDoc') }}
        </ZButton>
      </div>
    </div>

    <StatStrip v-if="!board.error || board.data" :items="stats" :loading="loadingFirst" data-billing-stats />

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.billing.search')" @update:value="query = $event" />
      <ZSegmented
        :value="kind"
        :options="kindOptions"
        :aria-label="t('broker.billing.kindLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-billing-kind
        @update:value="kind = $event as BillingKindFilter"
      />
      <ZSegmented
        :value="status"
        :options="statusOptions"
        :aria-label="t('broker.billing.statusLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-billing-status
        @update:value="status = $event as BillingStatusFilter"
      />
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-billing-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-billing-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-billing-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-billing-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="items"
        row-key="id"
        :loading="board.loading"
        :row-class-name="rowClass"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.billing.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-billing-table
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'doc'" class="block min-w-0">
            <span class="block truncate text-sm font-semibold text-ink tabular-nums" data-billing-doc>{{ docTitle(record, t) }}</span>
            <span class="block truncate font-mono text-xs text-muted" data-billing-case>{{ record.caseNumber || t('broker.billing.noCase') }}</span>
          </span>
          <ClientCell v-else-if="column.key === 'client'" :name="record.clientName" />
          <ZTag v-else-if="column.key === 'status'" :tone="statusTone(record.status)" data-billing-status-tag>{{ t(statusLabelKey(record.status)) }}</ZTag>
          <span v-else-if="column.key === 'total'" class="block min-w-0 text-right">
            <span class="block text-sm font-semibold whitespace-nowrap text-ink tabular-nums" data-billing-total>{{ formatMoney(record.total) }}</span>
            <span class="block text-xs whitespace-nowrap text-muted tabular-nums" data-billing-vat>{{ vatLine(record) }}</span>
          </span>
          <span v-else-if="column.key === 'dates'" class="block min-w-0 text-sm text-ink-2 tabular-nums">
            <span v-if="firstDate(record)" class="block whitespace-nowrap" data-billing-date1>{{ firstDate(record) }}</span>
            <span
              v-if="secondDate(record)"
              :class="['block whitespace-nowrap text-xs', secondDate(record)!.overdue ? 'font-semibold text-tone-danger-fg' : 'text-muted']"
              data-billing-date2
            >{{ secondDate(record)!.text }}</span>
          </span>
          <span v-else-if="column.key === 'checks'" class="flex min-w-0 flex-col gap-1">
            <span v-for="f in record.paymentChecks ?? []" :key="f.id" class="flex min-w-0 items-center gap-1.5">
              <ZButton
                variant="link"
                class="min-w-0 max-w-[150px] text-xs max-sm:h-11"
                :title="f.fileName"
                :aria-label="t('broker.billing.downloadCheck', { name: f.fileName })"
                data-billing-check
                @click.stop="downloadCheck(record, f)"
              >
                <template #icon><PhPaperclip :size="14" aria-hidden="true" /></template>
                <span class="truncate">{{ f.fileName }}</span>
              </ZButton>
              <span class="shrink-0 text-xs text-muted tabular-nums">{{ formatDay(f.createdAtUtc) }}</span>
            </span>
            <span v-if="!(record.paymentChecks ?? []).length" class="text-sm text-muted">—</span>
          </span>
          <RowActions
            v-else-if="column.key === 'actions'"
            :primary="rowPrimary(record)"
            :items="menuItems(record)"
            :label="t('broker.billing.actionsLabel', { doc: docTitle(record, t) })"
            @action="onAction(record, $event)"
          />
        </template>
        <template #emptyText>
          <ZEmpty
            :title="isFiltered ? t('broker.list.nothingFound') : t('broker.billing.empty')"
            :hint="isFiltered ? t('broker.list.nothingFoundHint') : (canWrite ? t('broker.billing.emptyHint') : undefined)"
          >
            <template v-if="isFiltered || canWrite" #action>
              <ZButton v-if="isFiltered" data-billing-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
              <ZButton v-else variant="primary" @click="openCreate()">{{ t('billing.newDoc') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>
    </template>

    <CreateBillingDocModal
      v-if="canWrite"
      :open="createOpen"
      :clients="clientOptions"
      :cases="allCases"
      :tariffs="tariffs"
      :vat-rate="vatRate"
      :preset="createPreset"
      @update:open="onCreateOpen"
      @created="board.load()"
    />
  </div>
</template>
