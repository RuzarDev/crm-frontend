<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhClock, PhShippingContainer, PhUser } from '@phosphor-icons/vue'
import ZBreadcrumbs from '@/components/z/ZBreadcrumbs.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import type { DocumentPackageDto } from '@/types/api'
import { pluralForm } from '@/views/broker/list'
import { formatStamp, statusLabelKey, statusTone } from '../packages'
import { packageCounts } from './workspace'

// Шапка «Разбора поезда» (доска Workspace): крошки «Пакеты документов / Поезд n», заголовок и тег статуса
// (тона и подписи — из списка пакетов), строка «экспедитор · загружен · контейнеры · партии»; справа
// «Обновить» (всем: тихое перечитывание), «Решение по пакету» (packages.manage + reestr.write) и «Сформировать строки
// реестра» (reestr.write).
// Ниже — плашка решения: при замечании проверки или статусе «Нужна правка», со ссылкой «Изменить решение».
const props = defineProps<{
  pkg: DocumentPackageDto
  canDecide: boolean
  canGenerate: boolean
  generating: boolean
  refreshing?: boolean
}>()
const emit = defineEmits<{ decide: []; generate: []; refresh: [] }>()
const { t, locale } = useI18n()

const counts = computed(() => packageCounts(props.pkg))
const pf = (n: number) => pluralForm(n, locale.value)
const title = computed(() => t('broker.packageWorkspace.title', { n: props.pkg.trainNumber }))
const crumbs = computed(() => [
  { label: t('broker.packages.title'), to: '/document-packages' },
  { label: title.value },
])

const showBanner = computed(() => !!props.pkg.reviewComment?.trim() || props.pkg.status === 'needsFix')
const bannerGold = computed(() => props.pkg.status === 'needsFix')
const reviewedAt = computed(() => (props.pkg.reviewedAtUtc ? formatStamp(props.pkg.reviewedAtUtc) : ''))

const metaItem = 'inline-flex min-w-0 items-center gap-1.5'
// Выключенная кнопка фокус не берёт — его берёт обёртка (для подсказки); имя обёртки — кнопка и причина.
const generateDisabledLabel = computed(() => `${t('broker.packageWorkspace.generate')}. ${t('broker.packageWorkspace.generateNeedsPartias')}`)
</script>

<template>
  <header class="flex flex-col gap-2.5" data-ws-header>
    <ZBreadcrumbs :items="crumbs" />
    <div class="flex flex-wrap items-start gap-3.5">
      <div class="min-w-0 flex-1 basis-80">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 class="m-0 min-w-0 text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]" data-ws-title>{{ title }}</h1>
          <ZTag :tone="statusTone(pkg.status)" data-ws-status>{{ t(statusLabelKey(pkg.status)) }}</ZTag>
        </div>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-3" data-ws-meta>
          <span :class="metaItem">
            <PhUser :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="[overflow-wrap:anywhere]">{{ t('broker.packageWorkspace.meta.expeditor', { name: pkg.createdByExpeditorUsername }) }}</span>
          </span>
          <span :class="metaItem">
            <PhClock :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            {{ t('broker.packageWorkspace.meta.uploaded', { date: formatStamp(pkg.createdAtUtc) }) }}
          </span>
          <span :class="metaItem" data-ws-counts>
            <PhShippingContainer :size="15" class="shrink-0 text-muted" aria-hidden="true" />
            {{ t(`broker.packageWorkspace.meta.containers.${pf(counts.containers)}`, { n: counts.containers }) }}
            · {{ t(`broker.packageWorkspace.meta.partias.${pf(counts.partias)}`, { n: counts.partias }) }}
          </span>
        </div>
        <p v-if="pkg.comment" class="m-0 mt-1.5 text-sm text-ink-2 [overflow-wrap:anywhere]" data-ws-comment>{{ pkg.comment }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
        <ZButton variant="ghost" :loading="refreshing" class="max-sm:h-11" data-ws-refresh @click="emit('refresh')">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          v-if="canDecide"
          class="border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11"
          data-ws-decide
          @click="emit('decide')"
        >{{ t('broker.packageWorkspace.decide') }}</ZButton>
        <template v-if="canGenerate">
          <ZTooltip v-if="!counts.partias" :title="t('broker.packageWorkspace.generateNeedsPartias')">
            <span
              class="inline-flex rounded-field outline-hidden focus-visible:shadow-focus max-sm:w-full"
              tabindex="0"
              role="button"
              aria-disabled="true"
              :aria-label="generateDisabledLabel"
              data-ws-generate-wrap
            >
              <ZButton variant="primary" disabled aria-hidden="true" class="max-sm:h-11 max-sm:w-full" data-ws-generate>{{ t('broker.packageWorkspace.generate') }}</ZButton>
            </span>
          </ZTooltip>
          <ZButton
            v-else
            variant="primary"
            :loading="generating"
            class="max-sm:h-11"
            data-ws-generate
            @click="emit('generate')"
          >{{ t('broker.packageWorkspace.generate') }}</ZButton>
        </template>
      </div>
    </div>

    <div
      v-if="showBanner"
      class="mt-1.5 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-row px-4 py-3 text-sm"
      :class="bannerGold ? 'bg-gold-soft shadow-[inset_0_0_0_1px_var(--color-gold-line)]' : 'bg-sunken'"
      role="status"
      data-ws-banner
    >
      <span class="mt-1.5 size-2 shrink-0 rounded-pill" :class="bannerGold ? 'bg-gold' : 'bg-faint'" aria-hidden="true" />
      <p class="m-0 min-w-0 flex-1 basis-60 text-ink-2 [overflow-wrap:anywhere]">
        <b class="font-semibold" :class="bannerGold ? 'text-gold-ink' : 'text-ink'">{{ t(`broker.packageWorkspace.banner.${pkg.status}`) }}</b>
        <template v-if="reviewedAt"> · <span class="tabular-nums">{{ reviewedAt }}</span></template>
        <template v-if="pkg.reviewComment?.trim()"> · «{{ pkg.reviewComment.trim() }}»</template>
      </p>
      <button
        v-if="canDecide"
        type="button"
        class="cursor-pointer rounded-field border-0 bg-transparent p-0 text-sm font-semibold text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
        data-ws-banner-change
        @click="emit('decide')"
      >{{ t('broker.packageWorkspace.banner.change') }}</button>
    </div>
  </header>
</template>
