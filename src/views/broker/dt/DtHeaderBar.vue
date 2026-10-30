<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator, PhCode, PhDotsThree, PhDownloadSimple, PhEye, PhFileDoc, PhListChecks, PhPrinter } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import { calendarLocale } from '@/ui/date'
import { cn } from '@/ui/cn'
import type { DtRateTag } from './dtPageModel'
import DtTitleEdit from './DtTitleEdit.vue'
import { listPath } from '@/shell/listReturn'

// Закреплённая шапка ДТ (доски DtGeneral, DtReadonly): крошки «Заявки / № · клиент / ДТ», номер ДТ (моно),
// тег ЕТТ/ВТО/«Разделена», состояние сохранения; справа — «Сохранить» (⌘S), «Рассчитать платежи»,
// «Сформировать XML», «Ещё» (печать, все документы, «Разделить на ЕТТ/ВТО» с причиной недоступности).
// В просмотре — «Печать бланка» и «Все документы» кнопками (без сохранения), в «Ещё» — только «Разделить» с причиной
// (фидбек №17: пункт виден всем, кроме клиента). Уже 1280 px — кнопка «До подачи» (панель справа уходит в выезжающую).
// 23.10.2026: заголовок — название ДТ (своё или автоназвание, приглушённым), рядом моно — номер или «ДТ i»; карандаш —
// переименовать на месте (rename задан — право CanManageDeclarations). В «Ещё» — «Уведомление (Решение 130)» и
// «Обязательство (условный выпуск)» (forms, то же право) — и в просмотре: документ строится по сохранённой ДТ.
const props = defineProps<{
  caseId: string
  caseNumber: string | null
  clientName: string | null
  number: string | null
  /** Своё название ДТ (23.10.2026); null — нет. */
  title?: string | null
  /** Автоназвание (dtTitle.dtAutoTitle по форме); null — нет. */
  autoTitle?: string | null
  /** Короткий идентификатор рядом с названием: номер или «ДТ i»; не задан — number. */
  shortId?: string | null
  /** Переименовать (своё название, null — автоназвание); null — без карандаша. */
  rename?: ((title: string | null) => Promise<boolean>) | null
  /** Пункты «Ещё»: уведомление по Решению 130 и обязательство при условном выпуске. */
  forms?: { notice130: boolean; obligation: boolean }
  tag: DtRateTag | null
  editable: boolean
  /** XML: право декларанта (сервер отдаёт XML и в просмотре), не для разделённой ДТ. */
  canXml: boolean
  saving: boolean
  dirty: boolean
  failed: boolean
  savedAt: Date | null
  xmlLoading?: boolean
  printLoading?: boolean
  docsLoading?: boolean
  paymentsLoading?: boolean
  /**
   * Пункт «Разделить на ЕТТ/ВТО»: показан (не клиенту), причина недоступности ('' — доступен); label — другой текст пункта
   * («Изменить разделение» у исходной ДТ).
   */
  split: { show: boolean; reason: string; label?: string }
  /**
   * Кнопка «До подачи» для узкого экрана; число пунктов (null — неизвестно); ratesOnly — в панели только курсы;
   * wide — и на широком экране (в разделе нет правой колонки — «ДТС»).
   */
  panelToggle: { show: boolean; count: number | null; ratesOnly?: boolean; wide?: boolean }
}>()
const emit = defineEmits<{
  save: []
  calcPayments: []
  xml: []
  print: []
  docs: []
  split: []
  openPanel: []
  notice130: []
  obligation: []
}>()
const { t, locale } = useI18n()

const crumbs = computed(() => [
  // Последний адрес списка заявок — с вкладкой и фильтрами (30.10.2026, аудит S-20).
  { label: t('broker.dt.page.requests'), to: listPath('requests', '/import-40') },
  {
    label: props.caseNumber
      ? (props.clientName ? t('broker.dt.page.caseCrumb', { number: props.caseNumber, client: props.clientName }) : props.caseNumber)
      : t('broker.dt.page.dtCrumb'),
    to: `/import-40/${props.caseId}`,
  },
  { label: t('broker.dt.page.dtCrumb') },
])

