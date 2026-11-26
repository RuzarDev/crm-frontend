<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowLeft, PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { blobErrorCode, downloadPartyDoc, getCopySource, listCopySources, type DeclarationCopySource, type PartyDocKind, type DeclarationMissing, type FromDocsConflict, type FromDocumentsResult } from '@/api/autoTransit'
import { confirmState, useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import RecordSaveBar from '@/views/broker/transit/record/RecordSaveBar.vue'
import SectionCarriers from '@/views/broker/transit/record/sections/SectionCarriers.vue'
import SectionContainers from '@/views/broker/transit/record/sections/SectionContainers.vue'
import SectionDoc44 from '@/views/broker/transit/record/sections/SectionDoc44.vue'
import SectionGoods from '@/views/broker/transit/record/sections/SectionGoods.vue'
import SectionGuarantees from '@/views/broker/transit/record/sections/SectionGuarantees.vue'
import SectionMisc from '@/views/broker/transit/record/sections/SectionMisc.vue'
import SectionOrganizations from '@/views/broker/transit/record/sections/SectionOrganizations.vue'
import SectionPackaging from '@/views/broker/transit/record/sections/SectionPackaging.vue'
import SectionPreceding from '@/views/broker/transit/record/sections/SectionPreceding.vue'
import SectionSeals from '@/views/broker/transit/record/sections/SectionSeals.vue'
import { provideRecordRefs } from '@/views/broker/transit/record/sections/refs'
import type { SectionKey } from '@/views/broker/transit/record/recordModel'
import { formatNumberIn } from '@/ui/number'
import PlateTag from '../PlateTag.vue'
import CopyTdModal, { type CopyResult } from './CopyTdModal.vue'
import FromDocsModal from './FromDocsModal.vue'
import KedenGoodsModal from './KedenGoodsModal.vue'
import { conflictKey, documentsMismatch, wouldReplaceGoods, type DocCheckRow, type GoodsMode } from './fromDocs'
import TdNav from './TdNav.vue'
import TdSectionMain from './TdSectionMain.vue'
import TdSectionVehicles from './TdSectionVehicles.vue'
import { TD_SECTIONS, copyWouldReplace, dataToDraft, missingLabel, missingSection, missingTarget, parseMissingKey, type TdSectionKey, type TotalsRow } from './tdModel'
import { useTd } from './useTd'

// ТД партии «Авто-транзита» — /auto-transit/:id/parties/:partyId/td (очередь 2а, спека 2026-11-17). Разделы — те же,
// что у записи ЖД-транзита (только импорт), «Основное» — своё (без станций и «Пост»), строки реестра нет.
// Шапка: госномер тягача и прицепа, партия, получатель, «Сохранить», «Назад к машине». Черновик (isDraft) помечен,
// «Не заполнено: N» — подсказка от сервера (сохранение не блокирует), клик ведёт к разделу и полю.
// Контейнеры — свёрнутым блоком в конце (у авто обычно не нужны). Уход с несохранённым спрашивает, beforeunload — тоже.
// Очередь 3 (спека 2026-11-25): форма «ПИ / ТД»; вместо ЖД «Транспорт» — «Машины и водитель» (TdSectionVehicles);
// этап 4 (спека 2026-11-26): «Пломбы» (средства идентификации) вернулись, кнопка «Товары для КЕДЕН» (KedenGoodsModal);
// плашка расхождения итогов товаров и партии (totalsCheck, без округления).
// Этап 3 (спека 2026-11-25-auto-transit-docs): меню «Документы» — опись документов ТД и заготовка акта осмотра (.docx)
// из сохранённой ПИ; при черновике или несохранённых правках пункты выключены с подсказкой «Сначала сохраните ПИ».
// Этап 3б: третий пункт — договор экспедиции из шаблона фирмы; шаблона нет — 409 contract_template_missing, тост с подсказкой.
const { t, te, locale } = useI18n()
const route = useRoute()
const { confirm } = useConfirm()
provideRecordRefs()

const T = 'broker.autoTransit.td'
const PAGE_ROUTE = 'auto-transit-td'
const q = (v: unknown) => (typeof v === 'string' ? v : '')
const truckId = ref(q(route.params.id))
const partyId = ref(q(route.params.partyId))
watch(() => (route.name === PAGE_ROUTE ? [route.params.id, route.params.partyId] as const : null), (v) => {
  if (!v) return
  truckId.value = q(v[0])
  partyId.value = q(v[1])
})

const td = useTd(() => truckId.value, () => partyId.value)
const { draft, auto, response, readOnly, isDraft, missing, loading, notFound, loadError, reloading, saving, saveError, dirty, changed, totals } = td
const sectionDomId = (key: TdSectionKey): string => `sec-${key}`
// Плашка сохранения подписывает разделы ключами broker.transitRecord.sections.* (vehicles там тоже есть).
const changedKeys = computed(() => changed.value as SectionKey[])

// ---- Итоги товаров против партии ----
// Без округления: места — целые; брутто — до 3 знаков (граммы), а если расхождение мельче — до 4 (decimal 18,4); стоимость — до 4.
const DIGITS: Record<TotalsRow['key'], number> = { places: 0, grossKg: 3, value: 4 }
/** Знаков после запятой у числа (не больше 4): 0,0004 кг не показывается как 0. */
const decimals = (n: number): number => Math.min(4, /\.(\d+)/.exec(String(n))?.[1]?.length ?? 0)
const totalsLines = computed(() => totals.value.map((r) => {
  const digits = Math.max(DIGITS[r.key], r.key === 'places' ? 0 : decimals(r.diff))
  const f = (n: number) => formatNumberIn(locale.value, n, digits)
  return {
    key: r.key, label: t(`${T}.totals.${r.key}`), goods: f(r.goods), party: f(r.party), diff: `${r.diff > 0 ? '+' : '−'}${f(Math.abs(r.diff))}`,
    partyMissing: !!r.partyMissing,
  }
}))

const truckPath = computed(() => `/auto-transit/${encodeURIComponent(truckId.value)}`)
const truck = computed(() => response.value?.truck ?? null)
const party = computed(() => response.value?.party ?? null)
const recipient = computed(() => party.value?.recipientName?.trim() || t('broker.autoTransit.party.noRecipient'))
const busy = computed(() => loading.value || saving.value || reloading.value)

// ---- Сохранение ----
const showSaveBar = computed(() => !readOnly.value && (dirty.value || isDraft.value || saving.value))
const onSave = async () => {
  if (readOnly.value || busy.value) return
  await td.save()
}
const onCancel = () => td.revert()
const saveErrorText = computed(() => (saveError.value ? t(`${T}.error.${saveError.value}`) : ''))
const canReload = computed(() => saveError.value === 'conflict' || saveError.value === 'submitted' || saveError.value === 'archived')

// ---- Только чтение ----
const readOnlyText = computed(() => (party.value?.submitted ? t(`${T}.readOnlySubmitted`) : t(`${T}.readOnly`)))

// ---- «Не заполнено» ----
const MISSING_SHOWN = 12
const missingAll = ref(false)
watch(missing, () => { missingAll.value = false })
const missingItems = computed(() => missing.value.map((m, i) => ({ m, i, text: labelOf(m) })))
const missingVisible = computed(() => (missingAll.value ? missingItems.value : missingItems.value.slice(0, MISSING_SHOWN)))
const missingMore = computed(() => Math.max(0, missingItems.value.length - MISSING_SHOWN))

function fieldName(field: string): string {
  const k = `${T}.missing.goodsField.${field}`
  return te(k) ? t(k) : field
}
function labelOf(m: DeclarationMissing): string {
  const { key, params } = missingLabel(m)
  if (key === 'goodsItem') return t(`${T}.missing.goodsItem`, { n: params.n as number, field: fieldName(String(params.field ?? '')) })
  if (key === 'vehicleItem') {
    const f = `${T}.missing.vehicleField.${String(params.field ?? '')}`
    return t(`${T}.missing.vehicleItem`, { n: params.n as number, field: te(f) ? t(f) : String(params.field ?? '') })
  }
  const k = `${T}.missing.keys.${key}`
  if (te(k)) return t(k)
  // Сервер прислал ключ, которого фронт не знает: раздел и ключ как есть.
  return `${t(`broker.transitRecord.sections.${missingSection(m)}`)}: ${m.key}`
}

const containersOpen = ref(false)
watch(() => draft.containers.length, (n) => { if (n) containersOpen.value = true }, { immediate: true })

/**
 * Карточка товара с номером index (с 0, как в ключе сервера): свёрнутую разворачиваем её же кнопкой (SectionGoods держит
 * развёрнутость у себя, файлы ЖД-транзита не меняем). Поля ищутся внутри карточки, а не по номеру среди полей раздела:
 * у свёрнутых карточек полей в DOM нет.
 */
async function goodsCard(section: HTMLElement, index: number): Promise<HTMLElement | null> {
  const card = section.querySelectorAll<HTMLElement>('[data-goods-card]')[index]
  if (!card) return null
  const toggle = card.querySelector<HTMLElement>('[data-goods-toggle]')
  if (toggle?.getAttribute('aria-expanded') === 'false') {
    toggle.click()
    await nextTick()
  }
  return card
}

const goToMissing = async (m: DeclarationMissing) => {
  const section = missingSection(m)
  if (section === 'containers') containersOpen.value = true
  await nextTick()
  const el = document.getElementById(sectionDomId(section))
  if (!el) return
  const { field, index } = missingTarget(m)
  const key = parseMissingKey(m.key)
  const card = section === 'goods' && key.head === 'goods' && key.index != null ? await goodsCard(el, key.index) : null
  ;(card ?? el).scrollIntoView({ behavior: 'smooth', block: card ? 'center' : 'start' })
  if (!field) return
  const target = card ? card.querySelector<HTMLElement>(`[data-f="${field}"]`) : el.querySelectorAll<HTMLElement>(`[data-f="${field}"]`)[index]
  const focusable = target?.matches('input,button,textarea,[tabindex]')
    ? target
    : target?.querySelector<HTMLElement>('input,button,textarea,[tabindex]:not([tabindex="-1"])')
  focusable?.focus({ preventScroll: true })
}

// ---- Защита правок ----
const askLeave = () => confirm({
  title: t('broker.transitRecord.leave.title'),
  content: t('broker.transitRecord.leave.text'),
  okText: t('broker.transitRecord.leave.leave'),
  cancelText: t('broker.transitRecord.leave.stay'),
  danger: true,
})
onBeforeRouteLeave(() => (!dirty.value ? true : askLeave()))
onBeforeRouteUpdate((to) => {
  const same = q(to.params.id) === truckId.value && q(to.params.partyId) === partyId.value
  return same || !dirty.value ? true : askLeave()
})
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!dirty.value && !saving.value) return
  e.preventDefault()
  e.returnValue = ''
}
// Ctrl/⌘+S — «Сохранить» (подсказку показывает общая плашка RecordSaveBar), как в записи транзита: не под открытым окном.
const onKey = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
  if (e.code !== 'KeyS' && e.key.toLowerCase() !== 's') return
  if (!response.value || readOnly.value) return
  const openDialog = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
  if (copyOpen.value || fromDocsOpen.value || kedenOpen.value || confirmState.open || document.querySelector(openDialog)) return
  e.preventDefault()
  if (dirty.value || isDraft.value) void onSave()
}
onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onKey)
})

