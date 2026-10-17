<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhDownloadSimple, PhPaperclip, PhPencilSimple, PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import {
  clientRegistryApi, REGISTRY_CATEGORIES,
  type RegistryDocument, type RegistryFields, type RegistryFile,
} from '@/api/clientRegistry'
import { DOC_ACCEPT } from '@/views/client/wizard/useShipmentFiles'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'
import RegistryDocModal from './RegistryDocModal.vue'
import {
  categoryCounts, docTitle, emptyFields, fieldsOf, filterDocs, STATUS_FILTERS, STATUS_TONE, statusCounts, validDate, validityHint,
  type CategoryFilter, type StatusFilter,
} from './registry'

// «Реестр документов» клиента (волна 17.10, задача 2): контракты, УНК, сертификаты, декларации о соответствии,
// разрешения, лицензии, ТРОИС — со сроками, фильтрами «действует / истекает / истёк / бессрочный» и загрузкой.
// Один и тот же раздел у клиента («Документы») и у сотрудника (карточка клиента). Удаления нет — «В архив».
const props = defineProps<{ clientId: string }>()
const { t } = useI18n()
const { confirm } = useConfirm()
const uid = useId()
const headingId = `registry-${uid}`

const docs = shallowRef<RegistryDocument[]>([])
const status = ref<'loading' | 'error' | 'ready'>('loading')
const showArchived = ref(false)
let seq = 0
const load = async () => {
  if (!props.clientId) return
  const my = ++seq
  if (!docs.value.length) status.value = 'loading'
  try {
    const list = await clientRegistryApi.list(props.clientId, { includeArchived: showArchived.value, silent: true })
    if (my !== seq) return
    docs.value = list
    status.value = 'ready'
  } catch {
    if (my === seq) status.value = 'error'
  }
}
watch([() => props.clientId, showArchived], () => { void load() }, { immediate: true })

// ---- Фильтры ----
const q = ref('')
const category = ref<CategoryFilter>('all')
const statusFilter = ref<StatusFilter>('all')
const counts = computed(() => statusCounts(docs.value.filter((d) => !d.isArchived), q.value, category.value))
const catCounts = computed(() => categoryCounts(docs.value.filter((d) => !d.isArchived)))
const categoryOptions = computed(() => [
  { value: 'all', label: t('clientRegistry.allCategories') },
  ...REGISTRY_CATEGORIES.map((c) => ({ value: c, label: `${t(`clientRegistry.category.${c}`)} · ${catCounts.value[c]}` })),
])
const statusOptions = computed(() => STATUS_FILTERS.map((s) => ({
  value: s,
  label: `${t(s === 'all' ? 'clientRegistry.allStatuses' : `clientRegistry.status.${s}`)} ${status.value === 'ready' ? counts.value[s] : ''}`.trim(),
})))
const rows = computed(() => {
  const list = filterDocs(docs.value, q.value, category.value, statusFilter.value)
  // Архивные — в конце, остальные — как отдал сервер (категория, срок).
  return [...list.filter((d) => !d.isArchived), ...list.filter((d) => d.isArchived)]
})
const filtered = computed(() => !!q.value.trim() || category.value !== 'all' || statusFilter.value !== 'all')
const reset = () => { q.value = ''; category.value = 'all'; statusFilter.value = 'all' }
const attention = computed(() => ({ expiring: counts.value.expiring, expired: counts.value.expired }))

// ---- Окно документа ----
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editing = shallowRef<RegistryDocument | null>(null)
const modalInitial = shallowRef<RegistryFields | null>(null)
const openCreate = () => {
  modalMode.value = 'create'
  editing.value = null
  modalInitial.value = emptyFields(category.value === 'all' ? 'supplyContract' : category.value)
  modalOpen.value = true
}
const openEdit = (d: RegistryDocument) => {
  modalMode.value = 'edit'
  editing.value = d
  modalInitial.value = fieldsOf(d)
  modalOpen.value = true
}
const replace = (d: RegistryDocument) => {
  const i = docs.value.findIndex((x) => x.id === d.id)
  docs.value = i < 0 ? [...docs.value, d] : docs.value.map((x) => (x.id === d.id ? d : x))
}
const save = async (fields: RegistryFields, files: File[]) => {
  if (modalMode.value === 'edit' && editing.value) {
    replace(await clientRegistryApi.update(props.clientId, editing.value.id, fields))
    message.success(t('clientRegistry.saved'))
  } else {
    replace(await clientRegistryApi.create(props.clientId, fields, files))
    message.success(t('clientRegistry.added'))
  }
  void load()
}