const TAG_DOT = { ett: 'bg-zircon-ink', vto: 'bg-tone-submitted-fg', source: 'bg-ink-3' } as const

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const kbd = isMac ? '⌘S' : 'Ctrl S'
const kbdAria = isMac ? 'Meta+S' : 'Control+S'

const savedTime = computed(() => (props.savedAt
  ? new Intl.DateTimeFormat(calendarLocale(locale.value), { hour: '2-digit', minute: '2-digit' }).format(props.savedAt)
  : ''))
type SaveState = 'saving' | 'failed' | 'dirty' | 'saved' | null
const saveState = computed<SaveState>(() => {
  if (props.saving) return 'saving'
  if (props.failed) return 'failed'
  if (props.dirty) return 'dirty'
  return props.savedAt ? 'saved' : null
})
const STATE_DOT: Record<Exclude<SaveState, null>, string> = {
  saving: 'bg-gold', failed: 'bg-danger', dirty: 'bg-gold', saved: 'bg-tone-done-fg',
}

const moreItems = computed<ZDropdownItem[]>(() => {
  const print: ZDropdownItem[] = props.editable
    ? [
        { key: 'print', label: t('broker.dt.header.print'), icon: PhPrinter, disabled: !!props.printLoading },
        { key: 'docs', label: t('broker.dt.header.docs'), icon: PhDownloadSimple, disabled: !!props.docsLoading },
      ]
    : []
  const forms: ZDropdownItem[] = [
    ...(props.forms?.notice130 ? [{ key: 'notice130', label: t('broker.dt.header.notice130'), icon: PhFileDoc }] : []),
    ...(props.forms?.obligation ? [{ key: 'obligation', label: t('broker.dt.header.obligation'), icon: PhFileDoc }] : []),
  ]
  if (forms.length && print.length) forms[0] = { ...forms[0], divider: true }
  const split: ZDropdownItem[] = props.split.show
    ? [{
        key: 'split', label: props.split.label ?? t('broker.dt.header.split'), disabled: !!props.split.reason,
        hint: props.split.reason || undefined, divider: print.length + forms.length > 0,
      }]
    : []
  return [...print, ...forms, ...split]
})
const onMore = (key: string) => {
  if (key === 'print') emit('print')
  else if (key === 'docs') emit('docs')
  else if (key === 'split') emit('split')
  else if (key === 'notice130') emit('notice130')
  else if (key === 'obligation') emit('obligation')
}

// Заголовок: название (своё или автоназвание) и рядом идентификатор; без названия — идентификатор заголовком.
const idText = computed(() => props.shortId || props.number || t('broker.dt.page.untitled'))
const ownTitle = computed(() => (props.title ?? '').trim() || null)
const titleText = computed(() => ownTitle.value ?? props.autoTitle ?? null)
const renameOrSkip = (v: string | null): Promise<boolean> => (props.rename ? props.rename(v) : Promise.resolve(false))

// Шапка липкая только с 768px (md:sticky): на телефоне она с действиями занимала треть экрана (QA-E).
// Корень шаблона — один <header> без комментариев рядом: DtPage меряет его высоту через $el.
const outline = 'border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11'
</script>

