<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import ZButton from '@/components/z/ZButton.vue'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import AqnietInvoiceList from './AqnietInvoiceList.vue'

// Шаг 6 «Оплата услуг AQNIET» (статус 7, бухгалтер; доска CaseSvh). Счета и акты AQNIET по заявке (список не зависит от
// finance.read — сервер отдаёт только относящиеся к заявке). На текущем шаге: «Выставить счёт AQNIET» (finance.write) →
// /billing?caseId=…, иначе «Ждём оплату — отмечает бухгалтер»; администратору — ещё «Завершить без счёта AQNIET» (окно причины
// из CaseActionModals, опасное действие). Что бухгалтер отметил оплату в «Счетах», карточка узнаёт при возврате на вкладку
// (useCase: перечитывание при visibilitychange). Пройденный шаг — только список.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const router = useRouter()

const perms = computed(() => props.ctx.perms)
const issue = () => { void router.push(`/billing?caseId=${encodeURIComponent(props.ctx.kase.id)}`) }
</script>

<template>
  <CaseStepPanel v-if="mode === 'current'" :step="ctx.step" :meta="t('broker.case.aqniet.meta')">
    <template v-if="perms.canIssueAqnietInvoice || perms.canCompleteWithoutInvoice" #actions>
      <ZButton v-if="perms.canCompleteWithoutInvoice" variant="danger" :disabled="ctx.actions.busy()" class="max-sm:h-11 max-sm:w-full" data-aqniet-complete @click="ctx.actions.ask('completeWithoutInvoice')">
        {{ t('import40Case.completeWithoutInvoice') }}
      </ZButton>
      <ZButton v-if="perms.canIssueAqnietInvoice" variant="primary" class="max-sm:h-11 max-sm:w-full" data-aqniet-issue @click="issue">
        {{ t('import40Case.issueAqnietInvoice') }}
      </ZButton>
    </template>

    <div class="flex flex-col gap-3" data-aqniet-body>
      <h3 class="m-0 text-[13px] font-semibold text-ink">{{ t('broker.case.aqniet.title') }}</h3>
      <AqnietInvoiceList :invoices="ctx.invoices" />
      <p v-if="!perms.canIssueAqnietInvoice" class="m-0 text-[13px] text-muted" data-aqniet-wait>{{ t('broker.case.aqniet.wait') }}</p>
    </div>
  </CaseStepPanel>

  <div v-else data-aqniet-done>
    <AqnietInvoiceList :invoices="ctx.invoices" />
  </div>
</template>