// ---- Копия с прошлой ТД (Task 3) ----
// Список — прошлые ТД того же получателя (сервер); кнопка видна, если он не пуст и форма не только для чтения.
const copySources = ref<DeclarationCopySource[]>([])
const copyOpen = ref(false)
let copySeq = 0
const loadCopySources = async () => {
  const my = ++copySeq
  copySources.value = []
  if (!response.value || readOnly.value) return
  try {
    const list = await listCopySources(truckId.value, partyId.value)
    if (my === copySeq) copySources.value = Array.isArray(list) ? list : []
  } catch {
    // Подсказка, а не основное действие: без списка просто нет кнопки.
  }
}
watch(() => [response.value?.party.id ?? null, readOnly.value] as const, ([id], prev) => {
  if (!prev || id !== prev[0] || readOnly.value !== prev[1]) void loadCopySources()
})
const canCopy = computed(() => !readOnly.value && copySources.value.length > 0)
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status
const runCopy = async (sourcePartyId: string, withGoods: boolean): Promise<CopyResult> => {
  let data
  try {
    data = (await getCopySource(truckId.value, partyId.value, sourcePartyId)).data
  } catch (e) {
    return statusOf(e) === 404 ? 'notFound' : 'error'
  }
  if (readOnly.value) return 'cancelled'
  if (copyWouldReplace(draft, withGoods)) {
    const ok = await confirm({
      title: t(`${T}.copy.replaceTitle`),
      content: t(`${T}.copy.replaceText`),
      okText: t(`${T}.copy.replaceOk`),
      cancelText: t(`${T}.copy.cancel`),
    })
    if (!ok) return 'cancelled'
  }
  td.applyCopy(data, withGoods)
  message.success(t(`${T}.copy.done`))
  return 'ok'
}

