<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StageBoard, { type BoardCard } from '@/components/stages/StageBoard.vue'
import type { ClientShipment } from '@/api/clientShipments'
import type { Import40CaseDto, Import40CaseInvoiceDto } from '@/api/import40'
import type { CaseStages } from '@/api/stages'
import type { CustomsRequestDto } from '@/api/customsRequests'
import type { PreBorder } from '@/api/preBorder'
import { preBorderSubstages, showPreBorder } from '@/utils/preBorder'
import { askFor, segments, TOTAL_STEPS, type SegState } from '@/views/client/shipment'
import { buildStageCards, declaringSubstages, defaultSelectedStep } from '@/utils/import40StageModel'

// «Ход оформления» клиента по макету (17.10): под шагом — итог («Документы приняты · 14.10 в 11:05», «Граница пройдена»,
// «ДТ подана · жёлтый коридор»), на шаге 3 — ваш декларант, золотая метка «Нужен ваш ответ» (ваш ход, в т.ч. запрос
// таможни; вопрос AQNIET по заявке — красная, как его панель), шаги 5 и 6 — «в любом порядке»;
// нажатие на шаг — его история (шаг 3 — с подэтапами). Без времени, норм и ФИО сотрудников. На телефоне — вертикально.
// data-state на li — сегменты полосы (segments): те же правила, что у полосы в списке поставок.
const props = withDefaults(defineProps<{
  shipment: ClientShipment
  caseDto: Import40CaseDto
  /** Сколько документов приложено к заявке (раздел documents); null — файлы не загрузились. */
  docsCount: number | null
  /** Файлы не загрузились: загружен ли чек — неизвестно, поэтому оплату склада «ваш ход» не показываем. */
  filesUnknown?: boolean
  stages?: CaseStages | null
  invoices?: Import40CaseInvoiceDto[]
  /** Запросы таможни поставки: открытый — «Нужен ваш ответ» и «ждём ваш документ» в подэтапах шага 3. */
  customs?: CustomsRequestDto[]
  /** Поставка до границы: подшаги под шагом 2 и ожидаемая дата на границе. */
  preBorder?: PreBorder | null
}>(), { filesUnknown: false, stages: null, invoices: () => [], customs: () => [], preBorder: null })

const { t, te, locale } = useI18n()

const states = computed<SegState[]>(() => segments(props.shipment, { filesUnknown: props.filesUnknown }))
const input = computed(() => ({
  audience: 'client' as const,
  kase: props.caseDto,
  stages: props.stages,
  invoices: props.invoices,
  docsCount: props.docsCount,
  clientAsk: askFor(props.shipment, { filesUnknown: props.filesUnknown }),
  customs: props.customs,
  checkUploaded: props.shipment.paymentCheckUploaded && !props.filesUnknown,
  locale: locale.value,
  borderEta: props.preBorder?.expectedBorderDate ?? null,
}))

const cards = computed<BoardCard[]>(() =>
  buildStageCards(input.value, t, te).map((m, i) => ({ ...m, title: t(`enum.stepClient.s${m.n}`), dataState: states.value[i] ?? 'todo' })))
const substeps = computed(() => declaringSubstages(input.value, t, te))
const borderSubsteps = computed(() => (showPreBorder(props.preBorder) ? preBorderSubstages(props.preBorder, t) : []))

const selected = ref<number | null>(defaultSelectedStep(props.caseDto.status))
watch(() => [props.caseDto.id, props.caseDto.status] as const, ([id, status], [prevId]) => {
  if (id !== prevId || selected.value == null) selected.value = defaultSelectedStep(status)
})

const aside = computed(() => {
  const n = props.shipment.step
  return n >= 1 && props.shipment.status < 8 ? `${t('stages.stepOf', { n, total: TOTAL_STEPS })} · ${t('stages.hint')}` : t('stages.hint')
})
</script>

<template>
  <div data-ship-timeline>
    <StageBoard
      v-model:selected="selected"
      :cards="cards"
      audience="client"
      :heading="t('stages.titleClient')"
      :aside="aside"
      :substeps="substeps"
      :border-substeps="borderSubsteps"
    />
  </div>
</template>
