<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { PhCode, PhDotsThree, PhDownloadSimple, PhPlus, PhSparkle } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown from '@/components/z/ZDropdown.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { import40Api, type Import40DeclarationDto, type Import40ExtractionResult } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { cn } from '@/ui/cn'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { formatMoney } from '@/ui/number'
import type { CaseStepProps } from '../caseContext'
import { hintText } from '../casePermissions'
import { dtLabel } from '../caseSteps'
import { dtListActive, dtPath, dtRowActions, filterDeclarations, missingPreview, previewToUpsert, splitTag } from '../declarations'
import ExtractionIssuesModal from './ExtractionIssuesModal.vue'
import QuoteImportModal from './QuoteImportModal.vue'

// Список ДТ шага 3 (доска Case): полоса «Декларации · N» с действиями, поиск при N > 1, строки ДТ.
// Строка: номер или «ДТ i» (ссылка на страницу ДТ), тег разделения ЕТТ/ВТО/«Разделена» (заменённая приглушена),
// «товаров: N», полоса заполненности из сводки готовности (ctx.readiness — без запросов по каждой ДТ) и «не хватает: …».
// Действия над списком (добавить, из документов, из КП, пакетная выгрузка, удалить) — только на текущем шаге 3
// (declarations.dtListActive). «Заполнить» и XML в строке — на текущем шаге 3 и после него тем, кто может править ДТ
// (perms.canEditDt — правило страницы ДТ и сервера: админ, РОП, назначенный декларант; решения владельца 09.10),
// остальным после шага 3 — «Открыть». «Заполнить» без права править — выключена с подсказкой (нет роли / ведёт коллега).
// Запросы — те же, что у прежней карточки; всё под общим замком ctx.actions (повторно не нажать).
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const all = computed(() => kase.value.declarations)
const editable = computed(() => dtListActive(kase.value.status, props.mode))
const canEditDt = computed(() => props.ctx.perms.canEditDt)
const rowActions = computed(() => dtRowActions(kase.value.status, props.mode, canEditDt.value))
const canDeclare = computed(() => props.ctx.perms.can('declarant'))
const declHint = computed(() => (canDeclare.value ? '' : hintText({ kind: 'role', role: 'declarant' }, t)))
const fillHint = computed(() => hintText(props.ctx.perms.dtEditHint, t))
const busy = () => props.ctx.actions.busy()
const pending = (key: string) => props.ctx.actions.isPending(key)
const blocked = (key: string) => !canDeclare.value || (busy() && !pending(key))

const tags = computed(() => new Map(all.value.map((d) => [d.id, splitTag(d, all.value, t)])))

const query = ref('')
const rows = computed(() => filterDeclarations(all.value, query.value))

const readinessById = computed(() => new Map<string, DeclarationReadiness>((props.ctx.readiness ?? []).map((r) => [r.declarationId, r])))
const readyCount = computed(() => (props.ctx.readiness ?? []).filter((r) => r.isReady).length)
const totalCount = computed(() => props.ctx.readiness?.length || all.value.length)
const readinessOf = (dt: Import40DeclarationDto) => (editable.value ? readinessById.value.get(dt.id) ?? null : null)
const percent = (r: DeclarationReadiness) => (r.total > 0 ? Math.round((r.filled / r.total) * 100) : 0)

const expanded = reactive<Record<string, boolean>>({})
// Свёрнутый «не хватает: …» — не больше двух строк (длинные названия граф не распирают строку ДТ), полный список — в title.
const missingShown = (r: DeclarationReadiness) => (expanded[r.declarationId] ? { shown: r.missing, rest: 0 } : missingPreview(r.missing))

const metaLine = (dt: Import40DeclarationDto) => {
  const parts = [t('import40Case.goodsCount', { n: dt.goodsItems?.length ?? 0 })]
  if (dt.totalInvoiceValue != null) parts.push(t('broker.case.declaring.list.value', { value: formatMoney(dt.totalInvoiceValue, dt.currency || '').trim() }))
  return parts.join(' · ')
}

