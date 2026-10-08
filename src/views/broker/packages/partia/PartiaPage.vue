<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhFileText, PhPaperclip, PhX } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { clientsOnboardingApi } from '@/api/clientsOnboarding'
import { documentPackagesApi } from '@/api/documentPackages'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import type { DocumentPackageFileDto, PartyAddress, ReestrClientOption, ReestrGoodsItemInput } from '@/types/api'
import { confirmState, useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ZOption } from '@/ui/options'
import SectionDoc44 from '@/views/broker/transit/record/sections/SectionDoc44.vue'
import SectionGoods from '@/views/broker/transit/record/sections/SectionGoods.vue'
import { provideRecordRefs } from '@/views/broker/transit/record/sections/refs'
import { boxCtl, ctl, ph, str } from '@/views/broker/transit/record/sections/ui'
import { canModifyFiles } from '../packages'
import { containerFiles, formatContainerNumber, partiaFiles } from '../workspace/workspace'
import DocViewer from './DocViewer.vue'
import InvoiceImportModal from './InvoiceImportModal.vue'
import PartiaHeader from './PartiaHeader.vue'
import PartyCard from './PartyCard.vue'
import PartyModal from './PartyModal.vue'
import TransitDrawer from './TransitDrawer.vue'
import { PARTIA_LIMITS, transitFilled } from './partiaModel'
import { NEW_PARTIA_ID, usePartia } from './usePartia'

// Редактор партии — /document-packages/:id/partia/:partiaId (new?container=… — новая), редизайн волны 4в, доска
// PartiaEditor. Слева форма: клиент, станция, пломба, таможня назначения, отправитель и получатель (карточки → окно),
// товары (раздел записи транзита 4б + «Из инвойса»), инвойсы, гр.44 (без «Ещё»), строка «Транзитная декларация»
// → широкая шторка с разделами 4б. Справа документ (файлы партии, затем контейнера); уже 1280 — по кнопке «Документ».
// Загрузка и сохранение — usePartia (полное тело PUT, очередь инвойсов новой партии). Уход с правками спрашивает,
// Ctrl/⌘+S — сохранить (кроме открытых окон), beforeunload — при правках и сохранении.
// Права: правка — reestr.write (иначе всё только для чтения); инвойсы — ещё и canModifyFiles (загрузка файла пакета).
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { confirm } = useConfirm()
const refs = provideRecordRefs()
void refs.ensure('stations', 'posts', 'countries')

// Адрес следует только за маршрутом страницы: при уходе (другой маршрут) партия под ещё видимой страницей не меняется.
const PAGE_ROUTE = 'document-packages-partia'
const q = (v: unknown) => (typeof v === 'string' ? v : '')
const pkgId = ref(q(route.params.id))
const partiaId = ref(q(route.params.partiaId))
const containerId = ref(q(route.query.container))
watch(() => (route.name === PAGE_ROUTE ? [route.params.id, route.params.partiaId, route.query.container] as const : null), (v) => {
  if (!v) return
  pkgId.value = q(v[0])
  partiaId.value = q(v[1])
  containerId.value = q(v[2])
})
let alive = true

const p = usePartia(() => pkgId.value, () => containerId.value, () => partiaId.value)
const { pkg, partia, container, draft, isNew, loading, notFound, loadError, reloadError, reloading, saving, saveError, dirty, transitParseFailed, pendingInvoices } = p

const workspacePath = computed(() => `/document-packages/${pkgId.value}/workspace`)

// ---- Права ----
const role = computed(() => (auth.role ?? '').trim().toLowerCase())
const canEdit = computed(() => auth.hasPermission('reestr.write'))
const canFiles = computed(() => !!pkg.value && canModifyFiles({
  role: role.value, canReview: auth.hasPermission('packages.manage'), status: pkg.value.status,
}))
const canAttach = computed(() => canEdit.value && canFiles.value)
const readonly = computed(() => !canEdit.value)

// Новую партию создаёт только тот, кто правит.
watch([partiaId, canEdit], () => {
  if (partiaId.value === NEW_PARTIA_ID && !canEdit.value) void router.replace(workspacePath.value)
}, { immediate: true })