// ---- Добавить файлы к документу ----
const fileInput = ref<HTMLInputElement>()
const addingTo = shallowRef<RegistryDocument | null>(null)
const busy = ref<string | null>(null)
const pickFiles = (d: RegistryDocument) => {
  addingTo.value = d
  fileInput.value?.click()
}
const onFilesPicked = async (e: Event) => {
  const el = e.target as HTMLInputElement
  const picked = Array.from(el.files ?? [])
  el.value = ''
  const d = addingTo.value
  if (!d || !picked.length) return
  busy.value = d.id
  try {
    replace(await clientRegistryApi.addFiles(props.clientId, d.id, picked))
    message.success(t('clientRegistry.filesAdded'))
  } catch { /* общий перехватчик */ } finally {
    busy.value = null
  }
}

// ---- Архив ----
const toggleArchive = async (d: RegistryDocument) => {
  if (!d.isArchived) {
    const ok = await confirm({
      title: t('clientRegistry.archiveTitle', { name: docTitle(d, t) }),
      content: t('clientRegistry.archiveText'),
      okText: t('clientRegistry.archive'),
      cancelText: t('clientRegistry.form.cancel'),
    })
    if (!ok) return
  }
  busy.value = d.id
  try {
    const res = d.isArchived
      ? await clientRegistryApi.restore(props.clientId, d.id)
      : await clientRegistryApi.archive(props.clientId, d.id)
    if (res.isArchived && !showArchived.value) docs.value = docs.value.filter((x) => x.id !== d.id)
    else replace(res)
    message.success(t(res.isArchived ? 'clientRegistry.archived' : 'clientRegistry.restored'))
  } catch { /* общий перехватчик */ } finally {
    busy.value = null
  }
}

// ---- Скачать ----
const download = async (d: RegistryDocument, f: RegistryFile) => {
  try {
    saveBlob(await clientRegistryApi.download(props.clientId, d.id, f.id), f.fileName)
  } catch { /* общий перехватчик */ }
}

const hintClass = (d: RegistryDocument) =>
  d.status === 'expired' ? 'font-semibold text-tone-danger-fg' : d.status === 'expiring' ? 'font-semibold text-gold-ink' : 'text-muted'
const actionBtn = 'inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent px-1.5 font-sans text-[13px] font-semibold text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus disabled:cursor-progress disabled:text-muted sm:min-h-8'

