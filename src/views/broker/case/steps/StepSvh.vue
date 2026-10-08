<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { useConfirm } from '@/ui/confirm'
import CaseDocsSlot from '../CaseDocsSlot.vue'
import CaseStepPanel from '../CaseStepPanel.vue'
import type { CaseStepProps } from '../caseContext'
import { svhInvoiceLine } from '../caseFormat'
import { hintText } from '../casePermissions'
import SvhInvoiceModal from './SvhInvoiceModal.vue'

// Шаг 4 «СВХ и счёт» (статусы 4 и 5, КПП; доска CaseSvh). Два места для файлов: «Закрытая ДТ (штамп)» и «Счёт СВХ»
// (грузит КПП, удалять нельзя). Статус 4 — «Закрыть ДТ на СВХ» (подтверждение → close-svh); статус 5 — «Выставить счёт СВХ»
// (окно SvhInvoiceModal → issue-invoice). Сводка выставленного счёта — «312 400 ₸ · № 1187 · 03.10».
// Пройденный шаг (mode done) — те же файлы и сводка, только чтение.
const props = defineProps<CaseStepProps>()
const { t } = useI18n()
const { confirm } = useConfirm()

const kase = computed(() => props.ctx.kase)
const current = computed(() => props.mode === 'current')
const closing = computed(() => kase.value.status === 4)
const invoiceLine = computed(() => svhInvoiceLine(kase.value))

const CLOSE = 'close-svh'
const closePending = computed(() => props.ctx.actions.isPending(CLOSE))
const otherBusy = computed(() => props.ctx.actions.busy() && !closePending.value)
const kppDisabled = computed(() => props.ctx.perms.actionDisabled('kpp') || otherBusy.value)
const kppHint = computed(() => hintText(props.ctx.perms.actionHint('kpp'), t))
const canUpload = computed(() => current.value && props.ctx.perms.can('kpp'))

const close = async () => {
  const ok = await confirm({
    title: t('import40Case.confirmCloseSvh'),
    okText: t('broker.case.svh.confirmCloseOk'),
    cancelText: t('broker.case.declaring.cancel'),
  })
  if (ok) await props.ctx.actions.run(CLOSE)
}

const invoiceOpen = ref(false)
</script>

<template>
  <CaseStepPanel v-if="current" :step="ctx.step" :meta="t(closing ? 'broker.case.svh.metaReleased' : 'broker.case.svh.metaClosed')">
    <template #actions>
      <ZTooltip :title="kppDisabled ? kppHint : ''">
        <span class="inline-flex max-sm:w-full" :tabindex="kppDisabled && kppHint ? 0 : undefined">
          <ZButton
            v-if="closing"
            variant="primary"
            :disabled="kppDisabled"
            :loading="closePending"
            class="max-sm:h-11 max-sm:w-full"
            data-svh-close
            @click="close"
          >{{ t('import40Case.closeSvh') }}</ZButton>
          <ZButton v-else variant="primary" :disabled="kppDisabled" class="max-sm:h-11 max-sm:w-full" data-svh-issue @click="invoiceOpen = true">
            {{ t('import40Case.issueInvoice') }}
          </ZButton>
        </span>
      </ZTooltip>
    </template>

    <div class="flex flex-col gap-4" data-svh-body>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <CaseDocsSlot
          :ctx="ctx"
          section="declaration-stamp"
          :label="t('import40Case.stampTitle')"
          :hint="t('broker.case.svh.byKpp')"
          :can-upload="canUpload"
          :empty-text="t('import40Case.stampEmpty')"
          :drop-text="t('broker.case.svh.dropStamp')"
        />
        <CaseDocsSlot
          :ctx="ctx"
          section="svh-invoice"
          :label="t('import40Case.svhInvoiceTitle')"
          :hint="closing ? t('broker.case.svh.afterClose') : t('broker.case.svh.byKpp')"
          :can-upload="canUpload"
          :empty-text="t('import40Case.svhInvoiceEmpty')"
          :drop-text="t('broker.case.svh.dropInvoice')"
        />
      </div>
      <p v-if="invoiceLine" class="m-0 text-sm font-medium text-ink tabular-nums" data-svh-line>
        {{ t('broker.case.svh.issued', { line: invoiceLine }) }}<template v-if="kase.svhInvoiceNote"> · <span class="font-normal text-ink-3">{{ kase.svhInvoiceNote }}</span></template>
      </p>
      <p v-else class="m-0 rounded-row bg-canvas px-3.5 py-3 text-[13px] text-ink-3" data-svh-note>{{ t('broker.case.svh.nextNote') }}</p>
    </div>

    <SvhInvoiceModal v-model:open="invoiceOpen" :ctx="ctx" />
  </CaseStepPanel>

  <div v-else class="flex flex-col gap-4" data-svh-done>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      <CaseDocsSlot :ctx="ctx" section="declaration-stamp" :label="t('import40Case.stampTitle')" :empty-text="t('broker.case.svh.readEmptyStamp')" />
      <CaseDocsSlot :ctx="ctx" section="svh-invoice" :label="t('import40Case.svhInvoiceTitle')" :empty-text="t('broker.case.svh.readEmptyInvoice')" />
    </div>
    <p v-if="invoiceLine" class="m-0 text-sm font-medium text-ink tabular-nums" data-svh-line>
      {{ t('broker.case.svh.issued', { line: invoiceLine }) }}<template v-if="kase.svhInvoiceNote"> · <span class="font-normal text-ink-3">{{ kase.svhInvoiceNote }}</span></template>
    </p>
  </div>
</template>