<template>
  <header
    class="z-[6] mx-[calc(var(--shell-main-px,1rem)*-1)] border-b border-line bg-surface px-(--shell-main-px,1rem) pt-3.5 pb-3 md:sticky md:top-0"
    data-dt-header
  >
    <ZBreadcrumbs :items="crumbs" />
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <template v-if="titleText">
          <DtTitleEdit
            as="h1"
            :title="title"
            :auto-title="autoTitle ?? null"
            :can-edit="!!rename"
            :save="renameOrSkip"
            text-class="text-[20px] leading-[1.25] font-semibold tracking-[-0.01em]"
          />
          <span class="font-mono text-[13px] font-medium text-ink-3 [overflow-wrap:anywhere]" data-dt-number>{{ idText }}</span>
        </template>
        <template v-else>
          <h1 class="m-0 min-w-0 font-mono text-[20px] leading-[1.25] font-semibold tracking-[-0.01em] text-ink [overflow-wrap:anywhere]" data-dt-number>
            {{ idText }}
          </h1>
          <DtTitleEdit
            v-if="rename"
            :title="null"
            :auto-title="null"
            can-edit
            :save="rename"
          />
        </template>
        <span v-if="tag" class="inline-flex items-center gap-1.5 text-[13px] text-ink-2" :data-dt-tag="tag.kind">
          <span :class="cn('size-[7px] rounded-pill', TAG_DOT[tag.kind])" aria-hidden="true" />{{ t(`broker.dt.header.tag.${tag.kind}`) }}
        </span>
        <!-- Чип «КЕДЕН» (17.10): статус ДТ из журнала КЕДЕН, связь/отвязка — DtKedenChip. -->
        <slot name="status" />
        <span v-if="!editable" class="inline-flex items-center gap-1.5 text-[12.5px] text-muted" data-dt-save-state="view">
          <PhEye :size="14" aria-hidden="true" />{{ t('broker.dt.header.state.view') }}
        </span>
        <span v-else-if="saveState" class="inline-flex items-center gap-1.5 text-[12.5px] text-muted" role="status" :data-dt-save-state="saveState">
          <span :class="cn('size-[7px] rounded-pill', STATE_DOT[saveState])" aria-hidden="true" />
          <template v-if="saveState === 'saved'">{{ t('broker.dt.header.state.savedAt', { time: savedTime }) }}</template>
          <template v-else>{{ t(`broker.dt.header.state.${saveState}`) }}</template>
        </span>
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <ZButton
          v-if="panelToggle.show"
          :class="cn(outline, !panelToggle.wide && 'xl:hidden')"
          aria-haspopup="dialog"
          data-dt-panel-toggle
          @click="emit('openPanel')"
        >
          <PhListChecks :size="16" aria-hidden="true" />
          <template v-if="panelToggle.ratesOnly">{{ t('broker.dt.panel.rates') }}</template>
          <template v-else>{{ panelToggle.count ? t('broker.dt.header.readinessCount', { n: panelToggle.count }) : t('broker.dt.header.readiness') }}</template>
        </ZButton>

        <template v-if="editable">
          <ZButton variant="ghost" class="max-sm:h-11" :loading="saving" :aria-keyshortcuts="kbdAria" data-dt-save @click="emit('save')">
            {{ t('broker.dt.header.save') }}<ZKbd aria-hidden="true" class="max-md:hidden">{{ kbd }}</ZKbd>
          </ZButton>
          <ZButton :class="outline" :loading="paymentsLoading" data-dt-calc-payments @click="emit('calcPayments')">
            <PhCalculator :size="16" aria-hidden="true" />{{ t('broker.dt.header.calcPayments') }}
          </ZButton>
        </template>
        <template v-else>
          <ZButton :class="outline" :loading="printLoading" data-dt-print @click="emit('print')">
            <PhPrinter :size="16" aria-hidden="true" />{{ t('broker.dt.header.print') }}
          </ZButton>
          <ZButton variant="ghost" class="max-sm:h-11" :loading="docsLoading" data-dt-docs @click="emit('docs')">
            <PhDownloadSimple :size="16" aria-hidden="true" />{{ t('broker.dt.header.docs') }}
          </ZButton>
        </template>
        <ZButton v-if="canXml" variant="primary" class="max-sm:h-11" :loading="xmlLoading" data-dt-xml @click="emit('xml')">
          <PhCode :size="16" aria-hidden="true" />{{ t('broker.dt.header.xml') }}
        </ZButton>
        <ZDropdown v-if="moreItems.length" :items="moreItems" @select="onMore">
          <button
            type="button"
            :aria-label="t('broker.dt.header.more')"
            class="flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-2 outline-hidden transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none max-sm:size-11"
            data-dt-more
          >
            <PhDotsThree :size="20" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </div>
    </div>
  </header>
</template>
