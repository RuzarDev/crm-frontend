<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { useConfirm } from '@/ui/confirm'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { hintText } from '../casePermissions'
import { transportSummary } from '../caseFormat'
import DraftContainers from './DraftContainers.vue'

// Шаг 2 «Граница» (статус 1, КПП): сводка транспорта и кнопки «Граница пройдена» (с подтверждением) и «Вернуть клиенту».
// «Взять в работу» — в правой колонке (CaseTeam). Пройденный шаг (mode done) — транспорт и контейнеры в режиме чтения.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const { confirm } = useConfirm()

const summary = computed(() => transportSummary(props.ctx.kase, t))
const cargo = computed(() => props.ctx.kase.cargo)

const passKey = 'border-passed'
const passing = computed(() => props.ctx.actions.isPending(passKey))
const otherBusy = computed(() => props.ctx.actions.busy() && !passing.value)
const passDisabled = computed(() => props.ctx.perms.actionDisabled('kpp') || otherBusy.value)
const passHint = computed(() => hintText(props.ctx.perms.actionHint('kpp'), t))
const canReturn = computed(() => props.ctx.perms.can('kpp') || props.ctx.perms.can('declarant'))
const returnHint = computed(() => (canReturn.value ? '' : hintText({ kind: 'role', role: 'kpp' }, t)))

const pass = async () => {
  const ok = await confirm({
    title: t('broker.case.border.confirm'),
    okText: t('broker.case.border.confirmOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run('border-passed')
}
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="t('broker.case.border.meta')">
    <template #actions>
      <ZTooltip :title="returnHint">
        <span class="inline-flex max-sm:w-full" :tabindex="returnHint ? 0 : undefined">
          <ZButton :disabled="!canReturn || otherBusy" class="max-sm:w-full" data-border-return @click="ctx.actions.ask('return')">
            {{ t('import40Case.returnToClient') }}
          </ZButton>
        </span>
      </ZTooltip>
      <ZTooltip :title="passDisabled ? passHint : ''">
        <span class="inline-flex max-sm:w-full" :tabindex="passDisabled && passHint ? 0 : undefined">
          <ZButton variant="primary" :disabled="passDisabled" :loading="passing" class="max-sm:w-full" data-border-passed @click="pass">
            {{ t('import40Case.borderPassed') }}
          </ZButton>
        </span>
      </ZTooltip>
    </template>

    <div class="flex flex-col gap-3.5" data-border-body>
      <dl class="m-0 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt class="text-muted">{{ t('broker.case.draft.transport') }}</dt>
        <dd class="m-0 text-ink [overflow-wrap:anywhere]" data-border-transport>{{ summary }}</dd>
        <template v-if="cargo">
          <dt class="text-muted">{{ t('broker.case.draft.cargo') }}</dt>
          <dd class="m-0 text-ink [overflow-wrap:anywhere]">{{ cargo }}</dd>
        </template>
      </dl>
      <DraftContainers v-if="ctx.kase.containers.length" :ctx="ctx" />
      <p class="m-0 text-[13px] text-muted">{{ t('broker.case.border.note') }}</p>
    </div>
  </CaseStepPanel>

  <div v-else class="flex flex-col gap-3" data-border-done>
    <dl class="m-0 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-muted">{{ t('broker.case.draft.transport') }}</dt>
      <dd class="m-0 text-ink [overflow-wrap:anywhere]">{{ summary }}</dd>
    </dl>
    <DraftContainers v-if="ctx.kase.containers.length" :ctx="ctx" />
  </div>
</template>
