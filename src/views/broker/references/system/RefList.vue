<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import { referencesApi } from '@/api/references'
import { message } from '@/ui/message'
import { useConfirm } from '@/ui/confirm'
import type { RefItem } from '@/types/api'
import ItemsTable from './ItemsTable.vue'
import RefItemModal, { type RefItemValue } from './RefItemModal.vue'
import { countActive, type RefKind } from './systemData'

// Станции назначения и таможенные посты: список со скрытыми (includeInactive), добавление, переименование,
// «Скрыть» (DELETE — запись деактивируется) и «Вернуть» (PUT isActive=true), оба с подтверждением.
// После каждой загрузки сообщает число активных записей — счётчик в меню (сбой загрузки — error: в меню «—»).
const props = defineProps<{ kind: RefKind; canEdit: boolean }>()
const emit = defineEmits<{ count: [n: number]; error: [] }>()
const { t } = useI18n()
const { confirm } = useConfirm()

const api = computed(() => (props.kind === 'stations'
  ? { list: referencesApi.listStations, create: referencesApi.createStation, update: referencesApi.updateStation, remove: referencesApi.deleteStation }
  : { list: referencesApi.listCustomsPosts, create: referencesApi.createCustomsPost, update: referencesApi.updateCustomsPost, remove: referencesApi.deleteCustomsPost }))

const rows = shallowRef<RefItem[]>([])
const loading = ref(true)
const error = ref(false)
let seq = 0
const load = async () => {
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const data = await api.value.list({ silent: true, includeInactive: props.canEdit })
    if (my !== seq) return
    rows.value = data
    emit('count', countActive(data))
  } catch {
    if (my === seq) {
      error.value = true
      emit('error') // счётчик в меню не ждёт вечно: «—»
    }
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => props.kind, () => { rows.value = []; void load() }, { immediate: true })

const title = computed(() => t(`broker.references.system.item.${props.kind}`))
const hint = computed(() => t(`broker.references.system.list.${props.kind}Hint`))

// ---- Окно добавления / правки ----
const modalOpen = ref(false)
const editing = ref<RefItem | null>(null)
const initial = computed<RefItemValue | null>(() => (editing.value ? { code: '', name: editing.value.name } : null))
const openAdd = () => { editing.value = null; modalOpen.value = true }
const openEdit = (r: RefItem) => { editing.value = r; modalOpen.value = true }
const save = async (v: RefItemValue) => {
  const current = editing.value
  if (current) await api.value.update(current.id, v.name, current.isActive)
  else await api.value.create(v.name)
  message.success(t(current ? 'broker.references.system.list.savedToast' : 'broker.references.system.list.addedToast'))
  await load()
}

// ---- Скрыть / вернуть ----
const hide = async (r: RefItem) => {
  const ok = await confirm({
    title: t('broker.references.system.list.hideConfirm', { name: r.name }),
    content: t('broker.references.system.list.hideConfirmText'),
    okText: t('broker.references.system.list.hide'),
    danger: true,
  })
  if (!ok) return
  try {
    await api.value.remove(r.id)
    message.success(t('broker.references.system.list.hiddenToast'))
    await load()
  } catch { /* текст ошибки показал общий перехватчик */ }
}
const restore = async (r: RefItem) => {
  const ok = await confirm({
    title: t('broker.references.system.list.restoreConfirm', { name: r.name }),
    content: t('broker.references.system.list.restoreConfirmText'),
    okText: t('broker.references.system.list.restore'),
  })
  if (!ok) return
  try {
    await api.value.update(r.id, r.name, true)
    message.success(t('broker.references.system.list.restoredToast'))
    await load()
  } catch { /* текст ошибки показал общий перехватчик */ }
}
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" :aria-labelledby="`sd-title-${kind}`" :data-ref-list="kind">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1 basis-60">
        <h2 :id="`sd-title-${kind}`" class="m-0 text-[17px] leading-6 font-semibold text-ink">{{ title }}</h2>
        <p class="m-0 mt-1 text-sm text-ink-3">{{ hint }}</p>
      </div>
      <ZButton v-if="canEdit" class="border border-line-strong bg-surface max-sm:h-11 max-sm:w-full" variant="secondary" data-ref-add @click="openAdd">
        <template #icon><PhPlus :size="15" aria-hidden="true" /></template>
        {{ t('broker.references.system.list.add') }}
      </ZButton>
    </div>

    <ItemsTable
      :rows="rows"
      :loading="loading"
      :error="error"
      :with-code="false"
      :can-edit="canEdit"
      :label="title"
      :reset-key="kind"
      @edit="openEdit"
      @hide="hide"
      @restore="restore"
      @retry="load"
    />

    <RefItemModal v-if="canEdit" v-model:open="modalOpen" :with-code="false" :initial="initial" :save="save" />
  </section>
</template>