// ---- Опись и акт осмотра (этап 3) ----
// Файл собирает сервер из СОХРАНЁННОЙ ПИ: черновик (ни разу не сохраняли) и несохранённые правки в документ не попадут.
const docsBlocked = computed(() => isDraft.value || dirty.value)
const DOC_KINDS: { kind: PartyDocKind; label: string }[] = [
  { kind: 'inventory', label: 'inventory' },
  { kind: 'inspection-act', label: 'act' },
  // Этап 3б: договор экспедиции из шаблона фирмы (Настройки → Авто-транзит).
  { kind: 'contract', label: 'contract' },
]
const docItems = computed<ZDropdownItem[]>(() => DOC_KINDS.map((d) => ({
  key: d.kind,
  label: t(`${T}.docs.${d.label}`),
  disabled: docsBlocked.value,
  hint: docsBlocked.value ? t(`${T}.docs.saveFirst`) : undefined,
})))
const docBusy = ref(false)
const onDoc = async (key: string) => {
  const kind = DOC_KINDS.find((d) => d.kind === key)?.kind
  if (!kind || docBusy.value) return
  if (docsBlocked.value) {
    message.warning(t(`${T}.docs.saveFirst`))
    return
  }
  docBusy.value = true
  try {
    const { blob, fileName } = await downloadPartyDoc(truckId.value, partyId.value, kind, `${kind}.docx`)
    saveBlob(blob, fileName)
  } catch (e) {
    // 409 перехватчик не показывает (silentStatuses): код — из ответа-Blob. Прочие ошибки — общий тост.
    if (statusOf(e) === 409) {
      const code = await blobErrorCode(e)
      const key = code === 'declaration_not_saved' ? 'notSaved' : code === 'contract_template_missing' ? 'templateMissing' : 'failed'
      message.error(t(`${T}.docs.${key}`))
    }
  } finally {
    docBusy.value = false
  }
}

