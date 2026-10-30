<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { billingApi } from '@/api/billing'
import type { Import40CaseInvoiceDto } from '@/api/import40'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import AqnietInvoiceList from './AqnietInvoiceList.vue'

// Шаг 6 «Оплата услуг AQNIET» (статус 7, бухгалтер; доска CaseSvh). Счета и акты AQNIET по заявке (список не зависит от
// finance.read — сервер отдаёт только относящиеся к заявке). На текущем шаге: «Выставить счёт AQNIET» (finance.write) →
// /billing?caseId=…; администратору — ещё «Завершить без счёта AQNIET» (окно причины из CaseActionModals; редкий запасной
// выход — тихая кнопка danger-ghost слева от главной). Что бухгалтер отметил оплату в «Счетах», карточка узнаёт при возврате
// на вкладку (useCase: перечитывание при visibilitychange). Пройденный шаг — только список.
// S-25 (30.10.2026): счёт уже выставлен (или есть черновик) — вместо «Выставить» (второй счёт) «Открыть счёт» (/billing?case=,
// только фильтр); текст — по факту: нет счёта — «ещё не выставлен», выставлен — «ждём оплату».
// S-27: руководитель снимает ошибочную отметку оплаты у счёта (окно причины) — и на текущем, и на пройденном шаге.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const router = useRouter()

const perms = computed(() => props.ctx.perms)
const caseId = computed(() => encodeURIComponent(props.ctx.kase.id))
const aqnietInvoices = computed(() => props.ctx.invoices.filter((i) => i.kind === 'invoice'))
/** issued — выставлен или оплачен (не аннулирован); draft — только черновик; none — счёта нет. */
const invoiceState = computed<'issued' | 'draft' | 'none'>(() => {
  if (aqnietInvoices.value.some((i) => i.status === 1 || i.status === 2)) return 'issued'
  return aqnietInvoices.value.some((i) => i.status === 0) ? 'draft' : 'none'
})
const canIssue = computed(() => perms.value.canIssueAqnietInvoice && invoiceState.value === 'none')
const canOpen = computed(() => perms.value.canSeeBilling && invoiceState.value !== 'none')
const issue = () => { void router.push(`/billing?caseId=${caseId.value}`) }
const openInvoice = () => { void router.push(`/billing?case=${caseId.value}`) }
const waitText = computed(() => {
  if (invoiceState.value === 'issued') return t('broker.case.aqniet.issued')
  if (invoiceState.value === 'draft') return t('broker.case.aqniet.draftExists')
  return perms.value.canIssueAqnietInvoice ? '' : t('broker.case.aqniet.waitInvoice')
})

// ---- Снять отметку оплаты (S-27) ----
const unmarking = ref<Import40CaseInvoiceDto | null>(null)
const unmarkOpen = ref(false)
const reason = ref('')
const askUnmark = (inv: Import40CaseInvoiceDto) => {
  unmarking.value = inv
  reason.value = ''
  unmarkOpen.value = true
}
const unmarkPending = computed(() => props.ctx.actions.isPending('unmark-paid'))
const submitUnmark = async () => {
  const inv = unmarking.value
  const text = reason.value.trim()
  if (!inv || !text || props.ctx.actions.busy()) return
  const ok = await props.ctx.actions.mutate('unmark-paid', () => billingApi.unmarkPaid(inv.id, text), { done: 'broker.case.aqniet.unmarkDone' })
  if (ok) unmarkOpen.value = false
}
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="t('broker.case.aqniet.meta')">
    <template v-if="canIssue || canOpen || perms.canCompleteWithoutInvoice" #actions>
      <ZButton v-if="perms.canCompleteWithoutInvoice" variant="danger-ghost" :disabled="ctx.actions.busy()" class="max-sm:w-full" data-aqniet-complete @click="ctx.actions.ask('completeWithoutInvoice')">
        {{ t('import40Case.completeWithoutInvoice') }}
      </ZButton>
      <ZButton v-if="canIssue" variant="primary" class="max-sm:w-full" data-aqniet-issue @click="issue">
        {{ t('import40Case.issueAqnietInvoice') }}
      </ZButton>
      <ZButton v-else-if="canOpen" class="max-sm:w-full" data-aqniet-open @click="openInvoice">
        {{ invoiceState === 'draft' ? t('broker.case.aqniet.openDraft') : t('broker.case.aqniet.openInvoice') }}
      </ZButton>
    </template>

    <div class="flex flex-col gap-3" data-aqniet-body>
      <h3 class="m-0 text-[13px] font-semibold text-ink">{{ t('broker.case.aqniet.title') }}</h3>
      <AqnietInvoiceList :invoices="ctx.invoices" :can-unmark="perms.canUnmarkPaid" @unmark="askUnmark" />
      <p v-if="waitText" class="m-0 text-[13px] text-muted" data-aqniet-wait>{{ waitText }}</p>
    </div>
  </CaseStepPanel>

  <div v-else data-aqniet-done>
    <AqnietInvoiceList :invoices="ctx.invoices" :can-unmark="perms.canUnmarkPaid" @unmark="askUnmark" />
  </div>

  <ZModal
    :open="unmarkOpen"
    :title="t('broker.case.aqniet.unmarkTitle')"
    :ok-text="t('broker.case.aqniet.unmarkOk')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="unmarkPending"
    :ok-button-props="{ disabled: !reason.trim(), danger: true }"
    :cancel-button-props="{ disabled: unmarkPending }"
    data-aqniet-unmark-modal
    @update:open="(v: boolean) => { if (!v && !unmarkPending) unmarkOpen = false }"
    @ok="submitUnmark"
  >
    <p class="m-0 mb-3 text-sm text-ink-3">{{ t('broker.case.aqniet.unmarkHint') }}</p>
    <ZField>
      <ZTextarea v-model:value="reason" :rows="3" :maxlength="500" :placeholder="t('broker.case.aqniet.unmarkPh')" :aria-label="t('broker.case.aqniet.unmarkTitle')" data-aqniet-unmark-reason />
    </ZField>
  </ZModal>
</template>
