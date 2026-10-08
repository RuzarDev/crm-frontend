<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { import40Api, type Import40DeclarationDto, type Import40FileDto } from '@/api/import40'
import { isDocKind } from '@/views/client/docKinds'
import { dayMonthOf, extOf, saveBlob } from '@/views/client/shipment/util'
import { cn } from '@/ui/cn'

// «Документы» карточки поставки (доска Shipment): «От AQNIET» — ДТ (бланк PDF), счёт СВХ, отметка о выпуске;
// «Ваши» — документы заявки и чек. Строка целиком — кнопка скачивания. На телефоне видны первые две,
// остальные — по «Все документы поставки» (без JS-медиазапросов: скрытие только ниже sm).
const props = defineProps<{
  caseId: string
  files: Import40FileDto[]
  /** ДТ, которые можно показать клиенту (без заменённых разделением). */
  declarations: Import40DeclarationDto[]
  svhInvoiceNumber: string
}>()

const { t } = useI18n()
const headingId = `ship-docs-${useId()}`

interface DocRow {
  key: string
  label: string
  /** Номер ДТ — моноширинным. */
  mono?: string
  /** Имя файла (у ваших) — серым после подписи. */
  fileName?: string
  /** Справа: «PDF»/расширение (от AQNIET) или дата (ваши). */
  trail: string
  trailIsDate: boolean
  open: () => Promise<void>
}

const bySection = (s: string) => props.files.filter((f) => f.section === s)

const fileRow = (f: Import40FileDto, label: string, withName: boolean): DocRow => ({
  key: f.id,
  label,
  fileName: withName ? f.originalFileName : undefined,
  trail: withName ? dayMonthOf(f.createdAtUtc) : extOf(f.originalFileName) || t('client.card.docs.open'),
  trailIsDate: withName,
  open: async () => saveBlob(await import40Api.downloadFile(props.caseId, f.id), f.originalFileName),
})

const fromUs = computed<DocRow[]>(() => [
  ...props.declarations.map((d): DocRow => ({
    key: `dt-${d.id}`,
    label: t('client.card.docs.dt'),
    mono: d.declarationNumber || undefined,
    trail: 'PDF',
    trailIsDate: false,
    open: async () => {
      const r = await import40Api.blankPdf(props.caseId, d.id)
      saveBlob(r.blob, r.fileName)
    },
  })),
  ...bySection('svh-invoice').map((f) => fileRow(f,
    props.svhInvoiceNumber ? t('client.card.docs.svhInvoiceNo', { n: props.svhInvoiceNumber }) : t('client.card.docs.svhInvoice'), false)),
  ...bySection('declaration-stamp').map((f) => fileRow(f, t('client.card.docs.stamp'), false)),
])

const kindName = (k: string | null | undefined) =>
  isDocKind(k) ? t(`client.docKind.${k}.name`) : t('client.card.docs.doc')

const yours = computed<DocRow[]>(() => [
  ...bySection('documents').map((f) => fileRow(f, kindName(f.docKind), true)),
  ...bySection('payment-check').map((f) => fileRow(f, t('client.card.docs.check'), true)),
])

const total = computed(() => fromUs.value.length + yours.value.length)

// ---- Телефон: первые две строки, остальные — по кнопке ----
const PHONE_FIRST = 2
const expanded = ref(false)
const hiddenOnPhone = (flatIndex: number) => !expanded.value && flatIndex >= PHONE_FIRST

// ---- Скачивание: одна строка за раз; ошибку показывает общий перехватчик ----
const busy = ref<string | null>(null)
const open = async (row: DocRow) => {
  if (busy.value) return
  busy.value = row.key
  try {
    await row.open()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts).
  } finally {
    busy.value = null
  }
}

const rowClass = 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-field border-0 bg-transparent -mx-1.5 w-[calc(100%+0.75rem)] px-1.5 py-1.5 text-left font-sans text-[14.5px] text-ink outline-hidden transition-colors duration-150 ease-out hover:bg-sunken focus-visible:shadow-focus motion-reduce:transition-none sm:min-h-9 sm:text-sm aria-busy:cursor-progress'
const groupLabel = 'm-0 mb-1 text-[12.5px] text-muted'
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="border-t border-line pt-4 sm:rounded-panel sm:border sm:px-[18px] sm:pb-3 sm:pt-4"
    data-ship-docs
  >
    <h2 :id="headingId" class="m-0 mb-1.5 text-[15px] leading-6 font-semibold text-ink sm:mb-2.5">
      {{ t('client.card.docs.title') }}<span v-if="total" class="sm:hidden"> · {{ total }}</span>
    </h2>

    <p v-if="!total" class="m-0 pb-1 text-sm text-ink-3" data-docs-empty>{{ t('client.card.docs.empty') }}</p>

    <template v-else>
      <template v-if="fromUs.length">
        <p :class="cn(groupLabel, !expanded && 'max-sm:hidden')">{{ t('client.card.docs.fromUs') }}</p>
        <ul role="list" class="m-0 mb-3 flex list-none flex-col p-0 max-sm:mb-0">
          <li v-for="(row, i) in fromUs" :key="row.key" :class="cn(hiddenOnPhone(i) && 'max-sm:hidden')" data-doc-row="us">
            <button type="button" :class="rowClass" :aria-busy="busy === row.key || undefined" @click="open(row)">
              <span class="min-w-0 flex-1">
                <span class="sr-only">{{ t('client.card.docs.download') }}: </span>{{ row.label }}<template v-if="row.mono"> <span class="font-mono text-[13px] text-ink-3 [overflow-wrap:anywhere]">{{ row.mono }}</span></template>
              </span>
              <span class="shrink-0 font-medium text-zircon-ink">{{ row.trail }}</span>
            </button>
          </li>
        </ul>
      </template>

      <template v-if="yours.length">
        <p :class="cn(groupLabel, !expanded && 'max-sm:hidden')">{{ t('client.card.docs.yours') }}</p>
        <ul role="list" class="m-0 flex list-none flex-col p-0">
          <li v-for="(row, i) in yours" :key="row.key" :class="cn(hiddenOnPhone(fromUs.length + i) && 'max-sm:hidden')" data-doc-row="yours">
            <button type="button" :class="rowClass" :aria-busy="busy === row.key || undefined" @click="open(row)">
              <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span class="sr-only">{{ t('client.card.docs.download') }}: </span><span data-doc-label>{{ row.label }}</span><span class="text-ink-3"> · {{ row.fileName }}</span>
              </span>
              <span class="shrink-0 text-[12.5px] tabular-nums text-muted">{{ row.trail }}</span>
            </button>
          </li>
        </ul>
      </template>

      <button
        v-if="!expanded && total > PHONE_FIRST"
        type="button"
        class="flex min-h-11 w-full cursor-pointer items-center rounded-field border-0 bg-transparent p-0 font-sans text-[14.5px] font-medium text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus sm:hidden"
        data-docs-more
        @click="expanded = true"
      >{{ t('client.card.docs.all') }}</button>
    </template>
  </section>
</template>