// ---- Клиенты ----
// Варианты — портфель /reestr/clients (значение — логин: по нему сервер находит клиента при формировании строк).
// Подпись — название компании из списка клиентов (право clients.read), иначе логин. Без права правки список не нужен.
const portfolio = ref<ReestrClientOption[]>([])
const portfolioLoaded = ref(false)
let portfolioStarted = false
watch(canEdit, async (on) => {
  if (!on || portfolioStarted) return
  portfolioStarted = true
  try {
    portfolio.value = await reestrApi.listPortfolioClients()
  } catch {
    // тост показал перехватчик
  } finally {
    portfolioLoaded.value = true
  }
}, { immediate: true })
const companies = ref(new Map<string, string>())
onMounted(async () => {
  if (role.value === 'client' || !auth.hasPermission('clients.read')) return
  try {
    const list = await clientsOnboardingApi.list({ silent: true })
    companies.value = new Map(list
      .filter((c) => c.companyName?.trim())
      .map((c) => [c.username.trim().toLowerCase(), c.companyName!.trim()]))
  } catch {
    // компания — только подпись: без неё остаётся логин
  }
})
const clientLabel = (name: string): string => companies.value.get(name.trim().toLowerCase()) ?? name.trim()
const clientOptions = computed<ZOption[]>(() => {
  const opts: ZOption[] = portfolio.value.map((c) => ({ value: c.username, label: clientLabel(c.username) }))
  const cur = draft.clientName.trim()
  if (cur && !opts.some((o) => o.value === cur)) opts.unshift({ value: cur, label: clientLabel(cur) })
  return opts
})
const noClients = computed(() => canEdit.value && portfolioLoaded.value && !portfolio.value.length)
/** id клиента партии — для распознавания инвойса по шаблонам клиента. */
const clientUuid = computed(() => portfolio.value.find((c) => c.username === draft.clientName)?.id)

// ---- Шапка ----
const headerTitle = computed(() => {
  const name = partia.value?.clientName?.trim()
  if (isNew.value || !name) return t('broker.partia.page.newTitle')
  return t('broker.partia.page.title', { name: clientLabel(name) })
})
const headerContext = computed(() => t('broker.partia.page.context', {
  train: pkg.value?.trainNumber ?? '',
  container: container.value ? formatContainerNumber(container.value.containerNumber) : '',
}))

// ---- Поля ----
const tooLong = (v: string | null, max: number) => (v ?? '').trim().length > max
const stationError = computed(() => (tooLong(draft.destinationStation, PARTIA_LIMITS.destinationStation) ? t('broker.partia.errors.stationTooLong') : undefined))
const customsError = computed(() => (tooLong(draft.destinationCustomsAuthority, PARTIA_LIMITS.destinationCustomsAuthority) ? t('broker.partia.errors.customsTooLong') : undefined))

// ---- Стороны ----
type PartyKey = 'shipper' | 'consignee'
const partyOpen = ref(false)
const partyKey = ref<PartyKey>('shipper')
const editParty = (k: PartyKey) => {
  if (readonly.value) return
  partyKey.value = k
  partyOpen.value = true
}
const applyParty = (v: PartyAddress) => { Object.assign(draft[partyKey.value], v) }

// ---- Товары: «Из инвойса» ----
const onImported = (items: ReestrGoodsItemInput[], mode: 'replace' | 'append') => {
  const goods = draft.record.goods
  if (mode === 'replace') goods.splice(0, goods.length, ...items)
  else goods.push(...items)
}

