<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhBuildings, PhCheck, PhClock, PhDownloadSimple, PhDotsThree, PhEnvelopeSimple, PhFileText, PhPhone, PhQrCode } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTabs, { type ZTabItem } from '@/components/z/ZTabs.vue'
import ZTag from '@/components/z/ZTag.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import RowActions, { type RowPrimary } from '@/components/broker/RowActions.vue'
import StatStrip, { type StatItem } from '@/components/broker/StatStrip.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { billingApi, type BrokerInvoice } from '@/api/billing'
import { foreignContractsApi } from '@/api/foreignContracts'
import { carriersApi } from '@/api/carriers'
import { clientCardApi, type ClientCard, type ClientCardCase, type ClientCardDoc } from '@/api/clientCard'
import { canReissuePoa as reissuablePoa, canRenewContract, import40ContractApi } from '@/api/import40Contract'
import { clientRegistryApi } from '@/api/clientRegistry'
import { reestrApi } from '@/api/reestr'
import type { ReestrEntry } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { useImport40Status } from '@/composables/useImport40Status'
import { useBlock } from '@/views/home/useBlock'
import { formatDay, pluralForm } from '@/views/broker/list'
import { dueDay, docTitle, overdueDays, statusLabelKey as invoiceStatusKey, statusTone as invoiceStatusTone } from '@/views/broker/finance/billing'
import { canEditClientPapers } from '@/views/broker/company/staffCompany'
import { DATA_KEY, cellText, formatContainer, statusKey as reestrStatusKey, statusTone as reestrStatusTone } from '@/views/broker/transit/transit'
import { formatMoney } from '@/ui/number'
import { formatPhone } from '@/utils/phone'
import { saveBlob } from '@/ui/download'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import { validity, type Validity } from './clientDocs'
import { REQUISITE_LABEL_KEY, isIndividualEntrepreneur, joinList, profileMissing } from '@/views/client/company/company'
import { blankFileName, clientStatusLabelKey, clientStatusTone, docKindLabelKey, inviteUntil, signMethodLabelKey } from './clients'
import {
  accountStatusOf, availableTabs, awaitingAqniet, canRenewPoa, caseTone, cardTitle, contactRows, contractsTabCount, currentDocs, directorBasisOf, docDownloadKey, docTag, docsTabCount, hasNextPoa, nextPoaOf,
  invoicesOf, liveInvoicesCount, matchesCase, recentCases, resolveTab, transitQuery, unpaidOf, type ClientCardTab,
} from './clientCard'
import DocSignedFiles from './DocSignedFiles.vue'
import InviteClientModal from './InviteClientModal.vue'
import { useClientAccountActions } from './useClientAccountActions'
import { useContractExtend } from './useContractExtend'
import ClientRegistryPanel from '@/views/clientRegistry/ClientRegistryPanel.vue'
import ContractsPanel from '@/views/foreignContracts/ContractsPanel.vue'
import PoaReissueModal from '@/views/broker/company/PoaReissueModal.vue'
import CarriersPanel from '@/views/carriers/CarriersPanel.vue'

// Карточка клиента /clients/:id (редизайн, волна 4а; доска ClientCard): «клиент 360» для сотрудников.
// Шапка, показатели, вкладки (?tab=): обзор, заявки, транзит, документы, счета. Карточка только читается
// (действия — переходы и скачивание бланка), кроме раздела «Реестр документов» во вкладке «Документы»:
// его меняют сотрудники Импорта 40 (import40.read), остальным — просмотр. Вторичные блоки (транзит, счета) грузятся тихо и по праву:
// сбой одного показывает «—» и не ломает карточку.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { statusLabel } = useImport40Status()

// Права: заявки и мастер реквизитов — экран Импорта 40; «Транзит» и «Счета» — свои права.
// 30.10.2026 (аудит S-10): бухгалтеру без операционных прав (isFinanceOnly) guard закрывает /import-40 и /reestr —
// ссылки туда и вкладку «Транзит» не показываем (как на Главной), иначе клик уводит на /finance.
const canImport = computed(() => auth.hasPermission('import40.read') && !auth.isFinanceOnly)
const canReestr = computed(() => auth.hasPermission('reestr.read') && !auth.isFinanceOnly)
const canFinance = computed(() => auth.hasPermission('finance.read'))
// Подпись за AQNIET — администратор или руководитель отдела (как на сервере); мастер подписи — экран Импорта 40.
const canSignProvider = computed(() => (auth.role || '').toLowerCase() === 'administrator' || auth.hasBusinessRole('rop'))
const canOpenSigning = computed(() => canSignProvider.value && canImport.value)
// S-5 (30.10.2026, решение владельца): менять реквизиты и выпускать договор/доверенность — администратор, руководитель,
// декларант (как сервер); бухгалтер и продажи видят реквизиты только для просмотра.
const canEditPapers = computed(() => canImport.value && canEditClientPapers(auth))
// Нет действующего договора (не выпущен или отозван): выпуск прямо из блока, а не через «Изменить реквизиты» (05.11.2026).
const needsContract = computed(() => canEditPapers.value
  && !card.value?.documents.some((d) => d.kind === 'contract' && (d.status === 1 || d.status === 2)))

const id = computed(() => String(route.params.id ?? ''))

// ---- Загрузка карточки ----
type LoadState = 'loading' | 'ready' | 'notFound' | 'error'
const state = ref<LoadState>('loading')
const card = shallowRef<ClientCard | null>(null)
let seq = 0
const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status

// Транзит: последние 25 записей клиента и общее число (для показателя) — одним запросом. Счета — все счета клиента.
const TRANSIT_LIMIT = 25
const reestr = useBlock(canReestr.value, () =>
  reestrApi.getList({ clientId: id.value, page: 1, pageSize: TRANSIT_LIMIT, sortBy: 'createdAt', sortDescending: true }, { silent: true }))
const billing = useBlock(canFinance.value, async () => {
  const clientId = id.value
  return invoicesOf(clientId, await billingApi.list({ clientId }, { silent: true }))
})
// 30.10.2026: счётчик на вкладке «Контракты и перевозчики», как у соседних вкладок (действующие, без архива).
const foreignContracts = useBlock(true, () => foreignContractsApi.list(id.value, { includeArchived: false, silent: true }))
const carriers = useBlock(true, () => carriersApi.list(id.value, { includeArchived: false, silent: true }))
// 30.10.2026 (S-8): реестр документов клиента — для счётчика вкладки «Документы» (без архива, как в панели по умолчанию).
const registryDocs = useBlock(true, () => clientRegistryApi.list(id.value, { includeArchived: false, silent: true }))

