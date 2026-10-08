<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import type { ClientShipment } from '@/api/clientShipments'
import { TOTAL_STEPS, segments, type SegState } from '@/views/client/shipment'
import { formatMoney } from '@/ui/number'
import { cn } from '@/ui/cn'

// «Ход оформления» (доска Shipment): 6 этапов клиента, состояние — по segments() (те же правила, что у полосы
// в списке). Дат по этапам сервер не хранит — даты в истории; под названием — короткое пояснение этапа.
const props = defineProps<{
  shipment: ClientShipment
  /** Сколько документов приложено к заявке (раздел documents). */
  docsCount: number
  /** Номера выпущенных/поданных ДТ — пояснение к этапу 3. */
  dtNumbers: string[]
}>()

const { t } = useI18n()
const headingId = `ship-path-${useId()}`

// Отменённая поставка: этапы не «пройдены» — все серые, без галочек (как в прежней карточке).
const states = computed<SegState[]>(() =>
  props.shipment.status === 9 ? Array(TOTAL_STEPS).fill('todo') : segments(props.shipment))

const isCurrent = (s: SegState) => s === 'current' || s === 'currentAsk' || s === 'currentProblem'

// Статические строки — сканер Tailwind должен видеть каждый класс целиком.
const DOT: Record<SegState, string> = {
  done: 'bg-zircon text-white',
  current: 'bg-zircon-ink text-white',
  currentAsk: 'bg-gold text-navy',
  currentProblem: 'bg-danger text-white',
  todo: 'border-[1.5px] border-line-strong bg-surface text-muted',
}
const LINE: Record<SegState, string> = {
  done: 'bg-zircon',
  current: 'bg-line',
  currentAsk: 'bg-line',
  currentProblem: 'bg-line',
  todo: 'bg-transparent',
}

/** Чей ход на текущем этапе: у вопроса к клиенту и у проблемы — клиента. */
const nowLabel = (s: SegState) => (s === 'current' ? t('client.card.nowUs') : t('client.card.nowYou'))

const note = (n: number): string => {
  if (n === 1) return t('client.card.stepDocs', { n: props.docsCount })
  if (n === 3 && props.dtNumbers.length) return props.dtNumbers.join(', ')
  if (n === 4 && props.shipment.svhInvoiceAmount != null) return t('client.card.stepSvh', { sum: formatMoney(props.shipment.svhInvoiceAmount) })
  return ''
}
</script>

<template>
  <section :aria-labelledby="headingId" data-ship-timeline>
    <h2 :id="headingId" class="m-0 mb-3 text-[15px] leading-6 font-semibold text-ink sm:mb-3.5">{{ t('client.card.path') }}</h2>
    <ol class="m-0 flex list-none flex-col p-0">
      <li
        v-for="(s, i) in states"
        :key="i"
        :data-state="s"
        :aria-current="isCurrent(s) ? 'step' : undefined"
        class="grid grid-cols-[26px_minmax(0,1fr)] gap-3 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-3.5"
      >
        <span aria-hidden="true" class="flex flex-col items-center">
          <span
            :class="cn(
              'box-border flex size-6 shrink-0 items-center justify-center rounded-pill text-[11.5px] leading-none font-bold tabular-nums sm:size-[26px] sm:text-xs',
              DOT[s],
            )"
          >
            <PhCheck v-if="s === 'done'" :size="13" weight="bold" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span v-if="i < states.length - 1" :class="cn('min-h-3.5 w-0.5 flex-1 sm:min-h-[18px]', LINE[s])" />
        </span>
        <span :class="cn('min-w-0 pt-px sm:pt-0.5', i < states.length - 1 ? 'pb-3.5 sm:pb-[18px]' : 'pb-0')">
          <span class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span
              :class="cn(
                'text-[14.5px] leading-[22px] sm:text-[15px]',
                isCurrent(s) ? 'font-semibold text-ink' : 'font-medium',
                s === 'done' && 'text-ink',
                s === 'todo' && 'text-ink-3',
              )"
              data-step-title
            >{{ t(`enum.stepClient.s${i + 1}`) }}</span>
            <span v-if="isCurrent(s)" class="text-[13px] text-muted" data-step-now>{{ nowLabel(s) }}</span>
            <span v-else-if="s === 'done'" class="sr-only">{{ t('client.card.stepDone') }}</span>
          </span>
          <span v-if="note(i + 1)" class="mt-0.5 block text-[13px] leading-5 text-ink-3 [overflow-wrap:anywhere] sm:mt-[3px] sm:text-[13.5px]" data-step-note>{{ note(i + 1) }}</span>
        </span>
      </li>
    </ol>
  </section>
</template>