// ---- Инвойсы ----
const INVOICE_ACCEPT = '.pdf,.xlsx,.jpg,.jpeg,.png'
const MAX_BYTES = 10 * 1024 * 1024
const invoiceInput = ref<HTMLInputElement | null>(null)
const attaching = ref(false)
const invoiceFiles = computed(() => (pkg.value && partia.value ? partiaFiles(pkg.value, partia.value.id).filter((f) => f.documentType === 'invoice') : []))
const pickInvoice = () => {
  if (!canAttach.value || attaching.value || saving.value) return
  invoiceInput.value?.click()
}
const attach = async (file: File) => {
  const pk = pkg.value
  const pid = partia.value?.id
  if (!pk || !pid) return
  attaching.value = true
  try {
    const uploaded = await documentPackagesApi.uploadFile(pk.id, file)
    try {
      const fresh = await documentPackagesApi.linkFile(pk.id, uploaded.id, { containerId: null, clientConsolidationId: pid, documentType: 'invoice' })
      if (alive && pkg.value?.id === pk.id) pkg.value = fresh
      selectedDoc.value = uploaded.id
      message.success(t('broker.partia.invoices.attached'))
    } catch {
      // Файл загрузился, но не привязался — он в пакете нераспределённым; список перечитать (тост дал перехватчик).
      void p.reload()
    }
  } catch {
    // тост показал перехватчик
  } finally {
    attaching.value = false
  }
}
const onInvoiceFile = (e: Event) => {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  if (!/\.(pdf|xlsx|jpe?g|png)$/i.test(file.name)) {
    message.error(t('broker.partia.invoices.badType'))
    return
  }
  if (file.size > MAX_BYTES) {
    message.error(t('broker.partia.invoices.tooBig'))
    return
  }
  // Новая партия — в очередь: загрузятся и привяжутся после создания (usePartia).
  if (isNew.value) pendingInvoices.value = [...pendingInvoices.value, file]
  else void attach(file)
}
const removePending = (f: File) => { pendingInvoices.value = pendingInvoices.value.filter((x) => x !== f) }

// ---- Транзитная декларация ----
const transitOpen = ref(false)
const transitText = computed(() => {
  const { filled, total } = transitFilled(draft)
  if (!filled.length) return t('broker.partia.transit.none', { total })
  const names = filled.map((k) => t(`broker.transitRecord.sections.${k}`).toLocaleLowerCase(locale.value))
  const list = names.length > 3 ? `${names.slice(0, 3).join(', ')}…` : names.join(', ')
  return t('broker.partia.transit.filled', { list, n: filled.length, total })
})

// ---- Документ ----
const WIDE = '(min-width: 1280px)'
const wide = ref(true)
let mql: MediaQueryList | null = null
const onMedia = () => { wide.value = !!mql?.matches }
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  mql = window.matchMedia(WIDE)
  onMedia()
  mql.addEventListener?.('change', onMedia)
})
onBeforeUnmount(() => mql?.removeEventListener?.('change', onMedia))
const docOpen = ref(false)
watch(wide, (w) => { if (w) docOpen.value = false })
const selectedDoc = ref<string | null>(null)
const docPartiaFiles = computed<DocumentPackageFileDto[]>(() => (pkg.value && partia.value ? partiaFiles(pkg.value, partia.value.id) : []))
const docContainerFiles = computed<DocumentPackageFileDto[]>(() => (pkg.value && container.value ? containerFiles(pkg.value, container.value.id) : []))
const showDoc = (f: DocumentPackageFileDto) => {
  selectedDoc.value = f.id
  if (!wide.value) docOpen.value = true
}

// ---- Сохранение ----
const busy = computed(() => loading.value || saving.value || reloading.value)
const createdLostText = computed(() => t('broker.partia.errors.createdNotFound'))
const transitUnreadableText = computed(() => t('broker.partia.errors.transitUnreadable'))
const onSave = async (force = false) => {
  if (!canEdit.value || busy.value) return
  const startedNew = isNew.value
  const startedPkg = pkgId.value
  const savedId = await p.save(force ? { force: true } : undefined)
  // Новая создана, а пользователь всё ещё на её адресе …/partia/new (сейчас, а не когда начинал) — адрес партии.
  const stillOnNew = alive && route.name === PAGE_ROUTE && route.params.id === startedPkg && route.params.partiaId === NEW_PARTIA_ID
  if (savedId && startedNew && stillOnNew) {
    await router.replace(`/document-packages/${startedPkg}/partia/${savedId}`)
  }
}
const back = () => { void router.push(workspacePath.value) }
// Плашка ошибки сохранения скрывается при следующей правке (кроме «партия создана, но не нашлась» — до обновления).
watch(draft, () => {
  if (saveError.value && saveError.value !== createdLostText.value) saveError.value = null
}, { deep: true })

