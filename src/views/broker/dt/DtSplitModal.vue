<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { import40Api, type Import40SplitResult, type Import40SplitSuggestionRow } from '@/api/import40'
import { message } from '@/ui/message'
import type { ZColumn, ZKey } from '@/ui/table'

// «Разделить на ЕТТ/ВТО» (поведение как в прежнем окне): при открытии — подсказка сервера по СОХРАНЁННОЙ ДТ
// (страница сохраняет перед открытием); в таблице только кандидаты ВТО, по умолчанию отмечены; кандидатов нет —
// сообщение и окно не показывается. Отмечены все товары ДТ — одна ДТ ВТО без ЕТТ-части. Перед разделением —
// ещё одно сохранение (правки, сделанные после открытия), затем POST split; результат — родителю (переход в ВТО).
const props = defineProps<{
  open: boolean
  caseId: string
  dtId: string
  goodsCount: number
  /** Сохранить ДТ перед разделением (тихо). */
  save: () => Promise<boolean>
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; done: [res: Import40SplitResult] }>()
const { t } = useI18n()

const loading = ref(false)
const splitting = ref(false)
const rows = ref<Import40SplitSuggestionRow[]>([])
const selected = ref<ZKey[]>([])

const close = () => emit('update:open', false)

watch(() => props.open, async (open) => {
  if (!open) return
  loading.value = true
  rows.value = []
  selected.value = []
  try {
    const all = await import40Api.splitSuggestion(props.caseId, props.dtId)
    const candidates = all.filter((r) => r.isVtoCandidate)
    if (!candidates.length) {
      close()
      message.info(t('broker.dt.split.noCandidates'))
      return
    }
    rows.value = candidates
    selected.value = candidates.map((r) => r.sortOrder)
  } catch {
    close() // текст ошибки показал общий перехватчик
  } finally {
    loading.value = false
  }
}, { immediate: true })

/** Отмечены все товары ДТ (в т.ч. единственный) — ЕТТ-части не будет. */
const vtoOnly = computed(() => rows.value.length > 0 && selected.value.length === props.goodsCount)

const columns = computed<ZColumn<Import40SplitSuggestionRow>[]>(() => [
  { title: t('broker.dt.split.tnved'), dataIndex: 'tnvedCode', key: 'tnvedCode', width: 140 },
  { title: t('broker.dt.split.vtoStatus'), dataIndex: 'vtoStatus', key: 'vtoStatus' },
  { title: t('broker.dt.split.ettDuty'), dataIndex: 'ettRate', key: 'ettRate', width: 110 },
  { title: t('broker.dt.split.vtoDuty'), dataIndex: 'vtoRate', key: 'vtoRate', width: 110 },
])
const rowSelection = computed(() => ({
  selectedRowKeys: selected.value,
  onChange: (keys: ZKey[]) => { selected.value = keys },
}))

const onOk = async () => {
  if (splitting.value || !selected.value.length) return
  const vtoGoodSortOrders = rows.value.filter((r) => selected.value.includes(r.sortOrder)).map((r) => r.sortOrder)
  splitting.value = true
  try {
    if (!(await props.save())) return
    const res = await import40Api.splitDeclaration(props.caseId, props.dtId, { vtoGoodSortOrders })
    close()
    emit('done', res)
  } catch {
    // текст ошибки показал общий перехватчик
  } finally {
    splitting.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.dt.split.title')"
    :width="760"
    :ok-text="vtoOnly ? t('broker.dt.split.createVto') : t('broker.dt.split.split')"
    :cancel-text="t('broker.dt.split.cancel')"
    :confirm-loading="splitting"
    :ok-button-props="{ disabled: loading || !selected.length }"
    data-dt-split-modal
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <p class="m-0 mb-3 text-sm text-ink-3">{{ t('broker.dt.split.hint') }}</p>
    <ZAlert v-if="vtoOnly" type="info" show-icon :message="t('broker.dt.split.vtoOnly')" class="mb-3" data-dt-split-vto-only />
    <ZTable
      :columns="columns"
      :data-source="rows"
      row-key="sortOrder"
      size="small"
      :pagination="false"
      :loading="loading"
      :row-selection="rowSelection"
      :aria-label="t('broker.dt.split.tableLabel')"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'tnvedCode'" class="font-mono">{{ record.tnvedCode || '—' }}</span>
        <ZTooltip v-else-if="column.key === 'vtoStatus'" :title="record.vtoStatus || ''">
          <span class="line-clamp-2 text-ink-2">{{ record.vtoStatus || '—' }}</span>
        </ZTooltip>
        <template v-else-if="column.key === 'ettRate'">{{ record.ettRate || '—' }}</template>
        <template v-else-if="column.key === 'vtoRate'">{{ record.vtoRate || '—' }}</template>
      </template>
    </ZTable>
  </ZModal>
</template>
