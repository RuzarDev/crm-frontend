<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhWarningCircle } from '@phosphor-icons/vue'
import type { Import40CaseDto } from '@/api/import40'
import { cn } from '@/ui/cn'
import { briefOf, condRelDate, condRelDoc, condRelState } from '@/utils/conditionalRelease'
import { dtPath } from './declarations'
import { dtLabel } from './caseSteps'

// Плашка карточки заявки (17.10): открытые условные выпуски по ДТ — срок, что нужно, ссылка на ДТ (там блок с действиями).
// ДТ, заменённые разделением, не в счёт (их место заняли части).
const props = defineProps<{ kase: Import40CaseDto }>()
const { t } = useI18n()

const items = computed(() => (props.kase.declarations ?? [])
  .filter((d) => !d.isSplitReplaced)
  .map((d) => briefOf(d))
  .filter((b): b is NonNullable<typeof b> => !!b)
  .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? '')))

const text = (b: (typeof items.value)[number]) => {
  const named = { dt: dtLabel(props.kase, b.declarationId, t), date: condRelDate(b.deadline), doc: condRelDoc(b.docKind, b.note, t) }
  const state = condRelState(b)
  return t(state === 'uploaded' ? 'condRel.caseBannerUploaded' : state === 'overdue' ? 'condRel.caseBannerOverdue' : 'condRel.caseBanner', named)
}
</script>

<template>
  <div
    v-for="b in items"
    :key="b.declarationId"
    role="status"
    :class="cn(
      'flex flex-wrap items-start gap-x-3.5 gap-y-2 rounded-panel border px-[18px] py-3.5 text-sm',
      condRelState(b) === 'uploaded' ? 'border-gold-line bg-gold-soft' : 'border-tone-danger-fg/20 bg-tone-danger-bg',
    )"
    data-case-banner="condrel"
    :data-condrel-state="condRelState(b)"
  >
    <PhWarningCircle :size="18" weight="fill" :class="cn('mt-0.5 shrink-0', condRelState(b) === 'uploaded' ? 'text-gold-ink' : 'text-tone-danger-fg')" aria-hidden="true" />
    <div class="min-w-0 flex-1 basis-60">
      <div :class="cn('font-semibold [overflow-wrap:anywhere]', condRelState(b) === 'uploaded' ? 'text-gold-ink' : 'text-tone-danger-fg')">{{ text(b) }}</div>
    </div>
    <RouterLink
      :to="dtPath(kase.id, b.declarationId)"
      class="inline-flex min-h-8 items-center rounded-field text-sm font-semibold text-zircon-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
      data-condrel-open-dt
    >{{ t('condRel.openDt') }}</RouterLink>
  </div>
</template>