const onKey = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
  if (e.code !== 'KeyS' && e.key.toLowerCase() !== 's') return
  if (!canEdit.value || !pkg.value) return
  // Поверх страницы открыто окно или шторка — сохранение не под ним.
  const openDialog = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
  if (confirmState.open || document.querySelector(openDialog)) return
  e.preventDefault()
  if (dirty.value || isNew.value) void onSave()
}
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value && !saving.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  alive = false
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// ---- Защита правок ----
const askLeave = () => confirm({
  title: t('broker.partia.leave.title'),
  content: t('broker.partia.leave.text'),
  okText: t('broker.partia.leave.leave'),
  cancelText: t('broker.partia.leave.stay'),
  danger: true,
})
onBeforeRouteLeave(() => (!dirty.value ? true : askLeave()))
// Та же страница, другая партия — тоже уход; переход …/new → созданная — нет.
onBeforeRouteUpdate((to) => {
  const nextPkg = q(to.params.id)
  const next = q(to.params.partiaId)
  if (nextPkg === pkgId.value) {
    if (next !== NEW_PARTIA_ID && (next === partiaId.value || next === partia.value?.id)) return true
    if (next === NEW_PARTIA_ID && partiaId.value === NEW_PARTIA_ID && q(to.query.container) === containerId.value) return true
  }
  return !dirty.value ? true : askLeave()
})

