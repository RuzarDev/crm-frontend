<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import DtLegacyForm from '@/components/import40/dt/DtLegacyForm.vue'
import DtSectionDts from '@/components/import40/dt/DtSectionDts.vue'
import DtPaymentsCalcModal from '@/components/import40/dt/DtPaymentsCalcModal.vue'
import Import40FactPaymentsSection from '@/components/Import40FactPaymentsSection.vue'
import { import40Api, type Import40CaseDto, type Import40DtFormState, type Import40SplitResult } from '@/api/import40'
import { import40ContractApi, type ClientCompanyProfileDto } from '@/api/import40Contract'
import { dtsApi } from '@/api/dts'
import { referencesApi } from '@/api/references'
import { useDtTotals } from '@/composables/useDtTotals'
import { useImport40Status } from '@/composables/useImport40Status'
import { useAuthStore } from '@/stores/auth'
import { useClassifiersStore } from '@/stores/classifiers'
import { confirmState, useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { canEditDt, canManageDeclarations, dtUserFrom } from '@/views/import40/dtAccess'
import DtBanners from './DtBanners.vue'
import DtHeaderBar from './DtHeaderBar.vue'
import DtReadinessPanel from './DtReadinessPanel.vue'
import DtSectionNav from './DtSectionNav.vue'
import DtSplitModal from './DtSplitModal.vue'
import SectionClosing from './sections/SectionClosing.vue'
import SectionCountries from './sections/SectionCountries.vue'
import SectionCustoms from './sections/SectionCustoms.vue'
import SectionDocs from './sections/SectionDocs.vue'
import SectionFinance from './sections/SectionFinance.vue'
import SectionGeneral from './sections/SectionGeneral.vue'
import SectionNumber from './sections/SectionNumber.vue'
import SectionParties from './sections/SectionParties.vue'
import SectionTransport from './sections/SectionTransport.vue'
import SectionGoods from './goods/SectionGoods.vue'
import { useDtGoods } from './goods/useDtGoods'
import { goodsFieldFromReadiness } from './goods/goodsFieldTarget'
import type { GoodsPageContext, GoodsSaveState } from './goods/editor/types'
import { DT_CLASSIFIERS } from './dtClassifiers'
import { fillStatUsd, lockGoodsCurrency } from './dtGoodsRules'
import { syncLoadedParties } from './dtParties'
import {
  adjacentSection, dtsReadinessItems, navMarks, paymentsStale, rateTag, readonlyReason, sectionFromQuery, splitChildren, visibleSections,
} from './dtPageModel'
import { DT_ROUTE, type DtSectionKey } from './dtSections'
import { useDtForm } from './useDtForm'
import { useDtPayments } from './useDtPayments'
import { useDtRates } from './useDtRates'
import { useDtReadiness, type DtReadinessItem } from './useDtReadiness'

// Страница ДТ Импорт 40 (редизайн, волна 6а, Task 3; доски DtGeneral, DtReadonly): закреплённая шапка, слева
// разделы с графами и отметками готовности сервера, справа «До подачи» (< 1280 — выезжающая из шапки), плашки
// просмотра и разделения. Активный раздел — в адресе (?s=), разделы монтируются лениво (v-if + KeepAlive).
// Разделы шапки (номер … завершение) — свои, на Z-ките (sections/); «Товары» — goods/ (волна 6б); прежними остаются
// ДТС и окно расчёта платежей (волна 6в). Логика — в composables: форма и сохранение (useDtForm), курсы (useDtRates), готовность
// (useDtReadiness), расчёты (useDtPayments).
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const classifiers = useClassifiersStore()
const { confirm } = useConfirm()
const { statusLabel } = useImport40Status()

// Страница пересоздаётся при смене ДТ (ShellFrame: router-view с ключом dtId) — id читаем один раз.
const caseId = String(route.params.caseId)
const dtId = String(route.params.dtId)

const user = computed(() => dtUserFrom(auth))
/** Право декларанта (CanManageDeclarations): готовность, XML, раздел ДТС. */
const canManage = computed(() => canManageDeclarations(user.value))

// ---- Готовность ДТ и ДТС ----
// ДТ заменена разделением: готовность и ДТС не спрашиваем (сервер исключает её из выгрузки). Флаг — из ответа
// загрузки (onLoaded): useDtForm здесь ещё не создан.
const replaced = ref(false)
const readinessOn = computed(() => canManage.value && !replaced.value)
const readiness = useDtReadiness(caseId, dtId, { enabled: readinessOn })
const dtsItems = shallowRef<DtReadinessItem[] | null>(null)
let dtsSeq = 0
const resetDts = () => { dtsSeq++; dtsItems.value = null }
const refreshDts = async () => {
  const my = ++dtsSeq
  if (!readinessOn.value) { dtsItems.value = null; return }
  try {
    const view = await dtsApi.get(caseId, dtId, { silent: true })
    if (my === dtsSeq) dtsItems.value = dtsReadinessItems(view)
  } catch {
    if (my === dtsSeq) dtsItems.value = null
  }
}

// ---- Форма ----
const clientProfile = ref<ClientCompanyProfileDto | null>(null)
const loadClientProfile = (kase: Import40CaseDto) => {
  if (!kase.clientId) return
  import40ContractApi.getProfile(kase.clientId, { silent: true }) // нет доступа к профилю — без автозаполнения гр.8
    .then((p) => { clientProfile.value = p })
    .catch(() => { clientProfile.value = null })
}
const dt = useDtForm(caseId, dtId, {
  canEdit: (kase) => canEditDt(user.value, kase),
  onLoadStart: () => { readiness.reset(); resetDts() },
  onLoaded: (dto, kase) => {
    replaced.value = !!dto.isSplitReplaced
    // Как прежний экран при загрузке: гр. 8 / 9 с «Совпадает с декларантом» повторяют гр. 14, валюта товаров = гр. 22
    // (под applying — без автосейва).
    syncLoadedParties(form)
    syncGoodsCurrency()
    void readiness.refresh()
    void refreshDts()
    loadClientProfile(kase)
  },
  onSaved: () => {
    void readiness.afterSave()
    void refreshDts()
  },
})
const form = dt.form
// Прежние разделы типизируют форму общим Import40DtFormState (у товаров — invoiceValue), страница — DtFormState.
const legacyForm = computed(() => form as unknown as Import40DtFormState)
const onLegacyUpdate = (v: Import40DtFormState) => { Object.assign(form, v) }

const rates = useDtRates(form, { applying: () => dt.applying.value })
const expenseTypeOptions = ref<{ value: string; label: string }[]>([])
const expenseDistributionByCode = ref<Record<string, 'GrossWeight' | 'CustomsValue'>>({})
const expenseDeductionByCode = ref<Record<string, boolean>>({})
const totals = useDtTotals(() => form.goodsItems, form, rates.rates, dt.applying, {
  isDeduction: (code) => !!code && !!expenseDeductionByCode.value[code],
  serverCustomsValue: () => dt.lastServerDto.value?.totalCustomsValue,
  dirty: () => dt.dirty.value,
})
const legacyTotals = computed(() => ({
  goods: totals.goodsCount.value,
  places: totals.packagesCount.value,
  customsValue: totals.customsValueKzt.value,
}))

// Авто гр.16 из товаров: одна страна происхождения — её код, разные — «000». Только при смене набора стран
// (не при загрузке): ручную правку не перезаписывает, пока набор не изменится.
const goodsOriginKey = computed(() =>
  Array.from(new Set(form.goodsItems.map((g) => (g.countryOfOrigin ?? '').trim()).filter(Boolean))).sort().join('|'))
watch(goodsOriginKey, (key) => {
  if (dt.applying.value || !key) return
  const codes = key.split('|')
  form.originCountryCode = codes.length === 1 ? codes[0] : '000'
})

// Правила товаров, которые прежний экран выполнял всегда смонтированным разделом «Товары» (теперь он ленивый):
// без них XML, печать, расчёты и PUT из шапки шли бы со старой валютой и пустой гр. 46.
// Валюта товаров = гр. 22, когда она задана (Пакет 6 №4): при загрузке — в onLoaded, дальше — на любую смену гр. 22
// или валюты товара (добавление, Excel).
// Правила правят товары на месте: массив и объекты товаров те же — ключи товаров (keyOf) и открытый товар не теряются.
// Загрузка (onLoaded) — молча; смена гр. 22 и новые товары после загрузки — правка: изменённым товарам «Пересчитать».
function syncGoodsCurrency(markStale = false) {
  lockGoodsCurrency(form.goodsItems, form.currency, { markStale })
}
watch(
  () => `${form.currency ?? ''}#${form.goodsItems.map((g) => g.currency ?? '').join('|')}`,
  () => { if (!dt.applying.value) syncGoodsCurrency(true) },
)
// гр. 46 пустая — гр. 45 / курс USD на дату гр. А (Item I), как только известны курс и гр. 45; только при праве
// править. Введённая гр. 46 живёт до следующей правки гр. 45 (пересчёт по правке — в карточке товара).
watch(
  () => `${rates.usdRate.value ?? ''}|${form.goodsItems.map((g) => g.customsValueKzt ?? '').join(',')}`,
  () => {
    if (!dt.editable.value) return
    fillStatUsd(form.goodsItems, rates.usdRate.value)
  },
)

const payments = useDtPayments(form, caseId, dtId, { save: () => dt.save() })

// Товары (волна 6б): одна модель на страницу — список и редактор правят form.goodsItems на месте. Статусы — по
// серверной готовности (пока её нет — местная проверка).
const goods = useDtGoods(form, {
  readiness: () => (readiness.loaded.value ? readiness.items.value : null),
  canEdit: () => dt.editable.value,
})
// Редактору товара — данные страницы (гр. 46 по курсу USD, ставки на дату гр. А, валюты; гр. 1 и гр. 19 — для списков
// КЕДЕН и номера контейнера) и состояние сохранения.
const goodsEditorContext = computed<GoodsPageContext>(() => ({
  usdRate: rates.usdRate.value,
  onDate: form.submissionDate || null,
  currencyOptions: rates.currencyOptions.value,
  direction: form.declarationTypeCode || null,
  declProcedure: form.procedureCode || null,
  containerIndicator: !!form.containerIndicator,
}))
const goodsSaveState = computed<GoodsSaveState>(() => ({
  saving: dt.saving.value,
  dirty: dt.dirty.value,
  failed: !!dt.saveError.value || dt.conflict.value,
  savedAt: dt.savedAt.value,
}))

// ---- Режимы ----
const editable = computed(() => dt.editable.value)
const splitReplaced = computed(() => !!dt.lastServerDto.value?.isSplitReplaced)
const kase = computed(() => dt.activeCase.value)
const roReason = computed(() => readonlyReason(user.value, kase.value))
const stage = computed(() => (kase.value ? statusLabel(kase.value.status) : ''))
const split = computed(() => (splitReplaced.value ? splitChildren(kase.value, dtId) : null))
const tag = computed(() => rateTag(dt.lastServerDto.value))

// ---- Разделы и ?s= ----
const sectionKeys = computed(() => visibleSections(canManage.value))
const active = computed<DtSectionKey>(() => sectionFromQuery(route.query.s, sectionKeys.value))
// Переход, ещё не дошедший до адреса: быстрые Alt+↓ подряд считаются от него, а не от прежнего раздела.
let pendingSection: DtSectionKey | null = null
const setSection = async (key: DtSectionKey) => {
  if (route.name !== DT_ROUTE || key === (pendingSection ?? active.value)) return
  pendingSection = key
  // Открытый товар (?item=) живёт только в разделе «Товары».
  const { s: _drop, item: _item, ...rest } = route.query
  try {
    await router.replace({ query: key === sectionKeys.value[0] ? rest : { ...rest, s: key } })
  } finally {
    if (pendingSection === key) pendingSection = null
  }
}

const allItems = computed<DtReadinessItem[]>(() => [...readiness.items.value, ...(dtsItems.value ?? [])])
const marks = computed(() => {
  const bySection: Partial<Record<DtSectionKey, number>> = {}
  for (const i of allItems.value) bySection[i.section] = (bySection[i.section] ?? 0) + 1
  return navMarks({ keys: sectionKeys.value, readinessLoaded: readiness.loaded.value, bySection, dtsLoaded: dtsItems.value !== null })
})
const staleSections = computed<DtSectionKey[]>(() => (paymentsStale(form.goodsItems) ? ['goods'] : []))

// ---- «До подачи»: переход к полю ----
const panelOpen = ref(false)
const sectionsHost = ref<HTMLElement | null>(null)
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const FLASH_MS = 2000
const FOCUSABLE = 'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
const flash = (el: HTMLElement) => {
  el.setAttribute('data-dt-flash', '')
  setTimeout(() => el.removeAttribute('data-dt-flash'), FLASH_MS)
}
// Пункт про товар («Товар 3: …») открывает сам товар (?s=goods&item=N) — поле ищем в его панели.
const openGoodsItem = async (index: number) => {
  if (route.name !== DT_ROUTE) return
  const { s: _s, item: _i, ...rest } = route.query
  pendingSection = 'goods'
  try {
    await router.replace({ query: { ...rest, s: 'goods', item: String(index + 1) } })
  } finally {
    if (pendingSection === 'goods') pendingSection = null
  }
}
const goTo = async (item: DtReadinessItem) => {
  panelOpen.value = false
  const gi = item.goodsIndex
  // «Товар N» пункта — позиция на момент ответа сервера: товар ищем по ней в том же снимке (после несохранённых
  // удаления/перестановки откроется тот самый товар; его больше нет — только раздел).
  const goodsAt = item.section === 'goods' && gi != null ? goods.indexOfReadinessGoods(gi) : null
  if (goodsAt != null) await openGoodsItem(goodsAt)
  else await setSection(item.section)
  await nextTick()
  const host = sectionsHost.value
  if (!host) return
  // Поле ищем по data-graph (у товара — внутри его блока data-goods-index: в панели товара, иначе в разделе);
  // не нашли — к началу раздела (товар при этом уже открыт).
  const graph = item.graph?.replace(/["\\]/g, '')
  const editor = goodsAt != null ? document.querySelector<HTMLElement>(`[data-dt-goods-editor] [data-goods-index="${goodsAt}"]`) : null
  const scope = editor ?? (gi != null && item.section !== 'goods' ? host.querySelector<HTMLElement>(`[data-goods-index="${gi}"]`) : null) ?? host
  // Поле товара — точно по ключу (data-goods-field: гр. 31 — и описание, и места; гр. 33 — и код, и коды запретов),
  // иначе — поле графы: первое подсвеченное (предупреждение/ошибка у поля — напр. гр. 36 вне списка КЕДЕН), иначе первое.
  const fieldKey = goodsAt != null ? goodsFieldFromReadiness(item.text) : null
  // Поле в свёрнутом блоке (доп. сведения): блок объявляет свои поля в data-goods-reveal — раскрываем и ищем снова.
  if (fieldKey && !scope.querySelector(`[data-goods-field="${fieldKey}"]`)) {
    const holder = scope.querySelector<HTMLElement>(`[data-goods-reveal~="${fieldKey}"]`)
    if (holder) {
      holder.dispatchEvent(new CustomEvent('goods-reveal'))
      await nextTick()
    }
  }
  const byGraph = graph ? [...scope.querySelectorAll<HTMLElement>(`[data-graph="${graph}"]`)] : []
  const flagged = byGraph.find((el) => el.querySelector(':scope > [data-z-status="warning"], :scope > [data-z-status="error"]'))
  const field = (fieldKey ? scope.querySelector<HTMLElement>(`[data-goods-field="${fieldKey}"]`) : null) ?? flagged ?? byGraph[0] ?? null
  if (!field && editor) return
  const target = field ?? host
  target.scrollIntoView({ block: field ? 'center' : 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
  if (field) {
    flash(field)
    // Фокус — на само поле, а не на «?» справки КТС 257 в подписи (DtGraphHelp, data-dt-guide-trigger).
    // Без tabindex=-1: крестики меток мультивыбора (коды гр. 33, признаки), скрытый input загрузки файла.
    const control = [...field.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => el.tabIndex >= 0 && !el.closest('[data-dt-guide-trigger]'))
    control?.focus({ preventScroll: true })
  }
}

const panelRates = computed(() => rates.boxCodes.value
  .map((code) => ({ code, rate: rates.rates.value[code]?.rate }))
  .filter((r): r is { code: string; rate: number } => typeof r.rate === 'number'))

// ---- Сохранение и 409 ----
const onSave = () => dt.save(true)
const onReload = async () => {
  if (dt.dirty.value) {
    const ok = await confirm({
      title: t('broker.dt.banners.conflictConfirmTitle'),
      content: t('broker.dt.banners.conflictConfirmText'),
      okText: t('broker.dt.banners.conflictReload'),
      cancelText: t('common.cancel'),
      danger: true,
    })
    if (!ok) return
  }
  void dt.reload()
}

// ---- Действия шапки ----
const xmlLoading = ref(false)
const printLoading = ref(false)
const docsLoading = ref(false)
const saveFile = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
const onXml = async () => {
  // Несохранённое не теряется при выгрузке; в просмотре — без сохранения (B2).
  if (!(await dt.saveForAction(true))) return
  xmlLoading.value = true
  readiness.clearXmlErrors()
  try {
    const res = await import40Api.downloadKedenXml(caseId, dtId)
    if ('errors' in res) {
      readiness.setXmlErrors(res.errors)
      message.warning(t('broker.dt.actions.xmlFillFields'))
      return
    }
    saveFile(res.blob, res.fileName)
    // Гр.54 КЕДЕН из XML не импортирует — подсказка вместе с сообщением.
    message.success({ content: `${t('broker.dt.actions.xmlDone')}. ${t('broker.dt.actions.xmlGr54')}`, duration: 8 })
    void readiness.refresh()
  } catch {
    message.error(t('broker.dt.actions.xmlError'))
  } finally {
    xmlLoading.value = false
  }
}
const onPrint = async () => {
  // В просмотре печатаем без сохранения (B2).
  if (!(await dt.saveForAction(true))) return
  printLoading.value = true
  try {
    const { blob } = await import40Api.blankPdf(caseId, dtId)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    message.error(t('broker.dt.actions.printError'))
  } finally {
    printLoading.value = false
  }
}
const onDocs = async () => {
  docsLoading.value = true
  try {
    const res = await import40Api.downloadAllDocuments(caseId)
    if ('error' in res) {
      message.info(res.error)
      return
    }
    saveFile(res.blob, res.fileName)
  } catch {
    message.error(t('broker.dt.actions.docsError'))
  } finally {
    docsLoading.value = false
  }
}

// ---- Разделение ЕТТ/ВТО ----
const splitOpen = ref(false)
const splitInfo = computed(() => {
  const show = !user.value.isClient
  if (splitReplaced.value) return { show, reason: t('broker.dt.header.splitReplaced') }
  if (form.goodsItems.length < 1) return { show, reason: t('broker.dt.header.splitNoGoods') }
  if (editable.value) return { show, reason: '' }
  const c = kase.value
  return { show, reason: c?.assignedDeclarantId && c.assignedDeclarantId !== user.value.userId ? t('broker.dt.header.splitAssigned') : t('broker.dt.header.splitRole') }
})
const onSplit = async () => {
  if (splitInfo.value.reason) return
  // Подсказка и само разделение — по СОХРАНЁННОЙ ДТ.
  if (!(await dt.saveForAction())) return
  splitOpen.value = true
}
// Перед POST split — сохранить и снять отложенный автосейв: сервер сдвинет отметку исходной ДТ, такой PUT получил бы 409.
const saveBeforeSplit = async () => {
  const ok = await dt.saveForAction()
  dt.cancelAutosave()
  return ok
}
const onSplitDone = async (res: Import40SplitResult) => {
  // Сервер пересчитывает платежи новых ДТ; не по всем — «Рассчитать платежи» откроется в ДТ ВТО само (?calc=payments).
  if (!res.paymentsRecalculated) message.warning(t('broker.dt.split.notRecalculated'))
  message.success(res.ettDeclarationId ? t('broker.dt.split.done') : t('broker.dt.split.vtoCreated'))
  await router.push({
    path: `/import-40/${caseId}/dt/${res.vtoDeclarationId}`,
    query: res.paymentsRecalculated ? {} : { calc: 'payments' },
  })
}

// ---- Загрузка: справочники, «не найдено», ?calc=payments ----
const countryOptions = ref<{ value: string; label: string; alpha2: string | null }[]>([])
const customsPostOptions = ref<{ value: string; label: string }[]>([])
onMounted(async () => {
  classifiers.loadMany([...DT_CLASSIFIERS]).catch(() => message.warning(t('broker.dt.page.classifiersFailed')))
  void rates.loadCurrencies()
  referencesApi.listCountries()
    // alpha2 — чтобы старый буквенный код стороны («KZ») показать и привести к цифровому ОКСМ (dtParties).
    .then((list) => { countryOptions.value = list.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, alpha2: c.alpha2 ?? null })) })
    .catch(() => { /* селекты стран — без списка */ })
  // Имя поста — «57505 — ТАМОЖЕННЫЙ ПОСТ …»: value — ведущий код (для номера ДТ), label — строка справочника.
  referencesApi.listCustomsPosts()
    .then((posts) => { customsPostOptions.value = posts.map((p) => ({ value: p.name.match(/^\d+/)?.[0] ?? p.name, label: p.name })) })
    .catch(() => { /* код поста можно ввести вручную */ })
  try {
    const types = [...(await referencesApi.listExpenseTypes())].sort((a, b) => a.sortOrder - b.sortOrder)
    expenseTypeOptions.value = types.map((x) => ({ value: x.code, label: x.nameRu }))
    expenseDistributionByCode.value = Object.fromEntries(types.map((x) => [x.code, x.distributionBase]))
    expenseDeductionByCode.value = Object.fromEntries(types.map((x) => [x.code, x.isDeduction]))
  } catch {
    /* таблица расходов не блокирует форму */
  }
})

watch(dt.notFound, (nf) => {
  if (!nf) return
  message.error(t('broker.dt.page.notFound'))
  void router.push('/import-40')
})

// Только что созданная ДТ ВТО (разделение): сразу расчёт платежей по ставкам ВТО.
let calcHandled = false
watch(() => dt.loading.value, (loading) => {
  if (loading || calcHandled || !form.id) return
  calcHandled = true
  if (route.query.calc !== 'payments') return
  const { calc: _drop, ...rest } = route.query
  void router.replace({ query: rest })
  if (editable.value) void payments.openModal()
})

// ---- Клавиатура: ⌘/Ctrl+S — сохранить, Alt+↑/↓ — соседний раздел ----
const dialogOpen = () =>
  confirmState.open || !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
const onKey = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyS' || e.key.toLowerCase() === 's')) {
    if (!editable.value || dt.loading.value || dialogOpen()) return
    e.preventDefault()
    void onSave()
    return
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (dt.loading.value || dialogOpen()) return
    const target = e.target as HTMLElement | null
    if (target?.closest?.('textarea, [role="combobox"], [role="listbox"]')) return
    const next = adjacentSection(sectionKeys.value, pendingSection ?? active.value, e.key === 'ArrowDown' ? 1 : -1)
    if (!next) return
    e.preventDefault()
    void setSection(next)
  }
}