// ---- «Товары для КЕДЕН» (этап 4, спека 2026-11-26) ----
// Таблица строится из СОХРАНЁННОЙ ТД (response.data), не из формы: несохранённые правки и черновик в неё не попадают,
// окно об этом предупреждает.
const kedenOpen = ref(false)
const kedenSource = computed(() => dataToDraft(response.value?.data))
const kedenStale = computed(() => isDraft.value || dirty.value)

// ---- «Заполнить из документов» (очередь 3, спека 5.2–5.3) ----
// Окно: выбор файлов → ответ сервера → «Подставить в форму». После — плашки «Проверьте» (расхождения между документами
// и предупреждения разбора) и «Документы не сходятся» (места, брутто, госномер по CMR, инвойсу, упаковочному).
// Ничего не сохраняется до «Сохранить»; плашки живут до ухода со страницы или «Скрыть».
const fromDocsOpen = ref(false)
interface FromDocsReport { conflicts: FromDocsConflict[]; warnings: string[]; mismatch: DocCheckRow[] }
const fromDocsReport = ref<FromDocsReport | null>(null)
watch(() => [truckId.value, partyId.value] as const, () => { fromDocsReport.value = null })
const applyFromDocs = async (r: FromDocumentsResult, mode: GoodsMode): Promise<boolean> => {
  if (readOnly.value) return false
  if (wouldReplaceGoods(draft, r.data, mode)) {
    const ok = await confirm({
      title: t(`${T}.fromDocs.replaceTitle`),
      content: t(`${T}.fromDocs.replaceText`, { n: draft.goods.length }),
      okText: t(`${T}.fromDocs.replaceOk`),
      cancelText: t(`${T}.fromDocs.cancel`),
      danger: true,
    })
    if (!ok) return false
  }
  td.applyFromDocuments(r.data, mode)
  const report: FromDocsReport = { conflicts: r.conflicts ?? [], warnings: r.warnings ?? [], mismatch: documentsMismatch(r.documentsCheck) }
  fromDocsReport.value = report.conflicts.length || report.warnings.length || report.mismatch.length ? report : null
  message.success(t(`${T}.fromDocs.done`))
  return true
}
const conflictLabel = (field: string): string => {
  const c = conflictKey(field)
  if (c.key === 'goodsItem') return t(`${T}.missing.goodsItem`, { n: c.n, field: fieldName(c.field ?? '') })
  const k = `${T}.fromDocs.fields.${c.key}`
  return te(k) ? t(k) : field
}
const conflictValues = (c: FromDocsConflict): string => c.values
  .map((v) => [v.value?.trim() || '—', v.source?.trim() ? t(`${T}.fromDocs.from`, { source: v.source.trim() }) : ''].filter(Boolean).join(' '))
  .join(' · ')