// --- действия над ДТ ---
const addDt = () => props.ctx.actions.mutate('dt-add', () => import40Api.createDeclaration(kase.value.id, {}), { done: 'broker.case.done.dtAdded' })

const removeDt = async (dt: Import40DeclarationDto) => {
  const ok = await confirm({
    title: t('import40Case.deleteDt'),
    content: dtLabel(kase.value, dt.id, t),
    okText: t('broker.case.declaring.list.deleteOk'),
    cancelText: t('broker.case.declaring.list.keep'),
    danger: true,
  })
  if (!ok) return
  await props.ctx.actions.mutate(`dt-delete:${dt.id}`, () => import40Api.deleteDeclaration(kase.value.id, dt.id), { done: 'broker.case.done.dtDeleted' })
}
const menuItems = computed(() => [{ key: 'delete', label: t('broker.case.declaring.list.delete'), danger: true }])
const onMenu = (dt: Import40DeclarationDto, key: string) => { if (key === 'delete') void removeDt(dt) }

// XML для КЕДЕН по одной ДТ: 400 → список «Для XML не хватает данных» под строкой; файл — скачивание и подсказка про гр.54.
const xmlMissing = ref<{ id: string; errors: string[] } | null>(null)
const exportXml = async (dt: Import40DeclarationDto) => {
  xmlMissing.value = null
  let res: Awaited<ReturnType<typeof import40Api.downloadKedenXml>> | null = null
  const ok = await props.ctx.actions.mutate(`dt-xml:${dt.id}`, async () => { res = await import40Api.downloadKedenXml(kase.value.id, dt.id) }, { reload: false })
  const out = res as Awaited<ReturnType<typeof import40Api.downloadKedenXml>> | null
  if (!ok || !out) return
  if ('errors' in out) {
    xmlMissing.value = { id: dt.id, errors: out.errors }
    message.warning(t('import40Case.xmlNotFormed'))
    return
  }
  saveBlob(out.blob, out.fileName)
  // Гр.54 КЕДЕН из XML не переносит — подсказка, как раньше, 8 секунд.
  message.success({ content: `${t('import40Case.xmlFormed')}. ${t('dt.xmlGr54Hint')}`, duration: 8 })
  void props.ctx.actions.reload() // в журнале появилась запись о выгрузке
}

// Пакетная выгрузка готовых ДТ одним zip.
const exportBatch = async () => {
  let res: Awaited<ReturnType<typeof import40Api.downloadKedenBatch>> | null = null
  const ok = await props.ctx.actions.mutate('dt-xml-batch', async () => { res = await import40Api.downloadKedenBatch(kase.value.id) }, { reload: false })
  const out = res as Awaited<ReturnType<typeof import40Api.downloadKedenBatch>> | null
  if (!ok || !out) return
  if ('error' in out) {
    message.warning(out.error)
    return
  }
  saveBlob(out.blob, out.fileName)
  message.success(t('import40Case.batchExported'))
  void props.ctx.actions.reload()
}

// «Из документов»: пакет файлов → извлечение (Aqniet) → создание ДТ → переход к ней; при конфликтах/замечаниях —
// сначала окно замечаний, переход — при его закрытии. Ошибка — тост с этапом, на котором остановились.
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const fileInput = ref<HTMLInputElement | null>(null)
const issues = ref<Import40ExtractionResult | null>(null)
const issuesOpen = ref(false)
let pendingDt: string | null = null