// Высота шапки ДТ — для липкой навигации и панели под ней.
const headerRef = ref<ComponentPublicInstance | null>(null)
const headerH = ref(96)
let headerObserver: ResizeObserver | null = null
watch(headerRef, (cmp) => {
  headerObserver?.disconnect()
  headerObserver = null
  const el = cmp?.$el as HTMLElement | undefined
  if (!el || typeof ResizeObserver === 'undefined') return
  headerObserver = new ResizeObserver(() => { headerH.value = el.offsetHeight || 96 })
  headerObserver.observe(el)
})
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  headerObserver?.disconnect()
})

// Раздел ДТС под KeepAlive: при каждом открытии (не только после сохранения) перечитывает расчёт — счётчик
// открытий входит в его reload-key (у скрытого экземпляра пропсы не обновляются, watch(active) не сработал бы).
const dtsOpens = ref(0)
watch(active, (k, prev) => { if (k === 'dts' && prev !== 'dts') dtsOpens.value += 1 })

// Сохранение для раздела ДТС (его XML/печать): прежний контракт save(silent?) — без silent с сообщением.
const saveForDts = (silent?: boolean) => dt.saveForAction(!silent)
</script>

<template>
  <div class="flex min-w-0 flex-col" :style="{ '--dt-header-h': `${headerH}px` }" data-dt-page>
    <div v-if="dt.loading.value" class="flex flex-col gap-5 pt-5 lg:pt-6" aria-busy="true" :aria-label="t('broker.dt.page.loading')" data-dt-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="260px" height="13px" />
        <ZSkeleton width="min(340px, 80%)" height="26px" />
      </div>
      <div class="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_268px]">
        <div class="max-md:hidden"><ZSkeleton :lines="10" height="30px" /></div>
        <div class="flex flex-col gap-4">
          <ZSkeleton height="160px" />
          <ZSkeleton height="260px" />
        </div>
        <div class="max-xl:hidden"><ZSkeleton height="220px" /></div>
      </div>
    </div>

    <div v-else-if="dt.loadError.value" class="pt-5 lg:pt-6" data-dt-load-error-wrap>
      <div class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" role="alert" data-dt-load-error>
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.dt.page.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-dt-load-retry @click="dt.reload()">{{ t('broker.dt.page.retry') }}</ZButton>
      </div>
    </div>

    <template v-else-if="form.id">
      <DtHeaderBar
        ref="headerRef"
        :case-id="caseId"
        :case-number="kase?.number ?? null"
        :client-name="kase?.clientName ?? null"
        :number="form.declarationNumber || null"
        :tag="tag"
        :editable="editable"
        :can-xml="canManage && !splitReplaced"
        :saving="dt.saving.value"
        :dirty="dt.dirty.value"
        :failed="!!dt.saveError.value || dt.conflict.value"
        :saved-at="dt.savedAt.value"
        :xml-loading="xmlLoading"
        :print-loading="printLoading"
        :docs-loading="docsLoading"
        :payments-loading="payments.loading.value"
        :split="splitInfo"
        :panel-toggle="{ show: true, count: readiness.loaded.value ? allItems.length : null, ratesOnly: !readinessOn }"
        @save="onSave"
        @calc-payments="payments.openModal()"
        @xml="onXml"
        @print="onPrint"
        @docs="onDocs"
        @split="onSplit"
        @open-panel="panelOpen = true"
      />

      <div
        :class="[
          'grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-4 pt-5 md:grid-cols-[200px_minmax(0,1fr)]',
          'xl:grid-cols-[200px_minmax(0,1fr)_268px]',
        ]"
      >
        <DtSectionNav
          class="md:sticky md:top-[calc(var(--dt-header-h)+20px)] md:self-start"
          :sections="sectionKeys"
          :active="active"
          :marks="marks"
          :stale="staleSections"
          @select="setSection"
        />

        <div class="flex min-w-0 flex-col gap-4">
          <DtBanners
            :case-id="caseId"
            :readonly-reason="roReason"
            :assigned-name="kase?.assignedDeclarantName ?? null"
            :stage="stage"
            :split="split"
            :conflict="dt.conflict.value && editable"
            :save-error="editable ? dt.saveError.value : null"
            :saving="dt.saving.value"
            @reload="onReload"
            @retry="onSave"
          />

          <div
            ref="sectionsHost"
            class="min-w-0 rounded-panel border border-line bg-surface p-4 sm:p-5 [&_[data-dt-flash]]:rounded-field [&_[data-dt-flash]]:shadow-focus"
            :data-dt-section="active"
          >
            <KeepAlive>
              <SectionNumber
                v-if="active === 'number'"
                :form="form"
                :readonly="!editable"
                :post-options="customsPostOptions"
              />
              <SectionGeneral
                v-else-if="active === 'general'"
                :form="form"
                :readonly="!editable"
                :totals="legacyTotals"
              />
              <SectionParties
                v-else-if="active === 'parties'"
                :form="form"
                :readonly="!editable"
                :country-options="countryOptions"
                :client-profile="clientProfile"
              />
              <SectionCountries
                v-else-if="active === 'countries'"
                :form="form"
                :readonly="!editable"
                :country-options="countryOptions"
              />
              <SectionTransport
                v-else-if="active === 'transport'"
                :form="form"
                :readonly="!editable"
              />
              <SectionFinance
                v-else-if="active === 'finance'"
                :form="form"
                :readonly="!editable"
                :customs-value="totals.customsValueKzt.value"
                :customs-value-from-server="totals.customsValueFromServer.value"
                :currency-options="rates.currencyOptions.value"
                :currency-rates="rates.rates.value"
                :expense-type-options="expenseTypeOptions"
                :expense-distribution-by-code="expenseDistributionByCode"
                :expense-deduction-by-code="expenseDeductionByCode"
                :recalc="payments.customsResult.value"
                :recalc-loading="payments.customsLoading.value"
                :can-change-rate-type="user.isAdmin"
                @calc-customs-value="payments.calcCustomsValue()"
              />
              <SectionCustoms
                v-else-if="active === 'customs'"
                :form="form"
                :readonly="!editable"
                :post-options="customsPostOptions"
              />
              <SectionGoods
                v-else-if="active === 'goods'"
                :model="goods"
                :currency="form.currency || null"
                :dt-number="form.declarationNumber || null"
                :readonly="!editable"
                :country-options="countryOptions"
                :payments-loading="payments.loading.value"
                :editor-context="goodsEditorContext"
                :save-state="goodsSaveState"
                @calc-payments="payments.openModal()"
                @calc-tpin="payments.calcTpin()"
              />
              <SectionDocs
                v-else-if="active === 'docs'"
                :form="form"
                :readonly="!editable"
              />
              <!-- GET …/dts — только декларанту: раздел не рендерится вовсе (не просто скрыт).
                   a-form — только вокруг ДТС (AntD): его сброс стилей форм (input[type=file] { display: block },
                   label, legend…) не должен попадать в разделы на Z. KeepAlive кэширует саму обёртку. -->
              <DtLegacyForm v-else-if="active === 'dts' && canManage" :disabled="!editable">
                <DtSectionDts
                  :model-value="legacyForm"
                  :readonly="!editable"
                  :case-id="caseId"
                  :declaration-id="dtId"
                  :reload-key="dt.savedCounter.value + dtsOpens"
                  :active="active === 'dts'"
                  :save="saveForDts"
                  @update:model-value="onLegacyUpdate"
                />
              </DtLegacyForm>
              <SectionClosing
                v-else-if="active === 'closing'"
                :form="form"
                :readonly="!editable"
              />
            </KeepAlive>
            <section v-if="active === 'closing'" class="mt-5" data-dt-fact-payments>
              <h2 class="m-0 mb-3 text-[15px] font-semibold text-ink">
                {{ t('broker.dt.payments.fact') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: 'В' }) }}</span>
              </h2>
              <Import40FactPaymentsSection v-model="form.factPayments" :readonly="!editable" />
            </section>
          </div>
        </div>

        <aside class="hidden xl:sticky xl:top-[calc(var(--dt-header-h)+20px)] xl:block xl:self-start" data-dt-panel-aside>
          <DtReadinessPanel
            :enabled="readinessOn"
            :loaded="readiness.loaded.value"
            :items="allItems"
            :blank="readiness.blank.value"
            :rates="panelRates"
            :rates-date="form.submissionDate ?? null"
            :nb-unavailable="rates.nbUnavailable.value"
            @go="goTo"
          />
        </aside>
      </div>

      <ZDrawer v-model:open="panelOpen" :title="readinessOn ? t('broker.dt.panel.title') : t('broker.dt.panel.rates')" :width="340" data-dt-panel-drawer>
        <DtReadinessPanel
          :enabled="readinessOn"
          :loaded="readiness.loaded.value"
          :items="allItems"
          :blank="readiness.blank.value"
          :rates="panelRates"
          :rates-date="form.submissionDate ?? null"
          :nb-unavailable="rates.nbUnavailable.value"
          @go="goTo"
        />
      </ZDrawer>

      <DtSplitModal
        v-model:open="splitOpen"
        :case-id="caseId"
        :dt-id="dtId"
        :goods-count="form.goodsItems.length"
        :save="saveBeforeSplit"
        @done="onSplitDone"
      />

      <DtPaymentsCalcModal
        v-model:open="payments.modalOpen.value"
        :loading="payments.loading.value"
        :applying="payments.applying.value"
        :readonly="!editable"
        :result="payments.result.value"
        :goods="form.goodsItems"
        @toggle-medical="payments.toggleMedical"
        @apply="payments.apply()"
      />

      <ZModal
        :open="payments.tpinProblems.value.length > 0"
        :title="t('broker.dt.payments.tpinCheck')"
        :width="640"
        :footer="null"
        data-dt-tpin-problems
        @update:open="(v: boolean) => { if (!v) payments.tpinProblems.value = [] }"
      >
        <ul class="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-ink-2">
          <li v-for="(line, i) in payments.tpinProblems.value" :key="i">{{ line }}</li>
        </ul>
        <div class="mt-4 flex justify-end">
          <ZButton variant="primary" @click="payments.tpinProblems.value = []">{{ t('broker.dt.payments.gotIt') }}</ZButton>
        </div>
      </ZModal>
    </template>
  </div>
</template>
