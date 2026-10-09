<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTable from '@/components/z/ZTable.vue'
import { referencesApi, type EecSyncResult } from '@/api/references'
import { useClassifiersStore } from '@/stores/classifiers'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import type { ZColumn } from '@/ui/table'
import type { ClassifierItem } from '@/types/api'
import ItemsTable from './ItemsTable.vue'
import RefItemModal, { type RefItemValue } from './RefItemModal.vue'
import { classifierTitle, countActive, formatCount } from './systemData'

// Коды одного классификатора ЕЭК: со скрытыми (includeInactive), «Добавить код», правка кода и названия,
// «Скрыть» / «Вернуть» с подтверждением; «Сверить с ЕЭК» — подтверждение, загрузка на кнопке, затем окно итогов.
// Компонент переиспользуется при переключении классификаторов: поздний ответ прежнего отбрасывается (seq).
// После изменений — сброс кэша классификаторов (формы ДТ перечитают) и changed (меню перечитает счётчики).
const props = defineProps<{ code: string; canEdit: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const { confirm } = useConfirm()
const classifiers = useClassifiersStore()

const rows = shallowRef<ClassifierItem[]>([])
const loading = ref(true)
const error = ref(false)
let seq = 0
const load = async () => {
  const code = props.code
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const data = await referencesApi.listClassifiers(code, { silent: true, includeInactive: props.canEdit })
    if (my !== seq) return
    rows.value = data
  } catch {
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => props.code, () => { rows.value = []; void load() }, { immediate: true })

const tr = (k: string) => t(k)
const title = computed(() => classifierTitle(props.code, tr))
const meta = computed(() => (loading.value && !rows.value.length
  ? t('broker.references.system.cls.meta')
  : `${t('broker.references.system.cls.meta')} · ${t('broker.references.system.cls.codes', { n: formatCount(countActive(rows.value), locale.value) })}`))

const afterChange = async () => {
  classifiers.invalidate(props.code)
  emit('changed')
  await load()
}

// ---- Окно добавления / правки ----
const modalOpen = ref(false)
const editing = ref<ClassifierItem | null>(null)
const initial = computed<RefItemValue | null>(() => (editing.value ? { code: editing.value.code, name: editing.value.nameRu } : null))
const openAdd = () => { editing.value = null; modalOpen.value = true }
const openEdit = (r: ClassifierItem) => { editing.value = r; modalOpen.value = true }
const save = async (v: RefItemValue) => {
  const current = editing.value
  if (current) await referencesApi.updateClassifier(current.id, v.code, v.name, current.sortOrder, current.isActive)
  else await referencesApi.createClassifier(props.code, v.code, v.name)
  message.success(t(current ? 'broker.references.system.list.savedToast' : 'broker.references.system.list.addedToast'))
  await afterChange()
}

// ---- Скрыть / вернуть ----
const label = (r: ClassifierItem) => `${r.code} — ${r.nameRu}`
const hide = async (r: ClassifierItem) => {
  const ok = await confirm({
    title: t('broker.references.system.list.hideConfirm', { name: label(r) }),
    content: t('broker.references.system.list.hideConfirmText'),
    okText: t('broker.references.system.list.hide'),
    danger: true,
  })
  if (!ok) return
  try {
    await referencesApi.deleteClassifier(r.id)
    message.success(t('broker.references.system.list.hiddenToast'))
    await afterChange()
  } catch { /* текст ошибки показал общий перехватчик */ }
}
const restore = async (r: ClassifierItem) => {
  const ok = await confirm({
    title: t('broker.references.system.list.restoreConfirm', { name: label(r) }),
    content: t('broker.references.system.list.restoreConfirmText'),
    okText: t('broker.references.system.list.restore'),
  })
  if (!ok) return
  try {
    await referencesApi.updateClassifier(r.id, r.code, r.nameRu, r.sortOrder, true)
    message.success(t('broker.references.system.list.restoredToast'))
    await afterChange()
  } catch { /* текст ошибки показал общий перехватчик */ }
}

// ---- Сверка с ЕЭК (все классификаторы и посты КЕДЕН; до 3 минут) ----
const eecBusy = ref(false)
const eecOpen = ref(false)
const eecResults = shallowRef<EecSyncResult[]>([])
const runEec = async () => {
  if (eecBusy.value) return
  const ok = await confirm({
    title: t('broker.references.system.eec.confirmTitle'),
    content: t('broker.references.system.eec.confirmText'),
    okText: t('broker.references.system.eec.confirmOk'),
  })
  if (!ok) return
  eecBusy.value = true
  try {
    const results = await referencesApi.syncEec()
    eecResults.value = results
    const added = results.reduce((s, r) => s + r.added, 0)
    const hidden = results.reduce((s, r) => s + r.deactivated, 0)
    const failed = results.filter((r) => r.error).length
    if (failed) message.warning(t('broker.references.system.eec.partial', { added, hidden, failed }))
    else message.success(t('broker.references.system.eec.done', { added, hidden }))
    eecOpen.value = true
    classifiers.invalidate()
    emit('changed')
    await load()
  } catch { /* текст ошибки показал общий перехватчик */ } finally {
    eecBusy.value = false
  }
}
const eecColumns = computed<ZColumn<EecSyncResult>[]>(() => [
  { key: 'target', title: t('broker.references.system.eec.colTarget') },
  { key: 'source', dataIndex: 'source', title: t('broker.references.system.eec.colSource'), width: 100 },
  { key: 'sourceTotal', dataIndex: 'sourceTotal', title: t('broker.references.system.eec.colTotal'), width: 100, align: 'right' },
  { key: 'added', dataIndex: 'added', title: t('broker.references.system.eec.colAdded'), width: 100, align: 'right' },
  { key: 'deactivated', dataIndex: 'deactivated', title: t('broker.references.system.eec.colHidden'), width: 90, align: 'right' },
  { key: 'error', title: t('broker.references.system.eec.colError'), width: 160 },
])
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" aria-labelledby="sd-title-cls" data-classifier-list :data-code="code">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1 basis-60">
        <h2 id="sd-title-cls" class="m-0 text-[17px] leading-6 font-semibold text-ink [overflow-wrap:anywhere]" data-classifier-title>{{ title }}</h2>
        <p class="m-0 mt-1 text-sm text-ink-3" data-classifier-meta>{{ meta }}</p>
      </div>
      <div v-if="canEdit" class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <ZButton variant="secondary" :loading="eecBusy" class="max-sm:h-11 max-sm:flex-1" data-eec-sync @click="runEec">
          <template #icon><PhArrowsClockwise :size="15" aria-hidden="true" /></template>
          {{ t('broker.references.system.eec.button') }}
        </ZButton>
        <ZButton class="border border-line-strong bg-surface max-sm:h-11 max-sm:flex-1" variant="secondary" data-ref-add @click="openAdd">
          <template #icon><PhPlus :size="15" aria-hidden="true" /></template>
          {{ t('broker.references.system.list.addCode') }}
        </ZButton>
      </div>
    </div>
    <p v-if="eecBusy" class="m-0 text-sm text-ink-2" role="status" data-eec-running>{{ t('broker.references.system.eec.running') }}</p>
    <p v-else class="m-0 text-sm text-muted">{{ t('broker.references.system.cls.hint') }}</p>

    <ItemsTable
      :rows="rows"
      :loading="loading"
      :error="error"
      :with-code="true"
      :can-edit="canEdit"
      :label="title"
      :reset-key="code"
      @edit="openEdit"
      @hide="hide"
      @restore="restore"
      @retry="load"
    />

    <RefItemModal v-if="canEdit" v-model:open="modalOpen" :with-code="true" :initial="initial" :save="save" />

    <ZModal v-model:open="eecOpen" :title="t('broker.references.system.eec.resultTitle')" :width="760" :footer="false" data-eec-results>
      <p class="m-0 mb-3 text-sm text-ink-2">{{ t('broker.references.system.eec.resultHint') }}</p>
      <ZTable :columns="eecColumns" :data-source="eecResults" row-key="target" size="small" :pagination="false" :aria-label="t('broker.references.system.eec.resultTitle')">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'target'" class="text-sm text-ink" data-eec-target>{{ classifierTitle(record.target, tr) }}</span>
          <span v-else-if="column.key === 'error'" :class="record.error ? 'text-sm text-tone-danger-fg' : 'text-sm text-muted'">{{ record.error || '—' }}</span>
        </template>
      </ZTable>
    </ZModal>
  </section>
</template>
