<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowRight, PhDownloadSimple, PhFile, PhShippingContainer, PhTrash } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import PackageStatusModal from './PackageStatusModal.vue'
import { documentPackagesApi } from '@/api/documentPackages'
import { useAuthStore } from '@/stores/auth'
import type { DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'
import { message } from '@/ui/message'
import { saveBlob } from '@/ui/download'
import { useConfirm } from '@/ui/confirm'
import { formatUpdated } from '@/views/broker/list'
import { formatContainer } from '@/views/broker/transit/transit'
import { canModifyFiles, formatFileSize, formatStamp, statusLabelKey, statusTone } from './packages'

// Панель пакета (редизайн, волна 3а): сначала показываем данные строки, затем getById (скелетон контейнеров).
// Файлы — скачать (всем), загрузить и удалить (canModifyFiles — как на сервере), «Открыть пакет» и «Сменить статус» —
// проверяющему (packages.manage). Любое изменение сообщает родителю (changed) — список обновляется.
const props = defineProps<{ open: boolean; row: DocumentPackageDto | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [] }>()

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const { confirm } = useConfirm()

const role = computed(() => (auth.role ?? '').trim().toLowerCase())
const canReview = computed(() => auth.hasPermission('packages.manage'))

// ---- Данные: полная карточка поверх строки списка ----
const detail = shallowRef<DocumentPackageDto | null>(null)
const loading = ref(false)
const failed = ref(false)
let seq = 0
const load = async (id: string) => {
  const my = ++seq
  loading.value = true
  failed.value = false
  try {
    const d = await documentPackagesApi.getById(id, { silent: true })
    if (my === seq) detail.value = d
  } catch {
    if (my === seq) failed.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => [props.open, props.row?.id] as const, ([open, id]) => {
  if (!open || !id) return
  if (detail.value?.id !== id) detail.value = null
  void load(id)
}, { immediate: true })

const view = computed<DocumentPackageDto | null>(() => (detail.value && detail.value.id === props.row?.id ? detail.value : props.row))
const canModify = computed(() => !!view.value && canModifyFiles({ role: role.value, canReview: canReview.value, status: view.value.status }))
const skeleton = computed(() => loading.value && detail.value === null)

// ---- Файлы ----
const downloading = ref<string | null>(null)
const download = async (f: DocumentPackageFileDto) => {
  const pkg = view.value
  if (!pkg || downloading.value) return
  downloading.value = f.id
  try {
    saveBlob(await documentPackagesApi.downloadFile(pkg.id, f.id), f.originalFileName)
  } catch {
    // тост показал общий перехватчик
  } finally {
    downloading.value = null
  }
}

// Флаг загрузки — у каждого пакета свой: панель могли переключить на другой пакет, пока файлы уходят.
// Перечитываем только тот пакет, что сейчас открыт, — иначе поздний ответ сбил бы загрузку нового.
const uploadingIds = ref<string[]>([])
const uploading = computed(() => !!view.value && uploadingIds.value.includes(view.value.id))
const reloadIfShown = async (id: string) => { if (view.value?.id === id) await load(id) }
const upload = async (files: File[]) => {
  const pkg = view.value
  if (!pkg || uploadingIds.value.includes(pkg.id)) return
  uploadingIds.value = [...uploadingIds.value, pkg.id]
  let ok = true
  try {
    for (const f of files) await documentPackagesApi.uploadFile(pkg.id, f)
  } catch {
    ok = false // тост показал перехватчик; уже загруженное ниже попадёт в список
  }
  try {
    if (ok) message.success(t('transit.faylyZagruzheny'))
    await reloadIfShown(pkg.id)
    emit('changed')
  } finally {
    uploadingIds.value = uploadingIds.value.filter((id) => id !== pkg.id)
  }
}

const removeFile = async (f: DocumentPackageFileDto) => {
  const pkg = view.value
  if (!pkg) return
  const yes = await confirm({
    title: t('broker.packages.drawer.deleteTitle', { name: f.originalFileName }),
    okText: t('transit.udalit'),
    cancelText: t('transit.otmena'),
    danger: true,
  })
  if (!yes) return
  try {
    await documentPackagesApi.deleteFile(pkg.id, f.id)
  } catch {
    return // тост показал перехватчик
  }
  message.success(t('transit.faylUdalen'))
  await reloadIfShown(pkg.id)
  emit('changed')
}

// ---- Статус и рабочая область ----
const statusOpen = ref(false)
const onStatusChanged = (updated: DocumentPackageDto) => {
  if (updated.id === props.row?.id) detail.value = updated // ответ по прежнему пакету новый не затирает
  emit('changed')
}
const openWorkspace = () => {
  const pkg = view.value
  if (!pkg) return
  emit('update:open', false)
  void router.push(`/document-packages/${pkg.id}/workspace`)
}

const now = () => new Date()
const iconBtn = 'inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:size-11'
</script>

<template>
  <ZDrawer :open="open" :width="440" data-package-drawer @update:open="emit('update:open', $event)">
    <template #title>
      <template v-if="view">
        <span class="block text-xs font-normal text-muted">{{ t('broker.packages.drawer.eyebrow') }}</span>
        <span class="block text-lg leading-6 [overflow-wrap:anywhere]" data-package-title>{{ view.trainNumber }}</span>
        <span class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-normal">
          <ZTag :tone="statusTone(view.status)" data-package-status>{{ t(statusLabelKey(view.status)) }}</ZTag>
          <span class="text-xs text-muted">{{ t('broker.packages.drawer.byExpeditor', { name: view.createdByExpeditorUsername, date: formatStamp(view.createdAtUtc) }) }}</span>
        </span>
      </template>
      <template v-else>{{ t('broker.packages.drawer.eyebrow') }}</template>
    </template>

    <div v-if="view" class="flex flex-col gap-5">
      <p v-if="view.comment" class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]" data-package-comment>{{ view.comment }}</p>

      <div v-if="view.reviewComment" class="rounded-row bg-gold-soft px-3.5 py-3 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--color-gold-line)]" data-package-review-comment>
        <b class="font-semibold text-gold-ink">{{ t('broker.packages.drawer.reviewComment') }}:</b>{{ ' ' }}
        <span class="[overflow-wrap:anywhere]">{{ view.reviewComment }}</span>
      </div>

      <section aria-labelledby="pkg-containers" data-package-containers>
        <h3 id="pkg-containers" class="m-0 mb-1 text-base font-semibold text-ink">
          {{ t('broker.packages.drawer.containers') }}
          <span v-if="!skeleton" class="font-medium tabular-nums text-muted" data-containers-count>{{ view.containers.length }}</span>
        </h3>
        <div v-if="failed && !detail" class="flex flex-wrap items-center gap-3 rounded-row bg-sunken px-3.5 py-3" data-package-error>
          <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('broker.packages.drawer.loadError') }}</p>
          <ZButton size="sm" data-package-retry @click="row && load(row.id)">{{ t('broker.list.retry') }}</ZButton>
        </div>
        <ZSkeleton v-else-if="skeleton" :lines="3" height="36px" data-package-skeleton />
        <p v-else-if="!view.containers.length" class="m-0 border-t border-line py-3 text-sm text-muted">{{ t('broker.packages.drawer.noContainers') }}</p>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="c in view.containers" :key="c.id" class="flex items-center gap-2.5 border-t border-line py-2.5" data-package-container>
            <PhShippingContainer :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <div class="font-mono text-sm font-medium text-ink">{{ formatContainer(c.containerNumber) }}</div>
              <div v-if="c.secondaryContainerNumber" class="text-xs text-muted">{{ t('broker.packages.drawer.trailer', { number: formatContainer(c.secondaryContainerNumber) }) }}</div>
            </div>
            <span class="shrink-0 text-xs tabular-nums text-ink-3">{{ t('broker.packages.drawer.recipients', { n: c.consolidations.length }) }}</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="pkg-files" data-package-files>
        <div class="mb-1 flex items-center justify-between gap-3">
          <h3 id="pkg-files" class="m-0 text-base font-semibold text-ink">
            {{ t('broker.packages.drawer.files') }}
            <span class="font-medium tabular-nums text-muted" data-files-count>{{ view.files.length }}</span>
          </h3>
          <ZUpload
            v-if="canModify"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
            :max-size-mb="25"
            :loading="uploading"
            button-variant="ghost"
            button-size="sm"
            class="max-sm:[&_button]:h-11"
            data-package-upload
            @select="upload"
          >{{ t('broker.packages.drawer.upload') }}</ZUpload>
        </div>
        <p v-if="!view.files.length" class="m-0 border-t border-line py-3 text-sm text-muted">{{ t('transit.faylyEscheNeZagruzheny') }}</p>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="f in view.files" :key="f.id" class="flex items-center gap-2.5 border-t border-line py-2" data-package-file>
            <PhFile :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium text-ink" :title="f.originalFileName">{{ f.originalFileName }}</div>
              <div class="text-xs tabular-nums text-muted">{{ formatFileSize(f.sizeBytes, t) }} · {{ formatUpdated(f.uploadedAtUtc, now(), t) }}</div>
            </div>
            <ZTooltip :title="t('transit.skachat')">
              <button
                type="button"
                :class="iconBtn"
                :disabled="downloading !== null"
                :aria-label="t('broker.packages.drawer.download', { name: f.originalFileName })"
                data-file-download
                @click="download(f)"
              >
                <PhDownloadSimple :size="16" aria-hidden="true" />
              </button>
            </ZTooltip>
            <ZTooltip v-if="canModify" :title="t('transit.udalit')">
              <button
                type="button"
                :class="iconBtn"
                :aria-label="t('broker.packages.drawer.deleteFile', { name: f.originalFileName })"
                data-file-delete
                @click="removeFile(f)"
              >
                <PhTrash :size="16" aria-hidden="true" />
              </button>
            </ZTooltip>
          </li>
        </ul>
      </section>
    </div>

    <template v-if="canReview && view" #footer>
      <div class="flex w-full flex-wrap gap-2 max-sm:flex-col">
        <ZButton variant="primary" class="max-sm:h-11" data-package-workspace @click="openWorkspace">
          <template #icon><PhArrowRight :size="16" weight="bold" aria-hidden="true" /></template>
          {{ t('broker.packages.drawer.openPackage') }}
        </ZButton>
        <ZButton class="max-sm:h-11" data-package-change-status @click="statusOpen = true">{{ t('transit.smenitStatus') }}</ZButton>
      </div>
    </template>
  </ZDrawer>
  <PackageStatusModal v-if="canReview" v-model:open="statusOpen" :pkg="view" @changed="onStatusChanged" />
</template>