const partyTitle = computed(() => t(`broker.partia.party.${partyKey.value}`))
const fileChip = 'inline-flex max-w-full min-h-8 items-center gap-1.5 rounded-pill border border-line bg-surface pl-2.5 text-[13px] text-ink-2 max-sm:min-h-11'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-[18px]" data-partia-page>
    <div v-if="loading" class="flex flex-col gap-[18px]" aria-busy="true" data-partia-skeleton>
      <div class="flex flex-col gap-2">
        <ZSkeleton width="220px" height="12px" />
        <ZSkeleton width="min(320px, 80%)" height="22px" />
      </div>
      <div class="grid gap-6 xl:grid-cols-2">
        <div class="flex flex-col gap-4">
          <ZSkeleton :lines="4" height="40px" />
          <ZSkeleton height="160px" />
        </div>
        <div class="max-xl:hidden"><ZSkeleton height="520px" /></div>
      </div>
    </div>

    <div v-else-if="notFound" class="rounded-panel border border-dashed border-line-strong" data-partia-not-found>
      <ZEmpty :title="t('broker.partia.page.notFound')" :hint="t('broker.partia.page.notFoundHint')">
        <template #action>
          <RouterLink
            :to="workspacePath"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t('broker.partia.page.toWorkspace') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="loadError" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-partia-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.partia.page.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-partia-retry @click="p.load()">{{ t('broker.partia.page.retry') }}</ZButton>
    </div>

    <template v-else-if="pkg && container">
      <PartiaHeader
        :title="headerTitle"
        :context="headerContext"
        :dirty="dirty"
        :can-edit="canEdit"
        :saving="saving"
        :disabled="busy"
        :show-document="!wide"
        @close="back"
        @cancel="back"
        @save="onSave()"
        @document="docOpen = true"
      />

      <ZAlert v-if="transitParseFailed" type="warning" show-icon :message="t('broker.partia.page.transitBroken')" data-partia-transit-broken>
        {{ transitUnreadableText }}
        <template v-if="canEdit" #action>
          <ZButton size="sm" :loading="saving" :disabled="busy" class="max-sm:h-11" data-partia-force-save @click="onSave(true)">{{ t('broker.partia.page.forceSave') }}</ZButton>
        </template>
      </ZAlert>
      <ZAlert v-if="reloadError" type="warning" show-icon :message="t('broker.partia.page.reloadError')" data-partia-reload-error>
        <template #action>
          <ZButton size="sm" class="max-sm:h-11" @click="p.reload()">{{ t('broker.partia.page.retry') }}</ZButton>
        </template>
      </ZAlert>
      <ZAlert v-if="saveError === createdLostText" type="error" show-icon :message="t('broker.partia.page.saveError')" data-partia-created-lost>
        {{ saveError }}
        <template #action>
          <ZButton size="sm" class="max-sm:h-11" data-partia-refresh @click="p.load()">{{ t('broker.partia.page.refresh') }}</ZButton>
        </template>
      </ZAlert>
      <ZAlert
        v-else-if="saveError && !(transitParseFailed && saveError === transitUnreadableText)"
        type="error"
        show-icon
        :message="t('broker.partia.page.saveError')"
        data-partia-save-error
      >{{ saveError }}</ZAlert>

      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,52fr)_minmax(0,48fr)]">
        <div class="flex min-w-0 flex-col gap-[22px]" data-partia-form>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ZField :label="t('broker.partia.fields.client')" required :extra="noClients ? t('broker.partia.fields.noClients') : undefined">
              <ZSelect
                :value="draft.clientName || null"
                :options="clientOptions"
                show-search
                :disabled="readonly"
                :placeholder="ph(readonly, t('broker.partia.fields.clientPlaceholder'))"
                :class="boxCtl"
                data-partia-client
                @update:value="draft.clientName = $event == null ? '' : String($event)"
              />
            </ZField>
            <ZField :label="t('broker.partia.fields.station')" :error="stationError">
              <ZCombobox
                :value="draft.destinationStation"
                :options="refs.stationOptions.value"
                allow-clear
                :disabled="readonly"
                :placeholder="ph(readonly, t('broker.partia.fields.stationPlaceholder'))"
                :class="boxCtl"
                data-partia-station
                @update:value="draft.destinationStation = str($event)"
              />
            </ZField>
            <ZField :label="t('broker.partia.fields.seal')">
              <ZInput
                :value="draft.sealNumber"
                mono
                :maxlength="PARTIA_LIMITS.sealNumber"
                :disabled="readonly"
                :class="ctl"
                data-partia-seal
                @update:value="draft.sealNumber = str($event)"
              />
            </ZField>
            <ZField :label="t('broker.partia.fields.customs')" :error="customsError">
              <ZCombobox
                :value="draft.destinationCustomsAuthority"
                :options="refs.postOptions.value"
                allow-clear
                :disabled="readonly"
                :placeholder="ph(readonly, t('broker.partia.fields.customsPlaceholder'))"
                :class="boxCtl"
                data-partia-customs
                @update:value="draft.destinationCustomsAuthority = str($event)"
              />
            </ZField>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2" data-partia-parties>
            <PartyCard :label="t('broker.partia.party.shipper')" :party="draft.shipper" :readonly="readonly" data-party="shipper" @edit="editParty('shipper')" />
            <PartyCard :label="t('broker.partia.party.consignee')" :party="draft.consignee" :readonly="readonly" data-party="consignee" @edit="editParty('consignee')" />
          </div>

          <SectionGoods :draft="draft.record" :readonly="readonly">
            <template #actions-lead>
              <InvoiceImportModal :client-id="clientUuid" :existing-count="draft.record.goods.length" @imported="onImported" />
            </template>
          </SectionGoods>

          <section class="flex min-w-0 flex-col gap-2.5 border-t border-line pt-5" aria-labelledby="partia-invoices-title" data-partia-invoices>
            <div class="flex flex-wrap items-center gap-2.5">
              <h2 id="partia-invoices-title" class="m-0 text-base leading-6 font-semibold text-ink">{{ t('broker.partia.invoices.title') }}</h2>
              <template v-if="canAttach">
                <input ref="invoiceInput" type="file" class="hidden" tabindex="-1" aria-hidden="true" :accept="INVOICE_ACCEPT" data-partia-invoice-input @change="onInvoiceFile">
                <ZButton
                  class="ml-auto border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11 max-sm:w-full"
                  :loading="attaching"
                  :disabled="saving"
                  data-partia-attach
                  @click="pickInvoice"
                >
                  <template #icon><PhPaperclip :size="16" aria-hidden="true" /></template>
                  {{ t('broker.partia.invoices.attach') }}
                </ZButton>
              </template>
            </div>
            <ul v-if="invoiceFiles.length || pendingInvoices.length" role="list" class="m-0 flex list-none flex-wrap gap-2 p-0">
              <li v-for="f in invoiceFiles" :key="f.id" class="min-w-0">
                <button
                  type="button"
                  :class="[fileChip, 'cursor-pointer pr-3 font-sans outline-hidden hover:border-line-strong hover:text-ink focus-visible:shadow-focus']"
                  :aria-label="t('broker.partia.invoices.show', { name: f.originalFileName })"
                  data-partia-invoice
                  @click="showDoc(f)"
                >
                  <PhFileText :size="15" aria-hidden="true" class="shrink-0 text-muted" />
                  <span class="min-w-0 truncate">{{ f.originalFileName }}</span>
                </button>
              </li>
              <li v-for="(f, i) in pendingInvoices" :key="`pending-${i}-${f.name}`" :class="[fileChip, 'border-dashed pr-1']" data-partia-pending>
                <PhPaperclip :size="15" aria-hidden="true" class="shrink-0 text-muted" />
                <span class="min-w-0 truncate">{{ f.name }}</span>
                <button
                  v-if="canAttach"
                  type="button"
                  class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-pill border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:shadow-focus max-sm:size-9"
                  :aria-label="t('broker.partia.invoices.removePending', { name: f.name })"
                  data-partia-pending-remove
                  @click="removePending(f)"
                ><PhX :size="13" aria-hidden="true" /></button>
              </li>
            </ul>
            <p v-if="isNew && canAttach" class="m-0 text-[12.5px] text-muted" data-partia-pending-hint>{{ t('broker.partia.invoices.pendingHint') }}</p>
            <p v-else-if="!invoiceFiles.length" class="m-0 text-sm text-ink-3" data-partia-invoices-none>{{ t('broker.partia.invoices.none') }}</p>
          </section>

          <SectionDoc44 :draft="draft.record" :readonly="readonly" :extended="false" />

          <section class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-5" aria-labelledby="partia-transit-title" data-partia-transit>
            <h2 id="partia-transit-title" class="m-0 text-base leading-6 font-semibold whitespace-nowrap text-ink">{{ t('broker.partia.transit.title') }}</h2>
            <p class="m-0 min-w-0 flex-1 basis-60 text-[12.5px] text-muted" data-partia-transit-text>{{ transitText }}</p>
            <ZButton variant="link" class="max-sm:h-11" :aria-label="t('broker.partia.transit.openAria')" data-partia-transit-open @click="transitOpen = true">
              {{ t('broker.partia.transit.open') }}
            </ZButton>
          </section>
        </div>

        <aside
          v-if="wide"
          class="sticky top-[calc(var(--shell-header-h,64px)+76px)] h-[calc(100vh-var(--shell-header-h,64px)-96px)] min-h-[420px] min-w-0 overflow-hidden rounded-panel border border-line"
          data-partia-viewer
        >
          <DocViewer v-model:selected="selectedDoc" :pkg-id="pkg.id" :partia-files="docPartiaFiles" :container-files="docContainerFiles" />
        </aside>
      </div>

      <ZDrawer v-if="!wide" v-model:open="docOpen" :width="760" :title="t('broker.partia.page.document')" data-partia-doc-drawer>
        <div class="-mx-6 -my-4 h-[calc(100%+2rem)]">
          <DocViewer v-model:selected="selectedDoc" :pkg-id="pkg.id" :partia-files="docPartiaFiles" :container-files="docContainerFiles" :active="docOpen" />
        </div>
      </ZDrawer>

      <PartyModal v-if="!readonly" v-model:open="partyOpen" :title="partyTitle" :party="draft[partyKey]" :country-options="refs.countryOptions.value" @apply="applyParty" />
      <TransitDrawer v-model:open="transitOpen" :draft="draft.record" :readonly="readonly" />
    </template>
  </div>
</template>