const pickBatch = () => fileInput.value?.click()
const onBatchFiles = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = '' // тот же набор можно выбрать снова
  if (!files.length || busy()) return
  const caseId = kase.value.id
  let stage: 'extract' | 'create' = 'extract'
  let result: Import40ExtractionResult | null = null
  let createdId: string | null = null
  const ok = await props.ctx.actions.mutate('dt-batch', async () => {
    result = await import40Api.extractBatch(caseId, files)
    stage = 'create'
    const created = await import40Api.createDeclaration(caseId, previewToUpsert(result.declaration))
    createdId = created.id
  }, { reload: false })
  const extracted = result as Import40ExtractionResult | null
  const dtId = createdId as string | null
  if (!ok || !extracted || !dtId) {
    message.error(t(stage === 'extract' ? 'broker.case.declaring.batch.failedExtract' : 'broker.case.declaring.batch.failedCreate'))
    return
  }
  message.success(t('import40Case.batchProcessed'))
  if (extracted.conflicts.length || extracted.warnings.length) {
    issues.value = extracted
    pendingDt = dtId
    issuesOpen.value = true
    return
  }
  await router.push(dtPath(caseId, dtId))
}
const closeIssues = () => {
  issuesOpen.value = false
  const dtId = pendingDt
  pendingDt = null
  if (dtId) void router.push(dtPath(kase.value.id, dtId))
}

const quoteOpen = ref(false)

const iconBase = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden transition-colors duration-150 focus-visible:shadow-focus enabled:hover:bg-sunken enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-progress motion-reduce:transition-none max-sm:size-11'
const toolBtn = 'max-sm:min-h-11'
</script>

