<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import { dtFormsApi } from '@/api/dtForms'
import type { Import40GoodsItemInput } from '@/types/api'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import DtGoodsPickTable from './DtGoodsPickTable.vue'
import {
  OBLIGATION_DOC_KINDS, OBLIGATION_DOC_KIND_MAX, declarantText, defaultObligationDeadline, defaultObligationDocKind,
  dtFormFileName, pickRows, todayIso,
} from './dtForms'

// «Обязательство (условный выпуск)» (23.10.2026, голосовое декларанта: «точно такое же, как уведомление 130» — сформировать,
// клиент подписывает, прикладываем). Формируется и до подачи ДТ: обязательство подают вместе с ДТ, отметка условного
// выпуска не нужна. Товары с галочками (только те, по которым документа ещё нет), «Документ, который будет представлен» —
// вариант из списка или свой текст (по умолчанию — по виду условного выпуска), срок — срок условного выпуска или
// (дата подачи / сегодня) + 60 дней. Строку гр. 44 не добавляем: код и запись «ОБЯЗУЮСЬ ПРЕДСТАВИТЬ ДО» в КЕДЕН не сверены.
const props = defineProps<{
  open: boolean
  caseId: string
  dtId: string
  goods: Import40GoodsItemInput[]
  currency: string | null
  declarant: { name: string | null; bin: string | null }
  directorName: string | null
  countryOf?: (code: string) => string | null
  /** Условный выпуск ДТ (если отмечен): вид документа, основание, срок. */
  conditionalRelease: { docKind?: string | null; note?: string | null; deadline?: string | null } | null
  /** Дата подачи ДТ (гр. А / дата регистрации), 'YYYY-MM-DD'. */
  submissionDate: string | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const tr = (key: string, p?: Record<string, unknown>) => t(`broker.dt.forms.obligation.${key}`, p ?? {})

// Должность по умолчанию — в документ по-русски (как «Директор» в шаблоне доверенности).
const DEFAULT_POSITION = 'Директор'

const rows = computed(() => pickRows(props.goods, props.countryOf))
const selected = ref<number[]>([])
const documentKind = ref('')
const deadline = ref<string | null>(null)
const number = ref('')
const position = ref(DEFAULT_POSITION)
const signer = ref('')
const date = ref<string | null>(todayIso())
const busy = ref(false)

const reset = () => {
  const today = todayIso()
  selected.value = rows.value.map((r) => r.index)
  documentKind.value = defaultObligationDocKind(props.conditionalRelease)
  deadline.value = defaultObligationDeadline(props.conditionalRelease?.deadline, props.submissionDate, today)
  number.value = ''
  position.value = DEFAULT_POSITION
  signer.value = props.directorName ?? ''
  date.value = today
}
watch(() => props.open, (open) => { if (open) reset() }, { immediate: true })

const docOptions = OBLIGATION_DOC_KINDS.map((k) => ({ value: k, label: k }))
const docText = computed(() => documentKind.value.trim())
const declarant = computed(() => declarantText(props.declarant.name, props.declarant.bin, t))
const canGenerate = computed(() => !!selected.value.length && !!docText.value && !!deadline.value && !!date.value)
const selectAll = () => { selected.value = rows.value.map((r) => r.index) }
const clearSelection = () => { selected.value = [] }

const close = () => emit('update:open', false)

const generate = async () => {
  if (busy.value || !canGenerate.value) return
  const missing = [...(!position.value.trim() ? ['position'] : []), ...(!signer.value.trim() ? ['name'] : [])]
  if (missing.length && !(await confirm({
    title: t('broker.dt.forms.missingTitle', { list: missing.map((k) => t(`broker.dt.forms.missing.${k}`)).join(', ') }),
    content: t('broker.dt.forms.missingText'),
    okText: t('broker.dt.forms.generate'),
    cancelText: t('common.cancel'),
  }))) return
  const day = date.value as string
  busy.value = true
  try {
    const res = await dtFormsApi.obligation(props.caseId, props.dtId, {
      number: number.value.trim() || null,
      date: day,
      signerPosition: position.value.trim() || null,
      signerName: signer.value.trim() || null,
      deadline: deadline.value as string,
      documentKind: docText.value.slice(0, OBLIGATION_DOC_KIND_MAX),
      items: selected.value.map((i) => ({ sortOrder: i })),
    })
    if ('error' in res) {
      message.error(res.error)
      return
    }
    // Имя файла — по-русски, как сам документ.
    saveBlob(res.blob, dtFormFileName('Обязательство', props.declarant.name, day))
    message.success(tr('done'))
    close()
  } catch {
    // Текст ошибки показал общий перехватчик.
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="tr('title')"
    :width="1080"
    :ok-text="t('broker.dt.forms.generate')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="busy"
    :ok-button-props="{ disabled: !canGenerate }"
    data-dt-obligation-modal
    @update:open="emit('update:open', $event)"
    @ok="generate"
  >
    <div class="flex flex-col gap-3 pb-2">
      <p class="m-0 text-[13px] text-ink-3">{{ tr('lead') }}</p>
      <DtGoodsPickTable
        v-model:selected="selected"
        :rows="rows"
        :currency="currency"
        :extra="{ title: tr('document'), width: 220 }"
        :label="tr('tableLabel')"
      >
        <template #extra="{ row }">
          <span v-if="selected.includes(row.index) && docText" class="line-clamp-2 text-[13px] text-ink-2" data-dt-obligation-row-doc>{{ docText }}</span>
          <span v-else class="text-ink-3">—</span>
        </template>
      </DtGoodsPickTable>
      <div class="flex flex-wrap items-center gap-2">
        <ZButton size="sm" class="max-sm:h-11" data-dt-pick-all @click="selectAll">{{ t('broker.dt.forms.selectAll') }}</ZButton>
        <ZButton size="sm" variant="ghost" class="max-sm:h-11" data-dt-pick-none @click="clearSelection">{{ t('broker.dt.forms.clearSelection') }}</ZButton>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <ZField :label="tr('documentKind')" required :help="tr('documentKindHelp')" class="sm:col-span-2">
          <ZCombobox
            v-model:value="documentKind"
            :options="docOptions"
            :filter-option="false"
            allow-clear
            :placeholder="tr('documentKindPlaceholder')"
            :invalid="!docText"
            :maxlength="OBLIGATION_DOC_KIND_MAX"
            data-dt-obligation-doc
          />
        </ZField>
        <ZField :label="tr('deadline')" required :help="tr('deadlineHelp')">
          <ZDate v-model:value="deadline" data-dt-obligation-deadline />
        </ZField>
        <ZField :label="tr('number')">
          <ZInput v-model:value="number" :maxlength="50" :placeholder="tr('numberPlaceholder')" data-dt-obligation-number />
        </ZField>
        <ZField :label="t('broker.dt.forms.declarant')" :help="t('broker.dt.forms.declarantHelp')">
          <ZInput :value="declarant" readonly data-dt-obligation-declarant />
        </ZField>
        <ZField :label="t('broker.dt.forms.date')" required>
          <ZDate v-model:value="date" data-dt-obligation-date />
        </ZField>
        <ZField :label="t('broker.dt.forms.position')">
          <ZInput v-model:value="position" :maxlength="200" data-dt-obligation-position />
        </ZField>
        <ZField :label="t('broker.dt.forms.signer')">
          <ZInput v-model:value="signer" :maxlength="200" data-dt-obligation-signer />
        </ZField>
      </div>
    </div>
  </ZModal>
</template>
