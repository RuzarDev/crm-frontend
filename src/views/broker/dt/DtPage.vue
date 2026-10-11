<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import Import40FactPaymentsSection from '@/components/Import40FactPaymentsSection.vue'
import { import40Api, type Import40CaseDto, type Import40SplitResult } from '@/api/import40'
import { import40ContractApi, type ClientCompanyProfileDto } from '@/api/import40Contract'
import { referencesApi } from '@/api/references'
import { useDtTotals } from '@/composables/useDtTotals'
import { useImport40Status } from '@/composables/useImport40Status'
import { useAuthStore } from '@/stores/auth'
import { useClassifiersStore } from '@/stores/classifiers'
import { confirmState, useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import { formatNumberIn } from '@/ui/number'
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
import SectionDts from './dts/SectionDts.vue'
import { useDts } from './dts/useDts'
import { saveFile } from './dtFiles'
import { useDtGoods } from './goods/useDtGoods'
import { goodsFieldFromReadiness } from './goods/goodsFieldTarget'
import { taxModeLabelKey } from './goods/editor/payments'
import type { GoodsPageContext, GoodsSaveState } from './goods/editor/types'
import { DT_CLASSIFIERS } from './dtClassifiers'
import { fillStatUsd, lockGoodsCurrency } from './dtGoodsRules'
import { syncLoadedParties } from './dtParties'
import {
  adjacentSection, navMarks, paymentsStale, rateTag, readonlyReason, sectionFromQuery, splitChildren, visibleSections,
} from './dtPageModel'
import { DT_ROUTE, type DtSectionKey } from './dtSections'
import { useDtForm } from './useDtForm'
import { useDtPayments } from './useDtPayments'
import { useDtRates } from './useDtRates'
import { useDtReadiness, type DtReadinessItem } from './useDtReadiness'

// Страница ДТ Импорт 40 (редизайн, волна 6а, Task 3; доски DtGeneral, DtReadonly): закреплённая шапка, слева
// разделы с графами и отметками готовности сервера, справа «До подачи» (< 1280 — выезжающая из шапки), плашки
// просмотра и разделения. Активный раздел — в адресе (?s=), разделы монтируются лениво (v-if + KeepAlive).
// Разделы шапки (номер … завершение) — свои, на Z-ките (sections/); «Товары» — goods/ (волна 6б); «Платежи» (гр. 47, В) —
// одно действие «Рассчитать» (волна 6в, useDtPayments); «ДТС» — dts/ (волна 6в, один загрузчик useDts; правой колонки
// там нет). Логика — в composables: форма и сохранение (useDtForm), курсы (useDtRates), готовность (useDtReadiness),
// расчёты (useDtPayments), ДТС (useDts).
const { t, locale } = useI18n()
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
// ДТС: один загрузчик GET …/dts — для навигации, «До подачи» и самого раздела (§5-8: прежде раздел грузил ещё раз).
// Действиям раздела — сохранение и шаг 1 расчёта платежей (форма и платежи создаются ниже — вызываются позже).
const dts = useDts(caseId, dtId, {
  enabled: readinessOn,
  editable: () => dt.editable.value,
  saveForAction: () => dt.saveForAction(),
  save: () => dt.save(),
  recalcCustomsValues: () => payments.recalcCustomsValues(),
})

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
  onLoadStart: () => { readiness.reset(); dts.reset() },
  onLoaded: (dto, kase) => {
    replaced.value = !!dto.isSplitReplaced
    // Как прежний экран при загрузке: гр. 8 / 9 с «Совпадает с декларантом» повторяют гр. 14, валюта товаров = гр. 22
    // (под applying — без автосейва).
    syncLoadedParties(form)
    syncGoodsCurrency()
    void readiness.refresh()
    void dts.refresh()
    loadClientProfile(kase)
  },
  onSaved: () => {
    void readiness.afterSave()
    void dts.refresh()
  },
})
const form = dt.form

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

// Расчёт платежей: «Рассчитать» (шапка, итоги товаров, раздел «Платежи», ?calc=payments) → предпросмотр → «Записать».
// Предпросмотр сбрасывается по версии правок формы (изменились товары после расчёта).
const payments = useDtPayments(form, caseId, dtId, {
  save: () => dt.save(),
  editable: () => dt.editable.value,
  editVersion: dt.editVersion,
  canSave: () => !dt.conflict.value && !dt.loading.value,
})

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

// «Рассчитать платежи» (шапка, итоги товаров, ?calc=payments): открыть «Платежи» и запустить расчёт (только при праве).
const calcPayments = async () => {
  if (!editable.value) return
  await setSection('payments')
  void payments.calculate()
}

// Временный контейнер «Платежей» (до Task 3): подпись вида и сумма без копеек.
const modeLabel = (code: string) => {
  const key = taxModeLabelKey(code)
  return key ? t(`broker.dt.goods.editor.payments.modes.${key}`) : ''
}
const money0 = (n: number) => formatNumberIn(String(locale.value), n, 0)
/** Ошибки и примечания расчёта по товарам («Товар N: …»). */
const previewIssues = computed(() => (payments.result.value?.goodsRows ?? []).flatMap((r) =>
  [r.error, r.notes].filter((x): x is string => !!x).map((x) => `${t('broker.dt.payments.item', { n: r.index + 1 })}: ${x}`)))