const load = async () => {
  const clientId = id.value
  const my = ++seq
  state.value = 'loading'
  card.value = null
  reestr.reset()
  billing.reset()
  foreignContracts.reset()
  carriers.reset()
  registryDocs.reset()
  void reestr.load()
  void billing.load()
  void foreignContracts.load()
  void carriers.load()
  void registryDocs.load()
  try {
    const c = await clientCardApi.card(clientId, { silent: true })
    if (my !== seq) return
    card.value = c
    state.value = 'ready'
  } catch (e) {
    if (my !== seq) return
    const code = statusOf(e)
    state.value = code === 404 || code === 403 || code === 400 ? 'notFound' : 'error'
  }
}
// Пустой id — маршрут уже сменился, а карточка ещё не размонтирована: запрос «/clients//card» не нужен.
watch(id, (v) => { if (v) void load() }, { immediate: true })

const contractHref = (contractId: string) => `/clients/${encodeURIComponent(id.value)}/contracts/${encodeURIComponent(contractId)}`
const carrierHref = (carrierId: string) => `/clients/${encodeURIComponent(id.value)}/carriers/${encodeURIComponent(carrierId)}`

// ---- Вкладки (?tab=) ----
const tabKeys = computed(() => availableTabs({ reestr: canReestr.value, finance: canFinance.value }))
const tab = computed<ClientCardTab>(() => resolveTab(route.query.tab, tabKeys.value))
const setTab = (k: string) => {
  const { tab: _drop, ...rest } = route.query
  void router.replace({ query: k === 'overview' ? rest : { ...rest, tab: k } })
}
const tabItems = computed<ZTabItem[]>(() => {
  const c = card.value
  const count: Partial<Record<ClientCardTab, number | undefined>> = {
    cases: c?.cases.length,
    transit: reestr.data?.totalCount,
    docs: docsTabCount(c?.documents.length, registryDocs.data?.length),
    invoices: billing.data ? liveInvoicesCount(billing.data) : undefined,
    contracts: contractsTabCount(foreignContracts.data?.length, carriers.data?.length),
  }
  return tabKeys.value.map((k) => ({ key: k, label: t(`broker.clientCard.tab.${k}`), count: count[k] }))
})

// ---- Шапка ----
const name = computed(() => (card.value ? cardTitle(card.value) : ''))
const status = computed(() => (card.value ? accountStatusOf(card.value) : null))
const invite = computed(() => (card.value && status.value ? inviteUntil({ status: status.value, inviteExpiresAtUtc: card.value.inviteExpiresAtUtc }) : null))
const crumbs = computed(() => [{ label: t('broker.clientCard.crumbs'), to: '/clients' }, { label: name.value }])
const bin = computed(() => card.value?.bin || card.value?.profile.bin || '')
const email = computed(() => card.value?.email || card.value?.profile.email || '')
const phone = computed(() => formatPhone(card.value?.phone || card.value?.profile.phone || ''))

const editRoute = computed(() => ({ path: '/import-40/company', query: { client: id.value } }))
const poaRoute = computed(() => ({ path: '/import-40/company', query: { client: id.value, step: 'poa' } }))
const signRoute = computed(() => ({ path: '/import-40/company', query: { client: id.value, step: 'contract' } }))
const hasAwaiting = computed(() => !!card.value?.documents.some(awaitingAqniet))
// «Новая ссылка» и блокировка (05.11.2026) — те же права и подтверждения, что в меню строки «Клиентов»: общий код.
const { canInvite, accountItems, inviteOpen, reissue: reissueInvite, onInviteOpen, onAccountAction } = useClientAccountActions(() => load())
const account = computed(() => {
  const c = card.value
  return c && status.value
    ? { id: c.id, status: status.value, email: c.email, username: c.username, bin: bin.value, companyName: c.companyName, phone: c.phone || c.profile.phone }
    : null
})
// «Обновить» — перечитать карточку и блоки (как в прежней карточке).
const menu = computed<ZDropdownItem[]>(() => [
  ...(canOpenSigning.value && hasAwaiting.value ? [{ key: 'sign', label: t('broker.clientCard.menu.sign') }] : []),
  { key: 'docs', label: t('broker.clientCard.menu.docs') },
  { key: 'refresh', label: t('common.refresh') },
  ...(account.value ? accountItems(account.value) : []),
])
const onMenu = (key: string) => {
  if (key === 'sign') void router.push(signRoute.value)
  // «Документы клиента» — вкладка этой карточки, а не общий реестр всех клиентов (30.10.2026, аудит S-2).
  else if (key === 'docs') setTab('docs')
  else if (key === 'refresh') void load()
  else if (account.value) onAccountAction(account.value, key)
}

// ---- Показатели ----
const dash = '—'
const stats = computed<StatItem[]>(() => {
  const c = card.value
  if (!c) return []
  const items: StatItem[] = [
    {
      key: 'active', label: t('broker.clientCard.stat.active'), value: String(c.totals.casesActive),
      hint: t('broker.clientCard.stat.activeHint', { n: c.totals.casesTotal }), tone: c.totals.casesActive > 0 ? 'gold' : null,
    },
    { key: 'done', label: t('broker.clientCard.stat.done'), value: String(c.totals.casesDone), hint: t('broker.clientCard.stat.doneHint') },
  ]
  if (canReestr.value) {
    items.push({
      key: 'transit', label: t('broker.clientCard.stat.transit'),
      value: reestr.data ? String(reestr.data.totalCount) : dash,
      hint: reestr.error ? t('broker.clientCard.stat.unavailable') : reestr.loading ? t('broker.clientCard.stat.loading') : undefined,
    })
  }
  if (canFinance.value) {
    const u = billing.data ? unpaidOf(billing.data) : null
    const pf = (n: number) => pluralForm(n, locale.value)
    items.push({
      key: 'unpaid', label: t('broker.clientCard.stat.unpaid'),
      value: u ? formatMoney(u.sum) : dash,
      hint: billing.error
        ? t('broker.clientCard.stat.unavailable')
        : billing.loading
          ? t('broker.clientCard.stat.loading')
          : u
          ? u.count
            ? [t(`broker.billing.invoices.${pf(u.count)}`, { n: u.count }), u.overdue ? t(`broker.billing.overdue.${pf(u.overdue)}`, { n: u.overdue }) : ''].filter(Boolean).join(' · ')
            : t('broker.clientCard.stat.allPaid')
          : undefined,
      tone: u && u.count ? 'danger' : null,
    })
  }
  return items
})

// ---- Обзор ----
const recent = computed(() => (card.value ? recentCases(card.value.cases) : []))
const overviewDocs = computed(() => (card.value ? currentDocs(card.value.documents) : []))
const contact = computed(() =>
  (card.value ? contactRows(card.value.profile) : []).map((r) => (r.key === 'phone' ? { ...r, value: formatPhone(r.value) } : r)))
const requisites = computed(() => {
  const c = card.value
  if (!c) return []
  const p = c.profile
  const basis = directorBasisOf(p)
  const director = !p.directorName ? dash : basis === dash ? p.directorName : t('broker.clientCard.req.directorBasis', { name: p.directorName, basis })
  const bank = !p.bank ? dash : p.bik ? t('broker.clientCard.req.bankBik', { bank: p.bank, bik: p.bik }) : p.bank
  return [
    { key: 'fullName', value: p.companyName || c.companyName || dash },
    { key: 'legalAddress', value: p.legalAddress || dash },
    // 30.10.2026: у ИП — «Руководитель», а не «Директор».
    { key: isIndividualEntrepreneur(p) ? 'directorIp' : 'director', value: director },
    { key: 'bank', value: bank },
    { key: 'iik', value: p.iik || dash, mono: true },
    { key: 'kbe', value: p.kbe || dash },
    { key: 'login', value: c.username || dash },
  ]
})

