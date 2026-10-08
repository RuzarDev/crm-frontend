<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { useConfirm } from '@/ui/confirm'
import CaseDocsSlot from '../CaseDocsSlot.vue'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { svhInvoiceLine } from '../caseFormat'
import { hintText } from '../casePermissions'

// Шаг 5 «Оплата СВХ» (статус 6, клиент и КПП; доска CaseSvh). Место «Чек оплаты»: грузит клиент или КПП за клиента
// (can('client') — только администратор, can('kpp') — КПП/декларант/руководитель), тег «подтверждена» / «на проверке».
// «Подтвердить оплату СВХ» (подтверждение → confirm-svh-payment): без чека выключена, кроме администратора — так разрешает
// сервер. Подсказки: «Заявку ведёт …» / «Действие выполняет КПП» / «Клиент ещё не загрузил чек». Пройденный шаг — только чтение.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const current = computed(() => props.mode === 'current')
const hasCheck = computed(() => props.ctx.files.some((f) => f.section === 'payment-check'))
const invoiceLine = computed(() => svhInvoiceLine(kase.value))

const CONFIRM = 'confirm-svh-payment'
const confirming = computed(() => props.ctx.actions.isPending(CONFIRM))
const otherBusy = computed(() => props.ctx.actions.busy() && !confirming.value)
const needCheck = computed(() => !hasCheck.value && !props.ctx.perms.canConfirmSvhWithoutCheck)
const roleHint = computed(() => hintText(props.ctx.perms.actionHint('kpp'), t))
const disabled = computed(() => props.ctx.perms.actionDisabled('kpp') || needCheck.value || otherBusy.value)
const hint = computed(() => roleHint.value || (needCheck.value ? t('import40Case.clientNoCheck') : ''))
const canUpload = computed(() => current.value && (props.ctx.perms.can('client') || props.ctx.perms.can('kpp')))

const tag = computed(() => {
  if (kase.value.paymentConfirmed) return { tone: 'done' as const, text: t('import40Case.paymentConfirmed') }
  return hasCheck.value ? { tone: 'submitted' as const, text: t('import40Case.paymentChecking') } : null
})

const confirmPayment = async () => {
  const ok = await confirm({
    title: t('import40Case.confirmSvhPayment'),
    okText: t('broker.case.svhPayment.confirmOk'),
    cancelText: t('common.cancel'),
  })
  if (ok) await props.ctx.actions.run(CONFIRM)
}
</script>

<template>
  <CaseStepPanel v-if="current" :step="ctx.step" :meta="t('broker.case.svhPayment.meta')">
    <template #actions>
      <ZTooltip :title="disabled ? hint : ''">
        <span class="inline-flex max-sm:w-full" :tabindex="disabled && hint ? 0 : undefined">
          <ZButton variant="primary" :disabled="disabled" :loading="confirming" class="max-sm:w-full" data-svh-confirm @click="confirmPayment">
            {{ t('import40Case.confirmPayment') }}
          </ZButton>
        </span>
      </ZTooltip>
    </template>

    <div class="flex flex-col gap-3.5" data-svh-payment-body>
      <p v-if="invoiceLine" class="m-0 text-sm font-medium text-ink tabular-nums" data-svh-line>
        {{ t('broker.case.svhPayment.invoiceLine', { line: invoiceLine }) }}
      </p>
      <CaseDocsSlot
        :ctx="ctx"
        section="payment-check"
        :label="t('import40Case.paymentCheckTitle')"
        :hint="t('broker.case.svhPayment.byClient')"
        :can-upload="canUpload"
        :empty-text="t('import40Case.paymentEmpty')"
      >
        <template v-if="tag" #label-extra>
          <ZTag :tone="tag.tone" size="sm" data-svh-check-tag>{{ tag.text }}</ZTag>
        </template>
      </CaseDocsSlot>
    </div>
  </CaseStepPanel>

  <div v-else class="flex flex-col gap-3" data-svh-payment-done>
    <p v-if="invoiceLine" class="m-0 text-sm font-medium text-ink tabular-nums" data-svh-line>
      {{ t('broker.case.svhPayment.invoiceLine', { line: invoiceLine }) }}
    </p>
    <CaseDocsSlot :ctx="ctx" section="payment-check" :label="t('import40Case.paymentCheckTitle')" :empty-text="t('broker.case.svhPayment.readEmpty')">
      <template v-if="tag" #label-extra>
        <ZTag :tone="tag.tone" size="sm" data-svh-check-tag>{{ tag.text }}</ZTag>
      </template>
    </CaseDocsSlot>
  </div>
</template>