const allItems = computed<DtReadinessItem[]>(() => [...readiness.items.value, ...(dts.items.value ?? [])])
const marks = computed(() => {
  const bySection: Partial<Record<DtSectionKey, number>> = {}
  for (const i of allItems.value) bySection[i.section] = (bySection[i.section] ?? 0) + 1
  return navMarks({ keys: sectionKeys.value, readinessLoaded: readiness.loaded.value, bySection, dtsLoaded: dts.items.value !== null })
})
const staleSections = computed<DtSectionKey[]>(() => (paymentsStale(form.goodsItems) ? ['payments'] : []))

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
  // Сервер пересчитывает платежи новых ДТ; не по всем — в ДТ ВТО сразу откроются «Платежи» с расчётом (?calc=payments).
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

// Только что созданная ДТ ВТО (разделение): «Платежи» и сразу расчёт по ставкам ВТО (только при праве править).
let calcHandled = false
watch(() => dt.loading.value, (loading) => {
  if (loading || calcHandled || !form.id) return
  calcHandled = true
  if (route.query.calc !== 'payments') return
  const { calc: _drop, ...rest } = route.query
  void router.replace({ query: rest }).then(() => calcPayments())
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

// ДТС перечитывается при каждом входе в раздел (загрузку и сохранения ведут onLoaded/onSaved); идёт загрузка после
// сохранения — вход ждёт её, второго запроса нет.
watch(active, (k, prev) => { if (k === 'dts' && prev !== 'dts') void dts.refresh({ reuse: true }) })
// Справочник расходов — подписи статей добавочного листа ДТС.
const expenseLabels = computed(() => Object.fromEntries(expenseTypeOptions.value.map((o) => [String(o.value), o.label])))
// На «ДТС» правой колонки нет (добавочный лист — на всю ширину): «До подачи» — кнопкой в шапке и на широком экране.
const asideOff = computed(() => active.value === 'dts')
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
        :panel-toggle="{ show: true, count: readiness.loaded.value ? allItems.length : null, ratesOnly: !readinessOn, wide: asideOff }"
        @save="onSave"
        @calc-payments="calcPayments"
        @xml="onXml"
        @print="onPrint"
        @docs="onDocs"
        @split="onSplit"
        @open-panel="panelOpen = true"
      />

      <div
        :class="[
          'grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-4 pt-5 md:grid-cols-[200px_minmax(0,1fr)]',
          !asideOff && 'xl:grid-cols-[200px_minmax(0,1fr)_268px]',
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
                @calc-payments="calcPayments"
              />
              <SectionDocs
                v-else-if="active === 'docs'"
                :form="form"
                :readonly="!editable"
              />
              <!-- GET …/dts — только декларанту: раздел не рендерится вовсе (не просто скрыт). Данные — общий загрузчик. -->
              <SectionDts
                v-else-if="active === 'dts' && canManage"
                :form="form"
                :readonly="!editable"
                :dts="dts"
                :expense-labels="expenseLabels"
                @open-panel="panelOpen = true"
              />
              <SectionClosing
                v-else-if="active === 'closing'"
                :form="form"
                :readonly="!editable"
              />
            </KeepAlive>
            <!-- «Платежи» (волна 6в, Task 2 — временный контейнер до раздела SectionPayments, Task 3): «Рассчитать»,
                 предпросмотр итогов по видам с «Записать», фактические платежи гр. В (перенесены из «Завершения»). -->
            <section v-if="active === 'payments'" class="flex flex-col gap-4" data-dt-payments :data-state="payments.state.value">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="m-0 text-[15px] font-semibold text-ink">
                  {{ t('broker.dt.sections.payments') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '47, В' }) }}</span>
                </h2>
                <ZButton
                  v-if="editable"
                  class="ml-auto max-sm:h-11"
                  :loading="payments.loading.value"
                  :disabled="payments.applying.value"
                  data-payments-calc
                  @click="payments.calculate()"
                >{{ t('broker.dt.payments.calc') }}</ZButton>
              </div>
              <div v-if="payments.result.value" class="flex flex-col gap-3 rounded-row border border-line p-4" data-payments-preview>
                <ZAlert v-if="payments.state.value === 'stale-preview'" type="warning" :message="t('broker.dt.payments.changed')" data-payments-changed />
                <dl class="m-0 flex flex-col gap-1.5">
                  <div v-for="row in payments.previewTotals.value" :key="row.code" class="flex justify-between gap-4 text-sm" :data-payments-total="row.code">
                    <dt class="text-ink-2"><span class="font-mono text-muted">{{ row.code }}</span> {{ modeLabel(row.code) }}</dt>
                    <dd class="m-0 font-semibold tabular-nums text-ink">{{ money0(row.amount) }} ₸</dd>
                  </div>
                </dl>
                <ul v-if="previewIssues.length" class="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-ink-2" data-payments-issues>
                  <li v-for="line in previewIssues" :key="line">{{ line }}</li>
                </ul>
                <ZButton
                  v-if="editable"
                  variant="primary"
                  class="self-start max-sm:h-11"
                  :loading="payments.applying.value"
                  :disabled="payments.state.value !== 'preview'"
                  data-payments-apply
                  @click="payments.apply()"
                >{{ t('broker.dt.payments.apply') }}</ZButton>
              </div>
              <section data-dt-fact-payments data-graph="В">
                <h3 class="m-0 mb-3 text-[14px] font-semibold text-ink">
                  {{ t('broker.dt.payments.fact') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: 'В' }) }}</span>
                </h3>
                <Import40FactPaymentsSection v-model="form.factPayments" :readonly="!editable" />
              </section>
            </section>
          </div>
        </div>

        <aside v-if="!asideOff" class="hidden xl:sticky xl:top-[calc(var(--dt-header-h)+20px)] xl:block xl:self-start" data-dt-panel-aside>
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
    </template>
  </div>
</template>