// Чего не хватает в реквизитах для договора и доверенности (30.10.2026, аудит C-2).
const missingReq = computed(() =>
  card.value && !card.value.profile.isComplete
    ? joinList(profileMissing(card.value.profile).map((k) => t(REQUISITE_LABEL_KEY[k])), locale.value)
    : '')

// ---- Документы: подписи, срок, скачивание ----
const kindLabel = (d: ClientCardDoc) => t(docKindLabelKey(d.kind))
const docName = (d: ClientCardDoc) => t('broker.clientCard.doc.title', { kind: kindLabel(d), number: d.number, year: d.year })
type Hint = NonNullable<Validity['hint']>
const hintText = (h: Hint) =>
  h.kind === 'overdue' ? t('broker.clientDocs.overdue', { n: h.n }) : h.kind === 'left' ? t('broker.clientDocs.daysLeft', { n: h.n }) : t('broker.clientDocs.noLimit')
// Просрочен — красным, истекает в ближайшие 30 дней — золотым, остальное приглушено.
const hintClass = (h: Hint) => (h.kind === 'overdue' ? 'font-semibold text-tone-danger-fg' : h.kind === 'left' && h.soon ? 'font-semibold text-gold-ink' : 'text-muted')
/** «многоразовый · до 31.12.2026 · осталось 84 дн.» — строка под названием документа. */
const docSub = (d: ClientCardDoc): string => {
  const v = validity(d)
  return [
    d.isSingleUse ? t('broker.clientCard.doc.singleUse') : d.kind === 'contract' ? t('broker.clientCard.doc.multiUse') : '',
    d.validUntilUtc ? t('broker.clientCard.doc.until', { date: v.date }) : '',
    v.hint ? hintText(v.hint) : '',
  ].filter(Boolean).join(' · ')
}
const signs = (d: ClientCardDoc) => {
  const line = (key: string, who: string, signed: boolean, method: string | null, at: string | null) => ({
    key,
    on: signed,
    text: signed
      ? t('broker.clientCard.doc.signed', { who, method: t(signMethodLabelKey(method)), date: formatDay(at) })
      : t('broker.clientCard.doc.notSigned', { who }),
  })
  return [
    line('client', t('broker.clientCard.doc.client'), d.clientSigned, d.clientSignMethod, d.clientSignedAtUtc),
    ...(d.kind === 'contract' ? [line('provider', t('broker.clientCard.doc.aqniet'), d.providerSigned, d.providerSignMethod, d.providerSignedAtUtc)] : []),
  ]
}
const canSignDoc = (d: ClientCardDoc) => canOpenSigning.value && awaitingAqniet(d)
// «Выпустить новую» доверенность — не нужна, если следующая уже выпущена (с 1 декабря — автоматически).
// M-8 (30.10.2026): под текущей доверенностью — следующая (на следующий год), если она уже выпущена.
const nextPoaLine = (d: ClientCardDoc): string => {
  if (d.kind !== 'poa') return ''
  const n = nextPoaOf(card.value?.documents ?? [], d)
  if (!n) return ''
  const params = { number: `${n.number}/${n.year}`, date: validity(n).date }
  return t(n.status === 1 ? 'broker.clientCard.doc.nextPoaAwaiting' : 'broker.clientCard.doc.nextPoaActive', params)
}
// «Перевыпустить» (02.11.2026, пакет I) — права и место как у «Продлить» договора: администратор или руководитель, у текущей
// многоразовой доверенности в любое время срока. Декларанту окно закрыто на сервере: то же название ведёт на шаг выпуска
// доверенности (срок истекает, 05.11.2026 — название одно).
const canReissue = (d: ClientCardDoc) => canSignProvider.value && reissuablePoa(card.value?.documents ?? [], d)
const canReissuePoa = (d: ClientCardDoc) => canEditPapers.value && canRenewPoa(d) && !hasNextPoa(card.value?.documents ?? [], d) && !canReissue(d)
const reissueDoc = ref<ClientCardDoc | null>(null)
const reissueOpen = ref(false)
const reissue = (d: ClientCardDoc) => {
  reissueDoc.value = d
  reissueOpen.value = true
}
/** «Заменена доверенностью № 0008/2026» — у прежней после подписи перевыпущенной. */
const replacedLine = (d: ClientCardDoc) => (d.replacedBy ? t('broker.company.reissue.replacedBy', { no: d.replacedBy }) : '')

// «Продлить» многоразовый договор (30.10.2026): до 31.12 следующего года; администратор или руководитель,
// за 60 дней до конца срока и 30 после (как на сервере).
const { confirm } = useConfirm()
const canExtend = (d: ClientCardDoc) => canSignProvider.value && canRenewContract(d)
const { extending, extend: extendContract } = useContractExtend(() => load())
const extend = (d: ClientCardDoc) => extendContract(id.value, d)
// Договор истекает, а продлить могут другие: декларанту говорим, кто (05.11.2026), вместо немого тега «Истекает».
const extendHint = (d: ClientCardDoc) => canEditPapers.value && !canSignProvider.value && canRenewContract(d)

// Бланк сервер собирает по данным клиента на момент запроса; ошибку показывает перехватчик.
const downloading = ref<string | null>(null)
const downloadBlank = async (d: ClientCardDoc, format?: 'pdf') => {
  if (downloading.value) return
  downloading.value = format ? `${d.id}:pdf` : d.id
  try {
    saveBlob(await import40ContractApi.downloadDocument(id.value, d.id, format), blankFileName(kindLabel(d), d, format ?? 'docx'))
  } catch {
    // тост показал общий перехватчик
  } finally {
    downloading.value = null
  }
}

// ---- Вкладка «Заявки» ----
const query = ref('')
const page = ref(1)
watch(query, () => { page.value = 1 })
// Другой клиент — поиск и страница заявок с начала (фильтр прежнего клиента не переносится).
watch(id, () => { query.value = ''; page.value = 1 })
const caseRows = computed(() => (card.value ? card.value.cases.filter((c) => matchesCase(query.value, c)) : []))
const caseColumns = computed<ZColumn<ClientCardCase>[]>(() => [
  { key: 'case', title: t('broker.clientCard.cases.col.case'), width: 320 },
  { key: 'status', title: t('broker.clientCard.cases.col.status'), width: 190 },
  { key: 'dt', title: t('broker.clientCard.cases.col.dt'), width: 70, align: 'right' },
  { key: 'svh', title: t('broker.clientCard.cases.col.svh'), width: 210, align: 'right' },
  { key: 'created', title: t('broker.clientCard.cases.col.created'), width: 120, align: 'right', className: 'max-sm:hidden' },
])
const casePagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))
const caseRow = (c: ClientCardCase) => (canImport.value
  ? {
      class: 'cursor-pointer',
      onClick: (e: MouseEvent) => {
        if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
        void router.push(`/import-40/${c.id}`)
      },
    }
  : {})

