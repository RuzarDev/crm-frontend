<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { import40Api, type Import40SplitResult, type Import40SplitState, type Import40SplitSuggestionRow } from '@/api/import40'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import type { ZColumn, ZKey } from '@/ui/table'
import { splitChangeNotes, splitDuplicateRoles, splitPartLabel, splitPartVersions, splitUnchanged } from './splitChange'

// «Разделить на ЕТТ/ВТО» (поведение как в прежнем окне): при открытии — подсказка сервера по СОХРАНЁННОЙ ДТ
// (страница сохраняет перед открытием); в таблице только кандидаты ВТО, по умолчанию отмечены; кандидатов нет —
// сообщение и окно не показывается. Отмечены все товары ДТ — одна ДТ ВТО без ЕТТ-части. Перед разделением —
// ещё одно сохранение (правки, сделанные после открытия), затем POST split; результат — родителю (переход в ВТО).
// mode 'change' — «Изменить разделение» исходной ДТ (16.10): те же товары исходной (кандидаты и те, что сейчас в ВТО),
// предвыбор — текущая часть ВТО; под таблицей — что сохранится, пропадёт или вернётся; «Заменить части» — ещё одно
// подтверждение со списком, затем POST split с replaceExisting и отметками частей из split-state. Части изменили после
// открытия окна (409 Import40.SplitPartsChanged) — сообщение, окно перечитывается (выбор декларанта остаётся). Изменить
// нельзя (часть подана/выпущена, несколько частей одной роли, цепочка) — окно показывает причину, кнопка выключена.
const props = defineProps<{
  open: boolean
  caseId: string
  dtId: string
  goodsCount: number
  /** Сохранить ДТ перед разделением (тихо). */
  save: () => Promise<boolean>
  /** 'change' — «Изменить разделение» исходной ДТ (части заменяются). */
  mode?: 'split' | 'change'
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; done: [res: Import40SplitResult] }>()
const { t } = useI18n()
const { confirm } = useConfirm()

const changing = computed(() => props.mode === 'change')
const state = ref<Import40SplitState | null>(null)
const loading = ref(false)
const splitting = ref(false)
const rows = ref<Import40SplitSuggestionRow[]>([])
const selected = ref<ZKey[]>([])

const close = () => emit('update:open', false)

