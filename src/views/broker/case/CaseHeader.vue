<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhAirplane, PhArrowCounterClockwise, PhBoat, PhBuildings, PhDotsThree, PhFlag, PhShieldCheck, PhTrain, PhTruck, PhXCircle } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import type { Import40CaseDto } from '@/api/import40'
import type { CasePerms } from './casePermissions'
import type { ReasonKind } from './useCaseActions'
import { transportSummary } from './caseFormat'

// Шапка карточки (доски Case/CaseSvh): крошки, груз + номер, клиент · пост · транспорт; справа «Счета и акты» и «⋯».
const props = defineProps<{ kase: Import40CaseDto; perms: CasePerms }>()
const emit = defineEmits<{ ask: [kind: ReasonKind] }>()
const { t } = useI18n()

const crumbs = computed(() => [
  { label: t('broker.case.crumbs'), to: '/import-40' },
  { label: props.kase.number },
])
const TRANSPORT_ICON: Record<number, Component> = { 0: PhTrain, 1: PhTruck, 2: PhAirplane, 3: PhBoat }
const transportIcon = computed(() => TRANSPORT_ICON[props.kase.transportMode] ?? PhTruck)
const transport = computed(() => transportSummary(props.kase, t))
const clientTo = computed(() => (props.perms.canOpenClient && props.kase.clientId ? `/clients/${props.kase.clientId}` : null))

const menu = computed<ZDropdownItem[]>(() => {
  const items: ZDropdownItem[] = []
  if (props.perms.showProblemAction) items.push({ key: 'problem', label: t('import40Case.problemBtn'), icon: PhFlag })
  if (props.perms.canStepBack) items.push({ key: 'stepBack', label: t('import40Case.stepBackBtn'), icon: PhArrowCounterClockwise })
  if (props.perms.canCancel) items.push({ key: 'cancel', label: t('import40Case.cancelBtn'), icon: PhXCircle, danger: true, divider: items.length > 0 })
  return items
})
const onMenu = (key: string) => emit('ask', key as ReasonKind)

const metaItem = 'inline-flex min-w-0 items-center gap-1.5'
</script>

<template>
  <header class="flex flex-col gap-2.5" data-case-header>
    <ZBreadcrumbs :items="crumbs" />
    <div class="flex flex-wrap items-start gap-3.5">
      <div class="min-w-0 flex-1 basis-80">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 class="m-0 min-w-0 text-[23px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink [overflow-wrap:anywhere] sm:text-2xl" data-case-title>
            {{ kase.cargo || t('import40Case.caseTitleFallback') }}
          </h1>
          <span class="rounded-[6px] bg-sunken px-2 py-0.5 font-mono text-[13px] text-ink-3" data-case-number>{{ kase.number }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-3" data-case-meta>
          <span :class="metaItem">
            <PhBuildings :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="sr-only">{{ t('broker.case.header.client') }}:</span>
            <RouterLink
              v-if="clientTo"
              :to="clientTo"
              class="min-w-0 rounded-[4px] font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus"
              data-case-client
            >{{ kase.clientName }}</RouterLink>
            <span v-else class="min-w-0 font-medium text-ink" data-case-client>{{ kase.clientName }}</span>
          </span>
          <span v-if="kase.post" :class="metaItem" data-case-post>
            <PhShieldCheck :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="sr-only">{{ t('broker.case.header.post') }}:</span>{{ kase.post }}
          </span>
          <span :class="metaItem" data-case-transport>
            <component :is="transportIcon" :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="sr-only">{{ t('broker.case.header.transport') }}:</span>{{ transport }}
          </span>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <RouterLink
          v-if="perms.canSeeBilling"
          :to="{ path: '/billing', query: { caseId: kase.id } }"
          class="inline-flex h-9 items-center rounded-field bg-sunken px-3.5 text-sm font-semibold whitespace-nowrap text-ink no-underline outline-hidden hover:bg-line-strong focus-visible:shadow-focus max-sm:h-11"
          data-case-billing
        >{{ t('import40Case.billingBtn') }}</RouterLink>
        <ZDropdown v-if="menu.length" :items="menu" @select="onMenu">
          <button
            type="button"
            :aria-label="t('broker.case.header.more')"
            :title="t('broker.case.header.more')"
            class="inline-flex size-9 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11"
            data-case-more
          >
            <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
          </button>
        </ZDropdown>
      </div>
    </div>
  </header>
</template>