// ---- Вкладка «Документы» ----
const docColumns = computed<ZColumn<ClientCardDoc>[]>(() => [
  { key: 'doc', title: t('broker.clientCard.doc.col.doc'), width: 230 },
  { key: 'status', title: t('broker.clientCard.doc.col.status'), width: 170 },
  { key: 'validity', title: t('broker.clientCard.doc.col.validity'), width: 170 },
  { key: 'signs', title: t('broker.clientCard.doc.col.signs'), width: 250 },
  { key: 'actions', title: '', width: 200, align: 'right' },
])
// Один список действий документа (05.11.2026): «Обзор» показывает его кнопками, вкладка «Документы» — главной кнопкой и
// меню ⋯. Порядок — по важности: первое действие и есть главная кнопка строки.
type DocAction = 'sign' | 'extend' | 'reissue' | 'renew' | 'blank' | 'pdf' | 'verify'
const docActions = (d: ClientCardDoc): DocAction[] => {
  const out: DocAction[] = []
  if (canSignDoc(d)) out.push('sign')
  if (canExtend(d)) out.push('extend')
  if (canReissue(d)) out.push('reissue')
  if (canReissuePoa(d)) out.push('renew')
  if (canImport.value) out.push('blank', 'pdf')
  if (canImport.value && d.verifyUrl) out.push('verify')
  return out
}
const docActionLabel = (a: DocAction, d: ClientCardDoc): string => {
  if (a === 'sign') return t('broker.clientCard.doc.sign')
  if (a === 'extend') return t('broker.clientCard.doc.extend')
  if (a === 'blank') return t(docDownloadKey(d))
  if (a === 'pdf') return 'PDF'
  if (a === 'verify') return t('broker.company.verifyLink')
  return t('broker.company.reissue.action') // reissue и renew: одно действие для сотрудника, разный только путь
}
const docPrimary = (d: ClientCardDoc): RowPrimary | null => {
  const a = docActions(d)[0]
  if (!a) return null
  const loading = a === 'extend' ? extending.value === d.id : a === 'blank' ? downloading.value === d.id : undefined
  return { key: a, label: docActionLabel(a, d), variant: a === 'blank' ? 'outline' : 'primary', loading }
}
// Отзыв — редкое и необратимое действие: только в меню ⋯, только администратору (05.11.2026).
const isAdmin = computed(() => (auth.role || '').toLowerCase() === 'administrator')
const DOC_REVOKED = 4
const revokeItems = (d: ClientCardDoc): ZDropdownItem[] =>
  isAdmin.value && d.status !== DOC_REVOKED ? [{ key: 'revoke', label: t('broker.company.revoke'), danger: true }] : []
const revokeDoc = async (d: ClientCardDoc) => {
  const c = card.value
  if (!c) return
  const ok = await confirm({
    title: t('broker.company.revokeTitle', { no: `${d.number}/${d.year}` }),
    content: t('broker.clientCard.doc.revokeConfirm', { company: c.companyName || c.username, n: c.totals.casesActive }),
    okText: t('broker.company.revoke'),
    danger: true,
  })
  if (!ok) return
  try {
    await import40ContractApi.revokeDocument(id.value, d.id)
    message.success(t('broker.company.revoked'))
    await load()
  } catch {
    // тост показал общий перехватчик
  }
}
const docItems = (d: ClientCardDoc): ZDropdownItem[] => [
  ...docActions(d).slice(1).map((a) => ({ key: a, label: docActionLabel(a, d) })),
  ...revokeItems(d),
]
const onDocAction = (d: ClientCardDoc, key: string) => {
  if (key === 'sign') void router.push(signRoute.value)
  else if (key === 'extend') void extend(d)
  else if (key === 'reissue') reissue(d)
  else if (key === 'renew') void router.push(poaRoute.value)
  else if (key === 'blank') void downloadBlank(d)
  else if (key === 'pdf') void downloadBlank(d, 'pdf')
  else if (key === 'verify' && d.verifyUrl) window.open(d.verifyUrl, '_blank', 'noopener')
  else if (key === 'revoke') void revokeDoc(d)
}

// ---- Вкладка «Транзит» ----
const transitColumns = computed<ZColumn<ReestrEntry>[]>(() => [
  { key: 'no', title: t('broker.clientCard.transit.col.no'), width: 90 },
  { key: 'status', title: t('broker.clientCard.transit.col.status'), width: 170 },
  { key: 'container', title: t('broker.clientCard.transit.col.container'), width: 190 },
  { key: 'cargo', title: t('broker.clientCard.transit.col.cargo'), width: 300 },
  { key: 'date', title: t('broker.clientCard.transit.col.date'), width: 120, align: 'right' },
])
// Строка — страница записи /reestr/:id, а не поиск по контейнеру (30.10.2026, аудит S-4): поиск не сбрасывал
// прежние фильтры транзита, и запись могла не найтись. «Все записи клиента» — список с фильтром по клиенту.
const transitTo = (e: ReestrEntry) => (e.id ? `/reestr/${encodeURIComponent(e.id)}` : null)
const transitAllTo = computed(() => ({ path: '/reestr', query: { client: id.value } }))
const transitRow = (e: ReestrEntry) => {
  const to = transitTo(e)
  return to
    ? {
        class: 'cursor-pointer',
        onClick: (ev: MouseEvent) => {
          if ((ev.target as HTMLElement | null)?.closest('a,button,input,label')) return
          void router.push(to)
        },
      }
    : {}
}
const containerText = (e: ReestrEntry) => {
  const v = e.data[DATA_KEY.container]
  return v && v.trim() ? formatContainer(v) : dash
}

// ---- Вкладка «Счета» ----
const invoiceColumns = computed<ZColumn<BrokerInvoice>[]>(() => [
  { key: 'doc', title: t('broker.clientCard.invoices.col.doc'), width: 240 },
  { key: 'status', title: t('broker.clientCard.invoices.col.status'), width: 150 },
  { key: 'total', title: t('broker.clientCard.invoices.col.total'), width: 150, align: 'right' },
  { key: 'dates', title: t('broker.clientCard.invoices.col.dates'), width: 260 },
])
/** Даты счёта: выставлен, оплачен или срок / просрочен. */
const invoiceDates = (r: BrokerInvoice) => {
  const out: { key: string; text: string; bad?: boolean }[] = []
  if (r.issuedAtUtc) out.push({ key: 'issued', text: t('broker.billing.date.issued', { date: formatDay(r.issuedAtUtc) }) })
  if (r.paidAtUtc) out.push({ key: 'paid', text: t('broker.billing.date.paid', { date: formatDay(r.paidAtUtc) }) })
  else if (dueDay(r.dueDateUtc)) {
    const n = overdueDays(r)
    out.push(n
      ? { key: 'overdue', text: t('broker.billing.date.overdue', { n }), bad: true }
      : { key: 'due', text: t('broker.billing.date.due', { date: formatDay(dueDay(r.dueDateUtc)) }) })
  }
  return out
}

