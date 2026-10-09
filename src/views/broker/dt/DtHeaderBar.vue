<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCalculator, PhCode, PhDotsThree, PhDownloadSimple, PhEye, PhListChecks, PhPrinter } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZKbd from '@/components/z/ZKbd.vue'
import { calendarLocale } from '@/ui/date'
import { cn } from '@/ui/cn'
import type { DtRateTag } from './dtPageModel'

// Закреплённая шапка ДТ (доски DtGeneral, DtReadonly): крошки «Заявки / № · клиент / ДТ», номер ДТ (моно),
// тег ЕТТ/ВТО/«Разделена», состояние сохранения; справа — «Сохранить» (⌘S), «Рассчитать платежи»,
// «Сформировать XML», «Ещё» (печать, все документы, «Разделить на ЕТТ/ВТО» с причиной недоступности).
// В просмотре — «Печать бланка» и «Все документы» кнопками (без сохранения), в «Ещё» — только «Разделить» с причиной
// (фидбек №17: пункт виден всем, кроме клиента). Уже 1280 px — кнопка «До подачи» (панель справа уходит в выезжающую).
const props = defineProps<{
  caseId: string
  caseNumber: string | null
  clientName: string | null
  number: string | null
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
  /** Пункт «Разделить на ЕТТ/ВТО»: показан (не клиенту), причина недоступности ('' — доступен). */
  split: { show: boolean; reason: string }
  /** Кнопка «До подачи» для узкого экрана; число пунктов (null — неизвестно); ratesOnly — в панели только курсы. */
  panelToggle: { show: boolean; count: number | null; ratesOnly?: boolean }
}>()
const emit = defineEmits<{
  save: []
  calcPayments: []
  xml: []
  print: []
  docs: []
  split: []
  openPanel: []
}>()
const { t, locale } = useI18n()

const crumbs = computed(() => [
  { label: t('broker.dt.page.requests'), to: '/import-40' },
  {
    label: props.caseNumber
      ? (props.clientName ? t('broker.dt.page.caseCrumb', { number: props.caseNumber, client: props.clientName }) : props.caseNumber)
      : t('broker.dt.page.dtCrumb'),
    to: `/import-40/${props.caseId}`,
  },
  { label: t('broker.dt.page.dtCrumb') },
])

const TAG_DOT = { ett: 'bg-zircon-ink', vto: 'bg-tone-submitted-fg', replaced: 'bg-ink-3' } as const

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

const moreItems = computed<ZDropdownItem[]>(() => [
  ...(props.editable
    ? [
        { key: 'print', label: t('broker.dt.header.print'), icon: PhPrinter, disabled: !!props.printLoading },
        { key: 'docs', label: t('broker.dt.header.docs'), icon: PhDownloadSimple, disabled: !!props.docsLoading },
      ]
    : []),
  ...(props.split.show
    ? [{ key: 'split', label: t('broker.dt.header.split'), disabled: !!props.split.reason, hint: props.split.reason || undefined, divider: props.editable }]
    : []),
])
const onMore = (key: string) => {
  if (key === 'print') emit('print')
  else if (key === 'docs') emit('docs')
  else if (key === 'split') emit('split')
}

const outline = 'border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11'
</script>

<template>
  <header
    class="sticky top-0 z-[6] mx-[calc(var(--shell-main-px,1rem)*-1)] border-b border-line bg-surface px-(--shell-main-px,1rem) pt-3.5 pb-3"
    data-dt-header
  >
    <ZBreadcrumbs :items="crumbs" />
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="m-0 min-w-0 font-mono text-[20px] leading-[1.25] font-semibold tracking-[-0.01em] text-ink [overflow-wrap:anywhere]" data-dt-number>
          {{ number || t('broker.dt.page.untitled') }}
        </h1>
        <span v-if="tag" class="inline-flex items-center gap-1.5 text-[13px] text-ink-2" :data-dt-tag="tag.kind">
          <span :class="cn('size-[7px] rounded-pill', TAG_DOT[tag.kind])" aria-hidden="true" />{{ t(`broker.dt.header.tag.${tag.kind}`) }}
        </span>
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
          :class="cn(outline, 'xl:hidden')"
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
