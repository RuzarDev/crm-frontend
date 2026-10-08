<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple } from '@phosphor-icons/vue'
import ZTag, { type ZTone } from '@/components/z/ZTag.vue'
import { billingApi } from '@/api/billing'
import type { Import40CaseInvoiceDto } from '@/api/import40'
import { saveBlob } from '@/ui/download'
import { formatMoney } from '@/ui/number'
import { message } from '@/ui/message'

// Счета и акты AQNIET по заявке (шаг 6, и текущий, и пройденный): «Счёт/Акт № …/год» или «Черновик», статус, сумма, PDF.
const props = defineProps<{ invoices: Import40CaseInvoiceDto[] }>()
const { t } = useI18n()

// 0 черновик, 1 выставлен, 2 оплачен, 3 аннулирован (как в «Счетах»).
const STATUS: Record<number, { tone: ZTone; key: string }> = {
  0: { tone: 'neutral', key: 'billing.draftNo' },
  1: { tone: 'submitted', key: 'billing.issuedStatus' },
  2: { tone: 'done', key: 'billing.paidStatus' },
  3: { tone: 'danger', key: 'billing.cancelled' },
}
const statusOf = (inv: Import40CaseInvoiceDto) => STATUS[inv.status] ?? STATUS[0]
const kindLabel = (inv: Import40CaseInvoiceDto) => t(inv.kind === 'act' ? 'billing.act' : 'billing.invoice')
const titleOf = (inv: Import40CaseInvoiceDto) => (inv.number ? `${kindLabel(inv)} № ${inv.number}/${inv.year}` : `${kindLabel(inv)} · ${t('billing.draftNo')}`)
const fileName = (inv: Import40CaseInvoiceDto) =>
  `${kindLabel(inv)}-${inv.number ? `${inv.number}-${inv.year}` : t('billing.draftNo').toLowerCase()}.pdf`

// PDF: ошибку с ответом сервера показал перехватчик; без ответа (сеть) — тост здесь, как раньше.
const downloading = ref<string | null>(null)
const downloadPdf = async (inv: Import40CaseInvoiceDto) => {
  if (downloading.value) return
  downloading.value = inv.id
  try {
    saveBlob(await billingApi.pdf(inv.id), fileName(inv))
  } catch (e) {
    if (!(e as { response?: unknown } | null)?.response) message.error(t('billing.actionError'))
  } finally {
    downloading.value = null
  }
}

const pdfBtn = 'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-2.5 text-[13px] font-medium text-ink-2 outline-hidden transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-progress motion-reduce:transition-none max-sm:h-11'
</script>

<template>
  <ul v-if="props.invoices.length" role="list" class="m-0 flex list-none flex-col gap-2 p-0" data-aqniet-list>
    <li
      v-for="inv in props.invoices"
      :key="inv.id"
      class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-row border border-line bg-canvas px-3 py-2.5"
      data-aqniet-invoice
    >
      <span class="min-w-0 flex-1 basis-40 text-sm font-medium text-ink [overflow-wrap:anywhere]" data-aqniet-title>{{ titleOf(inv) }}</span>
      <ZTag :tone="statusOf(inv).tone" size="sm" data-aqniet-status>{{ t(statusOf(inv).key) }}</ZTag>
      <span class="w-28 text-right text-sm font-medium tabular-nums text-ink max-sm:w-auto" data-aqniet-total>{{ formatMoney(Math.round(inv.total)) }}</span>
      <button
        type="button"
        :class="pdfBtn"
        :disabled="downloading !== null"
        :aria-busy="downloading === inv.id || undefined"
        :aria-label="t('broker.case.aqniet.pdfLabel', { title: titleOf(inv) })"
        data-aqniet-pdf
        @click="downloadPdf(inv)"
      >
        <PhDownloadSimple :size="16" aria-hidden="true" />{{ t('broker.case.aqniet.pdf') }}
      </button>
    </li>
  </ul>
  <p v-else class="m-0 text-sm text-ink-3" data-aqniet-empty>{{ t('import40Case.invoicesEmpty') }}</p>
</template>