// Ссылки-кнопки: единый вид (фокус, цель 44px на телефоне).
const link = 'inline-flex min-h-8 cursor-pointer items-center rounded-field border-0 bg-transparent px-1 font-sans text-xs font-medium text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11'
const panel = 'rounded-panel border border-line bg-surface px-[18px] py-4'
const panelTitle = 'm-0 text-sm font-semibold text-ink'
const OUTLINE = 'border border-line-strong bg-surface enabled:hover:bg-sunken'
const tableClass = 'overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent'
const tableWidth = (cols: { width?: number | string }[]) => cols.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0)
</script>

<template>
  <div class="flex flex-col gap-[18px]" data-client-card>
    <!-- Загрузка: скелетоны по форме карточки -->
    <div v-if="state === 'loading'" class="flex flex-col gap-[18px]" aria-busy="true" data-card-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="180px" height="13px" />
        <div class="flex items-center gap-4">
          <ZSkeleton width="48px" height="48px" />
          <div class="flex-1"><ZSkeleton width="min(380px, 80%)" height="28px" /></div>
        </div>
        <ZSkeleton width="min(520px, 90%)" height="14px" />
      </div>
      <ZSkeleton height="88px" />
      <ZSkeleton width="min(420px, 100%)" height="36px" />
      <div class="flex flex-wrap items-start gap-[18px]">
        <div class="flex min-w-0 flex-[999_1_480px] flex-col gap-4"><ZSkeleton height="180px" /><ZSkeleton height="220px" /></div>
        <div class="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5"><ZSkeleton height="240px" /><ZSkeleton height="120px" /></div>
      </div>
    </div>

    <div v-else-if="state === 'notFound'" class="rounded-panel border border-dashed border-line-strong" data-card-not-found>
      <ZEmpty :title="t('broker.clientCard.notFound')" :hint="t('broker.clientCard.notFoundHint')">
        <template #action>
          <RouterLink
            to="/clients"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
            data-card-to-list
          >{{ t('broker.clientCard.toList') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="state === 'error'" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-card-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.clientCard.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-card-retry @click="load">{{ t('broker.clientCard.retry') }}</ZButton>
    </div>

    <template v-else-if="card">
      <header class="flex flex-col gap-2.5" data-card-header>
        <ZBreadcrumbs :items="crumbs" />
        <!-- На телефоне — сетка: «⋯» в строке названия справа, «Изменить реквизиты» во всю ширину под мета-строкой. -->
        <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 sm:flex sm:flex-wrap" data-card-head>
          <ZAvatar :name="name" class="size-12 rounded-[14px] text-base" />
          <div class="min-w-0 sm:flex-1 sm:basis-72">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 class="m-0 min-w-0 text-[23px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink [overflow-wrap:anywhere] sm:text-2xl" data-card-title>{{ name }}</h1>
              <span v-if="status" class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <ZTag :tone="clientStatusTone(status)" data-card-status>{{ t(clientStatusLabelKey(status)) }}</ZTag>
                <template v-if="invite">
                  <span v-if="invite.expired" class="text-xs text-gold-ink" data-card-expired>{{ t('admin.ssylkaIstekla') }}</span>
                  <span v-else class="text-xs text-muted" data-card-until>{{ t('admin.doDate', { date: invite.date }) }}</span>
                </template>
              </span>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-3" data-card-meta>
              <span v-if="bin" class="inline-flex min-w-0 items-center gap-1.5" data-meta="bin">
                <PhBuildings :size="15" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="sr-only">{{ t('broker.clientCard.meta.bin') }}:</span>
                <span>{{ t('broker.clientCard.meta.bin') }} <span class="font-mono">{{ bin }}</span></span>
              </span>
              <span v-if="email" class="inline-flex min-w-0 items-center gap-1.5" data-meta="email">
                <PhEnvelopeSimple :size="15" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="sr-only">{{ t('broker.clientCard.meta.email') }}:</span>
                <span class="min-w-0 [overflow-wrap:anywhere]">{{ email }}</span>
              </span>
              <span v-if="phone" class="inline-flex min-w-0 items-center gap-1.5" data-meta="phone">
                <PhPhone :size="15" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="sr-only">{{ t('broker.clientCard.meta.phone') }}:</span>
                <span>{{ phone }}</span>
              </span>
              <span class="inline-flex min-w-0 items-center gap-1.5" data-meta="since">
                <PhClock :size="15" class="shrink-0 text-muted" aria-hidden="true" />
                <span>{{ t('broker.clientCard.since', { date: formatDay(card.createdAtUtc) }) }}</span>
              </span>
            </div>
          </div>
          <div class="contents sm:flex sm:shrink-0 sm:items-center sm:gap-2" data-card-actions>
            <RouterLink
              v-if="canImport"
              :to="editRoute"
              :class="[
                'inline-flex h-9 items-center justify-center rounded-field px-3.5 text-sm font-semibold whitespace-nowrap text-ink no-underline outline-hidden focus-visible:shadow-focus',
                'max-sm:col-span-3 max-sm:row-start-2 max-sm:h-11 max-sm:w-full',
                OUTLINE,
              ]"
              data-card-edit
            >{{ t(canEditPapers ? 'broker.clientCard.editRequisites' : 'broker.company.step.requisites') }}</RouterLink>
            <ZDropdown :items="menu" @select="onMenu">
              <button
                type="button"
                :aria-label="t('broker.clientCard.more')"
                :title="t('broker.clientCard.more')"
                class="inline-flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:col-start-3 max-sm:row-start-1 max-sm:-mr-2 max-sm:size-11"
                data-card-more
              >
                <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
              </button>
            </ZDropdown>
          </div>
        </div>
      </header>

      <StatStrip :items="stats" data-card-stats />

      <ZTabs variant="line" :active-key="tab" :items="tabItems" :aria-label="t('broker.clientCard.tabsLabel')" data-card-tabs @change="setTab">
        <template #default="{ key }">
          <!-- ① Обзор -->
          <div v-if="key === 'overview'" class="flex flex-wrap items-start gap-[18px]" data-tab-panel="overview">
            <div class="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
              <section aria-labelledby="card-recent-title" :class="panel" data-card-recent>
                <div class="mb-1 flex items-center gap-2">
                  <h2 id="card-recent-title" :class="panelTitle">{{ t('broker.clientCard.overview.recent') }}</h2>
                  <button
                    v-if="card.cases.length > recent.length"
                    type="button"
                    :class="[link, 'ml-auto']"
                    data-card-all-cases
                    @click="setTab('cases')"
                  >{{ t('broker.clientCard.overview.all', { n: card.cases.length }) }}</button>
                </div>
                <p v-if="!recent.length" class="m-0 py-2 text-sm text-muted" data-card-no-cases>{{ t('broker.clientCard.overview.noCases') }}</p>
                <ul v-else class="m-0 list-none p-0">
                  <li
                    v-for="(c, i) in recent"
                    :key="c.id"
                    :class="['flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 max-sm:min-h-11', i > 0 && 'border-t border-line']"
                    data-recent-case
                  >
                    <RouterLink
                      v-if="canImport"
                      :to="`/import-40/${c.id}`"
                      class="w-[116px] shrink-0 rounded-[4px] font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus"
                    >{{ c.number }}</RouterLink>
                    <span v-else class="w-[116px] shrink-0 font-mono text-sm font-medium text-ink">{{ c.number }}</span>
                    <span class="min-w-0 flex-[1_1_10rem] truncate text-sm text-ink-2" :title="c.cargo">{{ c.cargo || dash }}</span>
                    <ZTag :tone="caseTone(c)">{{ statusLabel(c.status) }}</ZTag>
                  </li>
                </ul>
              </section>

              <section aria-labelledby="card-req-title" :class="panel" data-card-requisites>
                <div class="mb-2.5 flex flex-wrap items-center gap-2">
                  <h2 id="card-req-title" :class="panelTitle">{{ t('broker.clientCard.overview.requisites') }}</h2>
                  <ZTag size="sm" :tone="card.profile.isComplete ? 'done' : 'wait'" data-card-complete>
                    {{ card.profile.isComplete ? t('broker.clientCard.req.complete') : t('broker.clientCard.req.incomplete') }}
                  </ZTag>
                  <RouterLink v-if="canEditPapers" :to="editRoute" :class="[link, 'ml-auto']" data-card-edit-requisites>{{ t('broker.clientCard.overview.edit') }}</RouterLink>
                </div>
                <p v-if="missingReq" class="m-0 mb-2 text-[13px] text-gold-ink" data-card-missing>{{ t('broker.company.missingList', { list: missingReq }) }}</p>
                <dl class="m-0">
                  <div
                    v-for="(r, i) in requisites"
                    :key="r.key"
                    :class="['grid grid-cols-[104px_minmax(0,1fr)] gap-2.5 py-1.5 text-[13px]', i > 0 && 'border-t border-line']"
                    :data-req="r.key"
                  >
                    <dt class="text-muted">{{ t(`broker.clientCard.req.${r.key}`) }}</dt>
                    <dd :class="['m-0 min-w-0 text-ink [overflow-wrap:anywhere]', r.mono && 'font-mono']">{{ r.value }}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <div class="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
              <section aria-labelledby="card-docs-title" :class="panel" data-card-docs>
                <h2 id="card-docs-title" :class="[panelTitle, 'mb-2.5']">{{ t('broker.clientCard.overview.docs') }}</h2>
                <RouterLink
                  v-if="needsContract"
                  :to="signRoute"
                  class="mb-2.5 inline-flex h-8 items-center rounded-field bg-navy px-3 text-sm font-semibold text-white no-underline outline-hidden focus-visible:shadow-focus max-sm:h-11 max-sm:px-4"
                  data-card-issue-contract
                >{{ t('broker.clientCard.overview.issueContract') }}</RouterLink>
                <p v-if="!overviewDocs.length" class="m-0 text-sm text-muted" data-card-no-docs>{{ t('broker.clientCard.overview.noDocs') }}</p>
                <ul v-else class="m-0 flex list-none flex-col gap-2.5 p-0">
                  <li v-for="d in overviewDocs" :key="d.id" class="flex flex-col gap-2 rounded-row border border-line p-3.5" :data-doc-card="d.kind">
                    <div class="flex items-center gap-2">
                      <PhFileText :size="16" class="shrink-0 text-muted" aria-hidden="true" />
                      <span class="min-w-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]" data-doc-title>{{ docName(d) }}</span>
                      <ZTag class="ml-auto" :tone="docTag(d).tone" data-doc-status>{{ t(docTag(d).labelKey) }}</ZTag>
                    </div>
                    <div v-if="docSub(d)" class="text-[12.5px] text-ink-3" data-doc-sub>{{ docSub(d) }}</div>
                    <div v-if="nextPoaLine(d)" class="text-[12.5px] font-medium text-gold-ink" data-doc-next-poa>{{ nextPoaLine(d) }}</div>
                    <ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px]">
                      <li v-for="s in signs(d)" :key="s.key" :class="['inline-flex items-center gap-1.5', s.on ? 'text-ink-2' : 'text-muted']" :data-sign="s.key" :data-signed="s.on">
                        <PhCheck v-if="s.on" :size="14" weight="bold" class="shrink-0 text-tone-done-fg" aria-hidden="true" /><span v-else aria-hidden="true">—</span>
                        <span>{{ s.text }}</span>
                      </li>
                    </ul>
                    <div v-if="replacedLine(d)" class="text-[12.5px] text-ink-3" data-doc-replaced>{{ replacedLine(d) }}</div>
                    <div v-if="extendHint(d)" class="text-[12.5px] text-ink-3" data-doc-extend-hint>{{ t('broker.clientCard.doc.extendHint') }}</div>
                    <div v-if="docActions(d).length || revokeItems(d).length" class="flex flex-wrap gap-2">
                      <template v-for="a in docActions(d)" :key="a">
                        <RouterLink
                          v-if="a === 'sign'"
                          :to="signRoute"
                          class="inline-flex h-8 items-center rounded-field bg-navy px-3 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11 max-sm:px-4"
                          data-doc-sign
                        >{{ docActionLabel(a, d) }}</RouterLink>
                        <ZButton
                          v-else-if="a === 'extend'"
                          size="sm"
                          variant="primary"
                          :loading="extending === d.id"
                          class="max-sm:h-11 max-sm:px-4"
                          data-doc-extend
                          @click="extend(d)"
                        >{{ docActionLabel(a, d) }}</ZButton>
                        <ZButton
                          v-else-if="a === 'reissue'"
                          size="sm"
                          variant="primary"
                          class="max-sm:h-11 max-sm:px-4"
                          data-doc-reissue
                          @click="reissue(d)"
                        >{{ docActionLabel(a, d) }}</ZButton>
                        <RouterLink
                          v-else-if="a === 'renew'"
                          :to="poaRoute"
                          :class="['inline-flex h-8 items-center rounded-field px-3 text-sm font-semibold text-ink no-underline outline-hidden focus-visible:shadow-focus max-sm:h-11 max-sm:px-4', OUTLINE]"
                          data-doc-renew
                        >{{ docActionLabel(a, d) }}</RouterLink>
                        <ZButton
                          v-else-if="a === 'blank'"
                          size="sm"
                          :loading="downloading === d.id"
                          :disabled="downloading !== null && downloading !== d.id"
                          :class="['max-sm:h-11 max-sm:px-4', OUTLINE]"
                          data-doc-blank
                          @click="downloadBlank(d)"
                        >
                          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
                          {{ docActionLabel(a, d) }}
                        </ZButton>
                        <ZButton
                          v-else-if="a === 'pdf'"
                          size="sm"
                          :loading="downloading === `${d.id}:pdf`"
                          :disabled="downloading !== null && downloading !== `${d.id}:pdf`"
                          :class="['max-sm:h-11 max-sm:px-4', OUTLINE]"
                          data-doc-pdf
                          @click="downloadBlank(d, 'pdf')"
                        >
                          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
                          {{ docActionLabel(a, d) }}
                        </ZButton>
                        <a
                          v-else-if="a === 'verify'"
                          :href="d.verifyUrl ?? undefined"
                          target="_blank"
                          rel="noopener"
                          class="inline-flex h-8 items-center gap-1.5 rounded-field px-2 text-sm font-medium text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:h-11"
                          data-doc-verify
                        ><PhQrCode :size="16" aria-hidden="true" />{{ docActionLabel(a, d) }}</a>
                      </template>
                      <ZDropdown v-if="revokeItems(d).length" :items="revokeItems(d)" @select="onDocAction(d, $event)">
                        <button
                          type="button"
                          :aria-label="t('broker.clientCard.more')"
                          :title="t('broker.clientCard.more')"
                          class="inline-flex size-8 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken focus-visible:shadow-focus max-sm:size-11"
                          data-doc-more
                        >
                          <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
                        </button>
                      </ZDropdown>
                    </div>
                  </li>
                </ul>
              </section>

              <section aria-labelledby="card-contact-title" :class="panel" data-card-contact>
                <h2 id="card-contact-title" :class="[panelTitle, 'mb-2.5']">{{ t('broker.clientCard.overview.contact') }}</h2>
                <p v-if="!contact.length" class="m-0 text-sm text-muted" data-card-no-contact>{{ t('broker.clientCard.overview.noContact') }}</p>
                <dl v-else class="m-0">
                  <div
                    v-for="(r, i) in contact"
                    :key="r.key"
                    :class="['grid grid-cols-[124px_minmax(0,1fr)] gap-2.5 py-1.5 text-[13px]', i > 0 && 'border-t border-line']"
                    :data-contact="r.key"
                  >
                    <dt class="text-muted">{{ t(`broker.clientCard.contact.${r.key}`) }}</dt>
                    <dd class="m-0 min-w-0 text-ink [overflow-wrap:anywhere]">{{ r.value }}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>

          <!-- ② Заявки -->
          <div v-else-if="key === 'cases'" class="flex flex-col gap-3" data-tab-panel="cases">
            <div class="flex flex-wrap items-center gap-2">
              <ListSearch :value="query" :placeholder="t('broker.clientCard.cases.search')" @update:value="query = $event" />
            </div>
            <ZTable
              :columns="caseColumns"
              :data-source="caseRows"
              row-key="id"
              :custom-row="caseRow"
              :pagination="casePagination"
              :scroll="{ x: tableWidth(caseColumns) }"
              :aria-label="t('broker.clientCard.cases.tableLabel')"
              :class="tableClass"
              data-cases-table
            >
              <template #bodyCell="{ column, record }">
                <span v-if="column.key === 'case'" class="block min-w-0">
                  <RouterLink
                    v-if="canImport"
                    :to="`/import-40/${record.id}`"
                    :aria-label="t('broker.clientCard.cases.open', { number: record.number })"
                    class="rounded-[4px] font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus"
                    data-case-open
                  >{{ record.number }}</RouterLink>
                  <span v-else class="font-mono text-sm font-medium text-ink">{{ record.number }}</span>
                  <span class="block truncate text-sm text-ink-2" :title="record.cargo">{{ record.cargo || dash }}</span>
                  <span class="block truncate text-xs text-muted">{{ record.post || dash }}</span>
                </span>
                <ZTag v-else-if="column.key === 'status'" :tone="caseTone(record)" data-case-status>{{ statusLabel(record.status) }}</ZTag>
                <span v-else-if="column.key === 'dt'" class="text-sm tabular-nums text-ink-2">{{ record.declarationsCount || dash }}</span>
                <span v-else-if="column.key === 'svh'" class="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <span v-if="record.svhInvoiceAmount != null" class="text-sm tabular-nums text-ink-2">{{ formatMoney(record.svhInvoiceAmount) }}</span>
                  <span v-else class="text-sm text-muted">{{ dash }}</span>
                  <ZTag v-if="record.paymentConfirmed" tone="done" size="sm">{{ t('broker.clientCard.cases.paid') }}</ZTag>
                </span>
                <span v-else-if="column.key === 'created'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ formatDay(record.createdAtUtc) }}</span>
              </template>
              <template #emptyText>
                <ZEmpty :title="query.trim() ? t('broker.list.nothingFound') : t('broker.clientCard.cases.empty')" :hint="query.trim() ? t('broker.list.nothingFoundHint') : undefined" />
              </template>
            </ZTable>
          </div>

          <!-- ③ Транзит -->
          <div v-else-if="key === 'transit'" class="flex flex-col gap-3" data-tab-panel="transit">
            <div v-if="reestr.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-transit-error>
              <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.clientCard.transit.loadError') }}</p>
              <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-transit-retry @click="reestr.load()">{{ t('broker.clientCard.retry') }}</ZButton>
            </div>
            <template v-else>
              <ZTable
                :columns="transitColumns"
                :data-source="reestr.data?.items ?? []"
                row-key="id"
                :loading="reestr.loading"
                :custom-row="transitRow"
                :pagination="false"
                :scroll="{ x: tableWidth(transitColumns) }"
                :aria-label="t('broker.clientCard.transit.tableLabel')"
                :class="tableClass"
                data-transit-table
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'no'">
                    <RouterLink
                      v-if="transitTo(record)"
                      :to="transitTo(record)!"
                      :aria-label="t('broker.clientCard.transit.open', { value: transitQuery(record) || cellText(record, 'no') })"
                      class="rounded-[4px] font-mono text-sm text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus"
                      data-transit-open
                    >{{ cellText(record, 'no') }}</RouterLink>
                    <span v-else class="font-mono text-sm text-ink">{{ cellText(record, 'no') }}</span>
                  </template>
                  <StatusDot v-else-if="column.key === 'status'" :tone="reestrStatusTone(record.status)" :label="t(`enum.reestrStatus.${reestrStatusKey(record.status)}`)" />
                  <span v-else-if="column.key === 'container'" class="font-mono text-sm text-ink-2">{{ containerText(record) }}</span>
                  <span v-else-if="column.key === 'cargo'" class="block truncate text-sm text-ink-2" :title="cellText(record, 'cargo')">{{ cellText(record, 'cargo') }}</span>
                  <span v-else-if="column.key === 'date'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ cellText(record, 'date') }}</span>
                </template>
                <template #emptyText>
                  <ZEmpty :title="t('broker.clientCard.transit.empty')" />
                </template>
              </ZTable>
              <div v-if="reestr.data && reestr.data.totalCount > 0" class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p v-if="reestr.data.totalCount > reestr.data.items.length" class="m-0 text-[13px] text-muted" data-transit-shown>
                  {{ t('broker.clientCard.transit.shown', { n: reestr.data.items.length, total: reestr.data.totalCount }) }}
                </p>
                <RouterLink :to="transitAllTo" :class="[link, 'ml-auto']" data-transit-all>{{ t('broker.clientCard.transit.all') }}</RouterLink>
              </div>
            </template>
          </div>

          <!-- ④ Документы -->
          <div v-else-if="key === 'docs'" class="flex flex-col gap-4" data-tab-panel="docs">
            <ZTable
              :columns="docColumns"
              :data-source="card.documents"
              row-key="id"
              :pagination="false"
              :scroll="{ x: tableWidth(docColumns) }"
              :aria-label="t('broker.clientCard.doc.tableLabel')"
              :class="tableClass"
              data-docs-table
            >
              <template #bodyCell="{ column, record }">
                <span v-if="column.key === 'doc'" class="block min-w-0">
                  <span class="block text-sm font-semibold text-ink" data-doc-title>{{ docName(record) }}</span>
                  <span class="block text-xs text-muted">{{ t('broker.clientCard.doc.generated', { date: formatDay(record.generatedAtUtc) }) }}</span>
                  <span v-if="replacedLine(record)" class="block text-xs text-ink-3" data-doc-replaced>{{ replacedLine(record) }}</span>
                </span>
                <span v-else-if="column.key === 'status'" class="inline-flex flex-wrap items-center gap-1.5">
                  <ZTag :tone="docTag(record).tone" data-doc-status>{{ t(docTag(record).labelKey) }}</ZTag>
                  <ZTag v-if="record.isSingleUse" tone="accent">{{ t('admin.razovyy') }}</ZTag>
                </span>
                <span v-else-if="column.key === 'validity'" class="block text-sm">
                  <span :class="validity(record).date === dash ? 'text-muted' : 'tabular-nums text-ink-2'">{{ validity(record).date }}</span>
                  <span v-if="validity(record).hint" :class="['block text-xs', hintClass(validity(record).hint!)]">{{ hintText(validity(record).hint!) }}</span>
                  <span v-if="extendHint(record)" class="block text-xs text-ink-3" data-doc-extend-hint>{{ t('broker.clientCard.doc.extendHint') }}</span>
                </span>
                <span v-else-if="column.key === 'signs'" class="block text-[13px]">
                  <span v-for="s in signs(record)" :key="s.key" :class="['flex items-center gap-1.5', s.on ? 'text-ink-2' : 'text-muted']" :data-sign="s.key" :data-signed="s.on">
                    <PhCheck v-if="s.on" :size="14" weight="bold" class="shrink-0 text-tone-done-fg" aria-hidden="true" /><span v-else aria-hidden="true">—</span>
                    <span>{{ s.text }}</span>
                  </span>
                  <DocSignedFiles v-if="record.files?.length" :client-id="card.id" :doc-id="record.id" :files="record.files" class="mt-0.5" />
                  <span v-else-if="record.filesCount" class="mt-0.5 block text-xs text-muted">{{ t('broker.clientCard.doc.files', { n: record.filesCount }) }}</span>
                </span>
                <RowActions
                  v-else-if="column.key === 'actions'"
                  :primary="docPrimary(record)"
                  :items="docItems(record)"
                  :label="docName(record)"
                  @action="onDocAction(record, $event)"
                />
              </template>
              <template #emptyText>
                <ZEmpty :title="t('broker.clientCard.doc.empty')" />
              </template>
            </ZTable>
            <!-- Реестр документов клиента (волна 17.10): контракты, УНК, сертификаты, разрешения — рядом с договором и доверенностью -->
            <ClientRegistryPanel :client-id="card.id" :readonly="!canImport" />
          </div>

          <!-- Внешнеторговые контракты клиента и валютный контроль (17.10) -->
          <div v-else-if="key === 'contracts'" class="flex flex-col gap-3" data-tab-panel="contracts">
            <ContractsPanel :client-id="card.id" :href="contractHref" :readonly="!canImport" />
            <!-- Перевозчики клиента: договоры перевозки и счета за фрахт (очередь 4) -->
            <CarriersPanel :client-id="card.id" :href="carrierHref" :readonly="!canImport" />
          </div>

          <!-- ⑤ Счета -->
          <div v-else-if="key === 'invoices'" class="flex flex-col gap-3" data-tab-panel="invoices">
            <div v-if="billing.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-invoices-error>
              <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.clientCard.invoices.loadError') }}</p>
              <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-invoices-retry @click="billing.load()">{{ t('broker.clientCard.retry') }}</ZButton>
            </div>
            <template v-else>
              <div class="flex">
                <!-- Все счета ЭТОГО клиента (30.10.2026, аудит S-3/C-32): «Счета и акты» с фильтром по клиенту. -->
                <RouterLink :to="{ path: '/billing', query: { client: id } }" :class="[link, 'ml-auto']" data-invoices-all>{{ t('broker.clientCard.invoices.all') }}</RouterLink>
              </div>
              <ZTable
                :columns="invoiceColumns"
                :data-source="billing.data ?? []"
                row-key="id"
                :loading="billing.loading"
                :scroll="{ x: tableWidth(invoiceColumns) }"
                :aria-label="t('broker.clientCard.invoices.tableLabel')"
                :class="tableClass"
                data-invoices-table
              >
                <template #bodyCell="{ column, record }">
                  <span v-if="column.key === 'doc'" class="block min-w-0">
                    <span class="block text-sm font-semibold text-ink" data-invoice-title>{{ docTitle(record, t) }}</span>
                    <span class="block truncate text-xs text-muted">{{ record.caseNumber ?? t('broker.billing.noCase') }}</span>
                  </span>
                  <ZTag v-else-if="column.key === 'status'" :tone="invoiceStatusTone(record.status)" data-invoice-status>{{ t(invoiceStatusKey(record.status, record.kind)) }}</ZTag>
                  <span v-else-if="column.key === 'total'" class="whitespace-nowrap text-sm font-medium tabular-nums text-ink">{{ formatMoney(record.total, '').trimEnd() }}</span>
                  <span v-else-if="column.key === 'dates'" class="block text-xs">
                    <span v-for="d in invoiceDates(record)" :key="d.key" :class="['block', d.bad ? 'font-semibold text-tone-danger-fg' : 'text-muted']">{{ d.text }}</span>
                  </span>
                </template>
                <template #emptyText>
                  <ZEmpty :title="t('broker.clientCard.invoices.empty')" />
                </template>
              </ZTable>
            </template>
          </div>
        </template>
      </ZTabs>
    </template>
    <PoaReissueModal v-model:open="reissueOpen" :client-id="id" :doc="reissueDoc" @reissued="load()" />
    <InviteClientModal v-if="canInvite" :open="inviteOpen" :reissue="reissueInvite" @update:open="onInviteOpen" @invited="load()" />
  </div>
</template>
