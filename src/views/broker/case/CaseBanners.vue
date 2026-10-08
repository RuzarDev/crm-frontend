<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhArrowUUpLeft, PhFlag, PhXCircle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import type { Import40CaseDto } from '@/api/import40'
import type { CasePerms } from './casePermissions'
import type { CaseActions } from './useCaseActions'

// Плашки над шагами: отменена (причина), проблема (внутренняя заметка, что ушло клиенту, «Снять проблему»),
// возвращена клиенту (причина, только в статусе 0).
defineProps<{ kase: Import40CaseDto; perms: CasePerms; actions: CaseActions }>()
const { t } = useI18n()
</script>

<template>
  <div
    v-if="kase.status === 9"
    role="status"
    class="flex items-start gap-3.5 rounded-panel border border-line bg-canvas px-[18px] py-3.5 text-sm"
    data-case-banner="cancelled"
  >
    <PhXCircle :size="18" class="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="font-semibold text-ink">{{ t('import40Case.cancelledTitle') }}</div>
      <div v-if="kase.cancelReason" class="mt-0.5 text-ink-2 [overflow-wrap:anywhere]">{{ kase.cancelReason }}</div>
    </div>
  </div>

  <div
    v-if="kase.isProblem"
    role="status"
    class="flex flex-wrap items-start gap-x-3.5 gap-y-2.5 rounded-panel border border-tone-danger-fg/20 bg-tone-danger-bg px-[18px] py-3.5 text-sm"
    data-case-banner="problem"
  >
    <PhFlag :size="18" class="mt-0.5 shrink-0 text-tone-danger-fg" aria-hidden="true" />
    <div class="min-w-0 flex-1 basis-60">
      <div class="font-semibold text-tone-danger-fg">{{ t('import40Case.problemTitle') }}</div>
      <div v-if="kase.problemNote" class="mt-0.5 text-ink-2 [overflow-wrap:anywhere]" data-problem-note>{{ kase.problemNote }}</div>
      <div v-if="kase.problemClientMessage" class="mt-1.5 text-ink-3 [overflow-wrap:anywhere]" data-problem-client>
        {{ t('broker.case.banner.problemClientSent', { text: kase.problemClientMessage }) }}
      </div>
    </div>
    <ZButton
      v-if="perms.canProblem"
      size="sm"
      class="bg-surface shadow-[inset_0_0_0_1px_var(--color-line-strong)] enabled:hover:bg-canvas max-sm:h-11 max-sm:w-full"
      :loading="actions.isPending('clear-problem')"
      :disabled="actions.busy() && !actions.isPending('clear-problem')"
      data-clear-problem
      @click="actions.run('clear-problem')"
    >{{ t('import40Case.clearProblem') }}</ZButton>
  </div>

  <div
    v-if="kase.returnReason && kase.status === 0"
    role="status"
    class="flex items-start gap-3.5 rounded-panel border border-gold-line bg-gold-soft px-[18px] py-3.5 text-sm"
    data-case-banner="returned"
  >
    <PhArrowUUpLeft :size="18" class="mt-0.5 shrink-0 text-gold-ink" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="font-semibold text-gold-ink">{{ t('import40Case.returnedTitle') }}</div>
      <div class="mt-0.5 text-ink-2 [overflow-wrap:anywhere]">{{ kase.returnReason }}</div>
    </div>
  </div>
</template>