defineExpose({ reload: load })
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-3.5 rounded-panel border border-line bg-surface px-6 py-[18px] max-sm:px-4" data-client-registry>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1 basis-60">
        <h2 :id="headingId" class="m-0 text-md font-semibold text-ink">{{ t('clientRegistry.title') }}</h2>
        <p class="m-0 mt-0.5 text-sm text-ink-3">{{ t('clientRegistry.subtitle') }}</p>
      </div>
      <ZButton class="max-sm:h-11 max-sm:w-full" data-registry-add @click="openCreate">
        <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
        {{ t('clientRegistry.add') }}
      </ZButton>
    </div>

    <p
      v-if="status === 'ready' && (attention.expiring || attention.expired)"
      class="m-0 rounded-row bg-gold-soft px-3.5 py-2.5 text-sm text-gold-ink"
      role="status"
      data-registry-attention
    >
      <template v-if="attention.expired">{{ t('clientRegistry.attention.expired', { n: attention.expired }) }} </template>
      <template v-if="attention.expiring">{{ t('clientRegistry.attention.expiring', { n: attention.expiring }) }}</template>
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <ZInput
        :value="q"
        type="search"
        allow-clear
        :placeholder="t('clientRegistry.search')"
        :aria-label="t('clientRegistry.search')"
        class="w-full max-sm:h-11 sm:w-[240px]"
        data-registry-search
        @update:value="q = $event ?? ''"
      />
      <ZSelect
        :value="category"
        :options="categoryOptions"
        :aria-label="t('clientRegistry.categoryLabel')"
        class="w-full max-sm:h-11 sm:w-[260px]"
        data-registry-category-filter
        @update:value="category = ($event ?? 'all') as CategoryFilter"
      />
      <ZSegmented
        :value="statusFilter"
        :options="statusOptions"
        :aria-label="t('clientRegistry.statusLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-registry-status-filter
        @update:value="statusFilter = $event as StatusFilter"
      />
      <ZCheckbox v-model:checked="showArchived" class="flex min-h-11 items-center gap-2 text-sm text-ink-2 sm:min-h-8" data-registry-show-archived>
        {{ t('clientRegistry.showArchived') }}
      </ZCheckbox>
    </div>

    <div v-if="status === 'loading'" class="flex flex-col gap-2" aria-busy="true" data-registry-skeleton>
      <ZSkeleton v-for="i in 3" :key="i" height="56px" />
    </div>
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 rounded-row border border-line px-4 py-3" role="alert" data-registry-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('clientRegistry.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" data-registry-retry @click="load">{{ t('clientRegistry.retry') }}</ZButton>
    </div>
    <ZEmpty
      v-else-if="!rows.length"
      :title="filtered ? t('clientRegistry.nothingFound') : t('clientRegistry.empty')"
      :hint="filtered ? undefined : t('clientRegistry.emptyHint')"
      data-registry-empty
    >
      <template v-if="filtered" #action><ZButton data-registry-reset @click="reset">{{ t('clientRegistry.resetFilters') }}</ZButton></template>
    </ZEmpty>
    <ul v-else role="list" class="m-0 list-none rounded-row border border-solid border-line p-0" data-registry-list>
      <li
        v-for="(d, i) in rows"
        :key="d.id"
        :class="cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4', i > 0 && 'border-0 border-t border-solid border-line', d.isArchived && 'opacity-70')"
        :data-registry-doc="d.id"
        :data-status="d.status"
      >
        <div class="min-w-0 flex-1">
          <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="min-w-0 text-[15px] font-semibold break-words text-ink" data-registry-doc-title>{{ docTitle(d, t) }}</span>
            <ZTag v-if="d.isArchived" tone="neutral" size="sm" data-registry-archived-tag>{{ t('clientRegistry.archivedTag') }}</ZTag>
            <ZTag v-else :tone="STATUS_TONE[d.status]" size="sm" data-registry-status>{{ t(`clientRegistry.status.${d.status}`) }}</ZTag>
          </p>
          <p v-if="d.counterparty || d.tnvedCodes" class="m-0 mt-0.5 text-[13px] break-words text-ink-3">
            <template v-if="d.counterparty">{{ d.counterparty }}</template>
            <template v-if="d.counterparty && d.tnvedCodes"> · </template>
            <span v-if="d.tnvedCodes" class="font-mono tabular-nums">{{ t('clientRegistry.tnvedShort', { codes: d.tnvedCodes }) }}</span>
          </p>
          <p v-if="d.note" class="m-0 mt-0.5 text-[13px] break-words text-muted">{{ d.note }}</p>
          <ul role="list" class="m-0 mt-1 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0" data-registry-doc-files>
            <li v-for="f in d.files" :key="f.id" class="min-w-0">
              <button
                type="button"
                class="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent p-0 font-sans text-[13px] text-ink-2 outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-6"
                :aria-label="t('clientRegistry.downloadFile', { name: f.fileName })"
                data-registry-download
                @click="download(d, f)"
              >
                <PhDownloadSimple :size="13" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="min-w-0 truncate">{{ f.fileName }}</span>
              </button>
            </li>
          </ul>
        </div>
        <div class="flex shrink-0 flex-col gap-0.5 sm:w-[170px] sm:items-end sm:text-right">
          <span class="text-sm text-ink tabular-nums" data-registry-until>
            {{ d.validUntil ? t('clientRegistry.until', { date: validDate(d.validUntil) }) : t('clientRegistry.hint.unlimited') }}
          </span>
          <span v-if="d.validUntil" :class="cn('text-xs', hintClass(d))" data-registry-hint>{{ validityHint(d, t) }}</span>
          <span class="text-xs text-muted" data-registry-added-by>{{ t(d.addedByClient ? 'clientRegistry.addedByClient' : 'clientRegistry.addedByStaff') }}</span>
          <div class="-mr-1.5 mt-1 flex flex-wrap gap-x-1 sm:justify-end">
            <button v-if="!d.isArchived" type="button" :class="actionBtn" :disabled="busy === d.id" data-registry-edit @click="openEdit(d)">
              <PhPencilSimple :size="14" aria-hidden="true" />{{ t('clientRegistry.edit') }}
            </button>
            <button v-if="!d.isArchived" type="button" :class="actionBtn" :disabled="busy === d.id" data-registry-add-file @click="pickFiles(d)">
              <PhPaperclip :size="14" aria-hidden="true" />{{ t('clientRegistry.addFile') }}
            </button>
            <button type="button" :class="cn(actionBtn, 'text-ink-3')" :disabled="busy === d.id" :aria-busy="busy === d.id || undefined" data-registry-archive @click="toggleArchive(d)">
              <PhArchive :size="14" aria-hidden="true" />{{ t(d.isArchived ? 'clientRegistry.restore' : 'clientRegistry.archive') }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <input ref="fileInput" type="file" multiple :accept="DOC_ACCEPT.join(',')" class="hidden" tabindex="-1" aria-hidden="true" data-registry-file-input @change="onFilesPicked">
    <RegistryDocModal v-model:open="modalOpen" :mode="modalMode" :initial="modalInitial" :save="save" />
  </section>
</template>