const docSlotText = (row: DocCheckRow): string => (['cmr', 'invoice', 'packing'] as const)
  .filter((s) => row[s] != null && row[s] !== '')
  .map((s) => {
    const v = row[s]!
    const shown = typeof v === 'number' ? formatNumberIn(locale.value, v, row.key === 'places' ? 0 : Math.min(4, /\.(\d+)/.exec(String(v))?.[1]?.length ?? 0)) : v
    return `${t(`${T}.fromDocs.slot.${s}`)} ${shown}`
  })
  .join(' · ')

const backClass = 'inline-flex min-h-9 items-center gap-1.5 rounded-row text-[13px] font-medium text-ink-2 no-underline outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-[18px]" data-td-page>
    <div v-if="loading" class="flex flex-col gap-[18px]" aria-busy="true" data-td-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="140px" height="13px" />
        <ZSkeleton width="min(320px, 80%)" height="28px" />
      </div>
      <ZSkeleton height="180px" />
      <ZSkeleton height="240px" />
    </div>

    <div v-else-if="notFound" class="rounded-panel border border-dashed border-line-strong" data-td-not-found>
      <ZEmpty :title="t(`${T}.notFound`)" :hint="t(`${T}.notFoundHint`)">
        <template #action>
          <RouterLink
            :to="truckPath"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t(`${T}.back`) }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="loadError" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-td-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${T}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11" data-td-retry @click="td.load()">{{ t(`${T}.retry`) }}</ZButton>
    </div>

    <template v-else-if="response">
      <header class="flex min-w-0 flex-col gap-2" data-td-header>
        <RouterLink :to="truckPath" :class="backClass" class="self-start" data-td-back>
          <PhArrowLeft :size="14" aria-hidden="true" />{{ t(`${T}.back`) }}
        </RouterLink>
        <div class="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3">
          <div class="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
            <h1 class="m-0 text-[22px] leading-7 font-semibold text-ink">{{ t(`${T}.title`) }}</h1>
            <p class="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-ink-2">
              <PlateTag v-if="truck?.plate" :plate="truck.plate" />
              <PlateTag v-if="truck?.trailerPlate" :plate="truck.trailerPlate" />
              <span class="min-w-0 [overflow-wrap:anywhere]">
                {{ t(`${T}.party`, { n: party?.number ?? '' }) }} · {{ recipient }}
              </span>
            </p>
          </div>
          <ZDropdown :items="docItems" @select="onDoc">
            <ZButton :loading="docBusy" :disabled="loading" class="max-sm:h-11 max-sm:w-full" data-td-docs>
              {{ t(`${T}.docs.button`) }}<PhCaretDown :size="14" aria-hidden="true" />
            </ZButton>
          </ZDropdown>
          <ZButton :disabled="busy" class="max-sm:h-11 max-sm:w-full" data-td-keden @click="kedenOpen = true">{{ t(`${T}.kedenGoods.button`) }}</ZButton>
          <ZButton
            v-if="!readOnly"
            :disabled="busy"
            class="max-sm:h-11 max-sm:w-full"
            data-td-from-docs
            @click="fromDocsOpen = true"
          >{{ t(`${T}.fromDocs.button`) }}</ZButton>
          <ZButton
            v-if="canCopy"
            :disabled="busy"
            class="max-sm:h-11 max-sm:w-full"
            data-td-copy
            @click="copyOpen = true"
          >{{ t(`${T}.copy.button`) }}</ZButton>
          <ZButton
            v-if="!readOnly"
            variant="primary"
            :loading="saving"
            :disabled="busy"
            class="max-sm:h-11 max-sm:w-full"
            data-td-save
            @click="onSave"
          >{{ t(`${T}.save`) }}</ZButton>
        </div>
      </header>

      <ZAlert v-if="isDraft" type="info" show-icon data-td-draft>{{ t(`${T}.draft`) }}</ZAlert>
      <ZAlert v-if="readOnly" type="info" show-icon data-td-readonly>{{ readOnlyText }}</ZAlert>
      <ZAlert v-if="saveError" type="error" show-icon :message="t(`${T}.notSaved`)" data-td-save-error>
        {{ saveErrorText }}
        <template v-if="canReload" #action>
          <ZButton size="sm" class="max-sm:h-11" :loading="reloading" data-td-reload @click="td.reload()">{{ t(`${T}.reload`) }}</ZButton>
        </template>
      </ZAlert>

      <section
        v-if="totalsLines.length"
        role="alert"
        class="flex min-w-0 flex-col gap-2 rounded-panel border border-tone-danger-fg bg-tone-danger-bg px-4 py-3 text-tone-danger-fg"
        aria-labelledby="td-totals-title"
        data-td-totals
      >
        <h2 id="td-totals-title" class="m-0 text-base leading-6 font-semibold">{{ t(`${T}.totals.title`) }}</h2>
        <ul role="list" class="m-0 flex min-w-0 list-none flex-col gap-1 p-0 text-sm">
          <li v-for="l in totalsLines" :key="l.key" class="min-w-0 [overflow-wrap:anywhere]" :data-td-totals-row="l.key">
            <span class="font-semibold">{{ l.label }}:</span>{{ ' ' }}
            <span v-if="l.partyMissing">{{ t(`${T}.totals.linePartyMissing`, { goods: l.goods }) }}</span>
            <template v-else>
              {{ t(`${T}.totals.line`, { goods: l.goods, party: l.party }) }}
              <span class="font-semibold tabular-nums">({{ l.diff }})</span>
            </template>
          </li>
        </ul>
        <p class="m-0 text-xs">{{ t(`${T}.totals.hint`) }}</p>
      </section>

      <section
        v-if="fromDocsReport?.mismatch.length"
        role="alert"
        class="flex min-w-0 flex-col gap-2 rounded-panel border border-tone-danger-fg bg-tone-danger-bg px-4 py-3 text-tone-danger-fg"
        aria-labelledby="td-doccheck-title"
        data-td-doccheck
      >
        <h2 id="td-doccheck-title" class="m-0 text-base leading-6 font-semibold">{{ t(`${T}.fromDocs.checkTitle`) }}</h2>
        <ul role="list" class="m-0 flex min-w-0 list-none flex-col gap-1 p-0 text-sm">
          <li v-for="r in fromDocsReport.mismatch" :key="r.key" class="min-w-0 [overflow-wrap:anywhere]" :data-td-doccheck-row="r.key">
            <span class="font-semibold">{{ t(`${T}.fromDocs.check.${r.key}`) }}:</span>{{ ' ' }}<span>{{ docSlotText(r) }}</span>
          </li>
        </ul>
        <p class="m-0 text-xs">{{ t(`${T}.fromDocs.checkHint`) }}</p>
      </section>

      <section
        v-if="fromDocsReport && (fromDocsReport.conflicts.length || fromDocsReport.warnings.length)"
        class="flex min-w-0 flex-col gap-2 rounded-panel border border-gold-line bg-gold-soft px-4 py-3"
        aria-labelledby="td-review-title"
        data-td-review
      >
        <div class="flex min-w-0 items-start gap-2">
          <h2 id="td-review-title" class="m-0 min-w-0 flex-1 text-sm leading-5 font-semibold text-gold-ink">{{ t(`${T}.fromDocs.reviewTitle`) }}</h2>
          <ZButton size="sm" variant="ghost" class="shrink-0 max-sm:h-11" data-td-review-hide @click="fromDocsReport = null">{{ t(`${T}.fromDocs.hide`) }}</ZButton>
        </div>
        <ul v-if="fromDocsReport.conflicts.length" role="list" class="m-0 flex min-w-0 list-none flex-col gap-1 p-0 text-sm text-ink">
          <li v-for="(c, i) in fromDocsReport.conflicts" :key="`c${i}`" class="min-w-0 [overflow-wrap:anywhere]" data-td-review-conflict>
            <span class="font-semibold">{{ conflictLabel(c.field) }}:</span>{{ ' ' }}<span>{{ conflictValues(c) }}</span>
          </li>
        </ul>
        <ul v-if="fromDocsReport.warnings.length" role="list" class="m-0 flex min-w-0 list-none flex-col gap-1 p-0 text-xs text-ink-2">
          <li v-for="(wn, i) in fromDocsReport.warnings" :key="`w${i}`" class="min-w-0 [overflow-wrap:anywhere]" data-td-review-warning>{{ wn }}</li>
        </ul>
      </section>

      <section
        v-if="missing.length"
        class="flex min-w-0 flex-col gap-2 rounded-panel border border-gold-line bg-gold-soft px-4 py-3"
        aria-labelledby="td-missing-title"
        data-td-missing
      >
        <h2 id="td-missing-title" class="m-0 text-sm leading-5 font-semibold text-gold-ink" data-td-missing-title>
          {{ t(`${T}.missingTitle`, { n: missing.length }) }}
        </h2>
        <ul role="list" class="m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0">
          <li v-for="item in missingVisible" :key="`${item.i}-${item.m.key}`" class="min-w-0 max-w-full">
            <button
              type="button"
              class="inline-flex min-h-8 max-w-full cursor-pointer items-center rounded-row border border-gold-line bg-surface px-2.5 text-left font-sans text-xs text-ink outline-hidden hover:border-gold focus-visible:shadow-focus max-sm:min-h-11"
              data-td-missing-item
              @click="goToMissing(item.m)"
            ><span class="min-w-0 [overflow-wrap:anywhere]">{{ item.text }}</span></button>
          </li>
          <li v-if="missingMore && !missingAll">
            <button
              type="button"
              class="inline-flex min-h-8 cursor-pointer items-center rounded-row px-2 font-sans text-xs font-semibold text-gold-ink underline outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
              data-td-missing-more
              @click="missingAll = true"
            >{{ t(`${T}.missingMore`, { n: missingMore }) }}</button>
          </li>
        </ul>
        <p class="m-0 text-xs text-ink-2">{{ t(`${T}.missingHint`) }}</p>
      </section>

      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-7 gap-y-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <TdNav :draft="draft" :auto="auto" :sections="TD_SECTIONS" :label="t(`${T}.navLabel`)" />
        <div class="flex min-w-0 flex-col gap-[18px]">
          <div class="flex min-w-0 flex-col gap-[18px]" data-td-sections>
            <TdSectionMain :draft="draft" :readonly="readOnly" />
            <SectionOrganizations :draft="draft" :readonly="readOnly" />
            <SectionCarriers :draft="draft" :readonly="readOnly" />
            <TdSectionVehicles :auto="auto" :readonly="readOnly" />
            <SectionSeals :draft="draft" :readonly="readOnly" />
            <SectionGoods :draft="draft" :readonly="readOnly" workbook />
            <SectionDoc44 :draft="draft" :readonly="readOnly" />
            <SectionPackaging :draft="draft" :readonly="readOnly" />
            <SectionPreceding :draft="draft" :readonly="readOnly" />
            <SectionGuarantees :draft="draft" :readonly="readOnly" />
            <SectionMisc :draft="draft" :readonly="readOnly" />
          </div>

          <div class="flex min-w-0 flex-col gap-3 border-t border-line pt-4" data-td-containers>
            <button
              type="button"
              class="inline-flex min-h-9 cursor-pointer items-center gap-1.5 self-start rounded-row border-0 bg-transparent p-0 font-sans text-sm font-semibold text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus max-sm:min-h-11"
              :aria-expanded="containersOpen"
              data-td-containers-toggle
              @click="containersOpen = !containersOpen"
            >
              <component :is="containersOpen ? PhCaretDown : PhCaretRight" :size="14" aria-hidden="true" />
              {{ t(`${T}.containers`, { n: draft.containers.length }) }}
            </button>
            <SectionContainers v-if="containersOpen" :draft="draft" :readonly="readOnly" />
          </div>
        </div>
      </div>

      <CopyTdModal v-model:open="copyOpen" :sources="copySources" :run="runCopy" />
      <KedenGoodsModal
        v-model:open="kedenOpen"
        :source="kedenSource"
        :totals="response.totalsCheck"
        :plate="truck?.plate"
        :party-number="party?.number"
        :stale="kedenStale"
      />
      <FromDocsModal
        v-if="!readOnly"
        v-model:open="fromDocsOpen"
        :truck-id="truckId"
        :party-id="partyId"
        :goods-in-form="draft.goods.length"
        :apply="applyFromDocs"
      />

      <RecordSaveBar
        v-if="showSaveBar"
        :changed="changedKeys"
        :is-new="isDraft"
        :saving="saving"
        :disabled="busy"
        @cancel="onCancel"
        @save="onSave"
      />
    </template>
  </div>
</template>