/** Загрузить подсказку (и split-state в режиме изменения). keep — выбор декларанта, который сохранить после перечитывания. */
const load = async (keep: readonly number[] | null = null) => {
  loading.value = true
  rows.value = []
  selected.value = []
  state.value = null
  try {
    const [all, st] = await Promise.all([
      import40Api.splitSuggestion(props.caseId, props.dtId),
      changing.value ? import40Api.splitState(props.caseId, props.dtId) : Promise.resolve(null),
    ])
    if (st?.blockedReason) {
      // Окно остаётся открытым с причиной: длинное объяснение (кому обратиться) не должно пропасть вместе с тостом.
      state.value = st
      return
    }
    const current = new Set(st?.vtoSortOrders ?? [])
    const candidates = all.filter((r) => r.isVtoCandidate || current.has(r.sortOrder))
    if (!candidates.length) {
      close()
      message.info(t('broker.dt.split.noCandidates'))
      return
    }
    state.value = st
    rows.value = candidates
    const pre = keep ? new Set(keep) : current
    selected.value = st ? candidates.filter((r) => pre.has(r.sortOrder)).map((r) => r.sortOrder) : candidates.map((r) => r.sortOrder)
  } catch {
    close() // текст ошибки показал общий перехватчик
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => { if (open) void load() }, { immediate: true })

/** Изменить нельзя: несколько частей одной роли (старое двойное разделение) — свой текст; иначе — причина сервера. */
const blockedText = computed(() => {
  const st = state.value
  if (!st?.blockedReason) return null
  if (splitDuplicateRoles(st)) {
    return t('broker.dt.split.changeDuplicateParts', { list: st.parts.map((p) => splitPartLabel(p, t)).join(', ') })
  }
  return st.blockedReason
})
/** Наименования товаров исходной ДТ — для списка «перейдут ЕТТ↔ВТО». */
const names = computed(() => new Map(rows.value.map((r) => [r.sortOrder, r.description])))

const picked = computed(() => rows.value.filter((r) => selected.value.includes(r.sortOrder)).map((r) => r.sortOrder))
/** «Изменить разделение»: что сохранится, пропадёт или вернётся при текущем выборе. */
const notes = computed(() => (state.value && !blockedText.value ? splitChangeNotes(state.value, picked.value, props.goodsCount, t, names.value) : []))
const unchanged = computed(() => !!state.value && splitUnchanged(state.value, picked.value))

/** Отмечены все товары ДТ (в т.ч. единственный) — ЕТТ-части не будет. */
const vtoOnly = computed(() => rows.value.length > 0 && selected.value.length === props.goodsCount)

const columns = computed<ZColumn<Import40SplitSuggestionRow>[]>(() => [
  { title: '№', dataIndex: 'sortOrder', key: 'no', width: 56 },
  { title: t('broker.dt.split.tnved'), dataIndex: 'tnvedCode', key: 'tnvedCode', width: 140 },
  { title: t('broker.dt.split.vtoStatus'), dataIndex: 'vtoStatus', key: 'vtoStatus' },
  { title: t('broker.dt.split.ettDuty'), dataIndex: 'ettRate', key: 'ettRate', width: 110 },
  { title: t('broker.dt.split.vtoDuty'), dataIndex: 'vtoRate', key: 'vtoRate', width: 110 },
])
const rowSelection = computed(() => ({
  selectedRowKeys: selected.value,
  onChange: (keys: ZKey[]) => { selected.value = keys },
}))

const problemOf = (e: unknown) => (e as { response?: { status?: number; data?: { title?: string; detail?: string } } } | null)?.response

const onOk = async () => {
  if (splitting.value || !selected.value.length || unchanged.value || blockedText.value) return
  const vtoGoodSortOrders = picked.value
  if (changing.value) {
    const ok = await confirm({
      title: t('broker.dt.split.changeConfirmTitle'),
      content: notes.value.join('\n'),
      okText: t('broker.dt.split.changeConfirmOk'),
      cancelText: t('broker.dt.split.cancel'),
      danger: true,
    })
    if (!ok) return
  }
  splitting.value = true
  try {
    if (!(await props.save())) return
    const res = changing.value && state.value
      ? await import40Api.splitDeclaration(props.caseId, props.dtId,
        { vtoGoodSortOrders, replaceExisting: true, expectedParts: splitPartVersions(state.value) }, { silentConflict: true })
      : await import40Api.splitDeclaration(props.caseId, props.dtId, { vtoGoodSortOrders })
    close()
    emit('done', res)
  } catch (e) {
    // Режим изменения: 409 без общего тоста — окно перечитывается (выбор декларанта остаётся). Части изменили после
    // открытия окна — сказать, что список «что изменится» обновлён; иначе (появился запрет) — текст сервера, а окно
    // покажет причину. Прочие ошибки показал перехватчик.
    const resp = changing.value ? problemOf(e) : null
    if (resp?.status === 409) {
      message.warning(resp.data?.title === 'Import40.SplitPartsChanged'
        ? t('broker.dt.split.changeStale')
        : resp.data?.detail || t('errors.generic'))
      splitting.value = false
      await load(vtoGoodSortOrders)
    }
  } finally {
    splitting.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="changing ? t('broker.dt.split.changeTitle') : t('broker.dt.split.title')"
    :width="760"
    :ok-text="changing ? t('broker.dt.split.change') : vtoOnly ? t('broker.dt.split.createVto') : t('broker.dt.split.split')"
    :cancel-text="t('broker.dt.split.cancel')"
    :confirm-loading="splitting"
    :ok-button-props="{ disabled: loading || !selected.length || unchanged || !!blockedText }"
    :data-dt-split-modal="changing ? 'change' : 'split'"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <p class="m-0 mb-3 text-sm text-ink-3">{{ changing ? t('broker.dt.split.changeHint') : t('broker.dt.split.hint') }}</p>
    <ZAlert v-if="vtoOnly && !changing" type="info" show-icon :message="t('broker.dt.split.vtoOnly')" class="mb-3" data-dt-split-vto-only />
    <ZAlert v-if="blockedText" type="error" show-icon :message="t('broker.dt.split.changeBlocked')" class="mb-3" data-dt-split-blocked>
      <p class="m-0 mt-1 text-[13px]">{{ blockedText }}</p>
    </ZAlert>
    <ZTable
      v-else
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
        <span v-if="column.key === 'no'" class="tabular-nums text-ink-3">{{ record.sortOrder + 1 }}</span>
        <span v-else-if="column.key === 'tnvedCode'" class="font-mono">{{ record.tnvedCode || '—' }}</span>
        <ZTooltip v-else-if="column.key === 'vtoStatus'" :title="record.vtoStatus || ''">
          <span class="line-clamp-2 text-ink-2">{{ record.vtoStatus || '—' }}</span>
        </ZTooltip>
        <template v-else-if="column.key === 'ettRate'">{{ record.ettRate || '—' }}</template>
        <template v-else-if="column.key === 'vtoRate'">{{ record.vtoRate || '—' }}</template>
      </template>
    </ZTable>
    <p v-if="unchanged && !blockedText" class="m-0 mt-3 text-[13px] text-ink-3" data-dt-split-same>{{ t('broker.dt.split.changeSame') }}</p>
    <ZAlert v-else-if="notes.length" type="warning" show-icon :message="t('broker.dt.split.changeConfirmTitle')" class="mt-3" data-dt-split-notes>
      <ul class="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
        <li v-for="n in notes" :key="n">{{ n }}</li>
      </ul>
    </ZAlert>
  </ZModal>
</template>