<template>
  <div :class="cn(mode === 'done' && 'overflow-hidden rounded-row border border-line')" data-dt-list>
    <div
      :class="cn('flex flex-wrap items-center gap-x-2 gap-y-2 bg-canvas px-4 py-2.5', mode === 'current' && 'border-t border-line')"
      data-dt-strip
    >
      <h3 class="m-0 text-[13px] font-medium text-ink-3">{{ t('broker.case.declaring.list.title') }}</h3>
      <span class="rounded-pill bg-sunken px-1.5 text-[11.5px] font-semibold tabular-nums text-ink-3" data-dt-count>{{ all.length }}</span>

      <div v-if="editable" class="ml-auto flex flex-wrap justify-end gap-1.5 max-sm:ml-0 max-sm:w-full max-sm:justify-start" data-dt-toolbar>
        <template v-if="kase.status === 2">
          <ZTooltip :title="declHint">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-add')" :loading="pending('dt-add')" data-dt-add @click="addDt">
                <PhPlus :size="15" aria-hidden="true" />{{ t('import40Case.addDt') }}
              </ZButton>
            </span>
          </ZTooltip>
          <ZTooltip :title="declHint || t('broker.case.declaring.list.fromDocsHint')">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-batch')" :loading="pending('dt-batch')" data-dt-from-docs @click="pickBatch">
                <PhSparkle :size="15" aria-hidden="true" />{{ pending('dt-batch') ? t('broker.case.declaring.list.fromDocsBusy') : t('broker.case.declaring.list.fromDocs') }}
              </ZButton>
            </span>
          </ZTooltip>
          <input ref="fileInput" type="file" multiple :accept="ACCEPT" class="hidden" data-dt-batch-input @change="onBatchFiles" />
          <ZTooltip :title="declHint">
            <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
              <ZButton variant="ghost" size="sm" :class="toolBtn" :disabled="blocked('dt-quote')" data-dt-quote @click="quoteOpen = true">
                {{ t('import40Case.importQuote') }}
              </ZButton>
            </span>
          </ZTooltip>
        </template>
        <ZTooltip v-if="all.length && canDeclare" :title="t('import40Case.readyCount', { ready: readyCount, total: totalCount })">
          <span class="inline-flex" tabindex="0">
            <ZButton
              size="sm"
              :class="toolBtn"
              :disabled="readyCount === 0 || blocked('dt-xml-batch')"
              :loading="pending('dt-xml-batch')"
              data-dt-xml-batch
              @click="exportBatch"
            >
              <PhDownloadSimple :size="15" aria-hidden="true" />{{ t('broker.case.declaring.list.xmlReady', { n: readyCount }) }}
            </ZButton>
          </span>
        </ZTooltip>
      </div>
    </div>

    <div v-if="all.length > 1" class="border-t border-line px-4 py-2.5">
      <ZInput
        v-model:value="query"
        type="search"
        allow-clear
        :placeholder="t('import40Case.searchDt')"
        :aria-label="t('import40Case.searchDt')"
        class="w-full max-w-[320px] max-sm:max-w-none"
        data-dt-search
      />
    </div>

    <div v-if="!all.length" class="border-t border-line px-4 py-5" data-dt-empty>
      <p class="m-0 text-sm text-ink-2">{{ t('import40Case.noDt') }}</p>
      <p v-if="editable && kase.status === 2 && canDeclare" class="m-0 mt-1 text-[13px] text-muted">{{ t('broker.case.declaring.list.emptyHint') }}</p>
    </div>
    <p v-else-if="!rows.length" class="m-0 border-t border-line px-4 py-4 text-sm text-ink-3" data-dt-nothing>{{ t('broker.case.declaring.list.nothingFound') }}</p>

    <ul v-else role="list" class="m-0 list-none p-0">
      <li
        v-for="dt in rows"
        :key="dt.id"
        class="grid grid-cols-1 items-center gap-x-4 gap-y-2.5 border-t border-line px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
        :data-dt-row="dt.id"
      >
        <div :class="cn('min-w-0', dt.isSplitReplaced && 'opacity-55')">
          <div class="flex flex-wrap items-center gap-2">
            <RouterLink
              :to="dtPath(kase.id, dt.id)"
              class="rounded-[4px] font-mono text-sm font-medium text-ink no-underline outline-hidden hover:text-zircon-ink hover:underline focus-visible:shadow-focus"
              data-dt-link
            >{{ dtLabel(kase, dt.id, t) }}</RouterLink>
            <ZTooltip v-if="tags.get(dt.id)" :title="tags.get(dt.id)!.tip">
              <span class="inline-flex" :tabindex="tags.get(dt.id)!.tip ? 0 : undefined">
                <ZTag :tone="tags.get(dt.id)!.tone" size="sm" data-dt-split>{{ tags.get(dt.id)!.label }}</ZTag>
              </span>
            </ZTooltip>
          </div>
          <div class="mt-0.5 text-[12.5px] text-muted tabular-nums" data-dt-meta>{{ metaLine(dt) }}</div>
        </div>

        <div class="min-w-0" data-dt-readiness>
          <template v-if="readinessOf(dt)">
            <div class="flex items-center gap-2.5">
              <span
                role="progressbar"
                :aria-valuemin="0"
                :aria-valuemax="readinessOf(dt)!.total"
                :aria-valuenow="readinessOf(dt)!.filled"
                :aria-label="t('broker.case.declaring.list.progress', { filled: readinessOf(dt)!.filled, total: readinessOf(dt)!.total })"
                class="block h-1.5 w-[120px] max-w-full shrink overflow-hidden rounded-pill bg-sunken"
              >
                <span
                  :class="cn('block h-full rounded-pill', readinessOf(dt)!.isReady ? 'bg-tone-done-fg' : 'bg-gold')"
                  :style="{ width: `${percent(readinessOf(dt)!)}%` }"
                />
              </span>
              <span class="text-[12.5px] font-medium tabular-nums text-ink-2" data-dt-graphs>
                {{ t('broker.case.declaring.list.graphs', { filled: readinessOf(dt)!.filled, total: readinessOf(dt)!.total }) }}
              </span>
            </div>
            <div v-if="readinessOf(dt)!.isReady" class="mt-1 text-xs text-tone-done-fg" data-dt-ready>{{ t('broker.case.declaring.list.ready') }}</div>
            <div
              v-else-if="readinessOf(dt)!.missing.length"
              class="mt-1 text-xs text-gold-ink"
              :title="t('broker.case.declaring.list.missing', { list: readinessOf(dt)!.missing.join(', ') })"
              data-dt-missing
            >
              <span :class="['break-words', !expanded[dt.id] && 'line-clamp-2']" data-dt-missing-text>{{
                t('broker.case.declaring.list.missing', { list: missingShown(readinessOf(dt)!).shown.join(', ') })
              }}</span>
              <button
                v-if="missingPreview(readinessOf(dt)!.missing).rest > 0"
                type="button"
                :aria-expanded="!!expanded[dt.id]"
                class="cursor-pointer rounded-[4px] border-0 bg-transparent p-0 font-sans text-xs font-medium text-gold-ink underline underline-offset-2 outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
                data-dt-missing-more
                @click="expanded[dt.id] = !expanded[dt.id]"
              >{{ expanded[dt.id] ? t('broker.case.declaring.list.less') : t('broker.case.declaring.list.more', { n: missingPreview(readinessOf(dt)!.missing).rest }) }}</button>
            </div>
          </template>
        </div>

        <div class="flex items-center gap-1.5 sm:justify-end" data-dt-actions>
          <template v-if="rowActions">
            <ZTooltip :title="fillHint">
              <span class="inline-flex" :tabindex="fillHint ? 0 : undefined">
                <ZButton size="sm" :class="toolBtn" :disabled="!canEditDt" data-dt-fill @click="router.push(dtPath(kase.id, dt.id))">
                  {{ t('import40Case.fill') }}
                </ZButton>
              </span>
            </ZTooltip>
            <ZTooltip :title="declHint || t('import40Case.xmlForKeden')">
              <span class="inline-flex" :tabindex="declHint ? 0 : undefined">
                <button
                  type="button"
                  :class="iconBase"
                  :disabled="blocked(`dt-xml:${dt.id}`)"
                  :aria-busy="pending(`dt-xml:${dt.id}`) || undefined"
                  :aria-label="t('import40Case.xmlForKeden')"
                  data-dt-xml
                  @click="!pending(`dt-xml:${dt.id}`) && exportXml(dt)"
                >
                  <PhCode :size="16" aria-hidden="true" />
                </button>
              </span>
            </ZTooltip>
            <ZDropdown v-if="editable && canEditDt" :items="menuItems" @select="onMenu(dt, $event)">
              <button
                type="button"
                :class="iconBase"
                :disabled="busy() && !pending(`dt-delete:${dt.id}`)"
                :aria-busy="pending(`dt-delete:${dt.id}`) || undefined"
                :aria-label="t('broker.case.declaring.list.actions', { label: dtLabel(kase, dt.id, t) })"
                data-dt-more
              >
                <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
              </button>
            </ZDropdown>
          </template>
          <RouterLink
            v-else
            :to="dtPath(kase.id, dt.id)"
            class="inline-flex h-7 items-center rounded-field bg-sunken px-2.5 text-xs font-semibold text-ink no-underline outline-hidden hover:bg-line-strong focus-visible:shadow-focus max-sm:min-h-11"
            data-dt-open
          >{{ t('broker.case.declaring.list.open') }}</RouterLink>
        </div>

        <ZAlert
          v-if="rowActions && xmlMissing?.id === dt.id"
          type="warning"
          show-icon
          :message="t('import40Case.xmlMissingTitle')"
          class="sm:col-span-3"
          data-dt-xml-missing
        >
          <ul class="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
            <li v-for="m in xmlMissing.errors" :key="m">{{ m }}</li>
          </ul>
        </ZAlert>
      </li>
    </ul>

    <QuoteImportModal v-if="editable" v-model:open="quoteOpen" :ctx="ctx" />
    <ExtractionIssuesModal v-if="editable" :open="issuesOpen" :issues="issues" @close="closeIssues" />
  </div>
</template>
