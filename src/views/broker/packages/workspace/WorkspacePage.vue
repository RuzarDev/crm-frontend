<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { clientsOnboardingApi } from '@/api/clientsOnboarding'
import { documentPackagesApi } from '@/api/documentPackages'
import { useAuthStore } from '@/stores/auth'
import type { DocumentPackageContainerDto, DocumentPackageDto, DocumentPackageFileDto } from '@/types/api'
import { useConfirm } from '@/ui/confirm'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { pluralForm } from '@/views/broker/list'
import PackageStatusModal from '../PackageStatusModal.vue'
import { canModifyFiles } from '../packages'
import ContainerCard from './ContainerCard.vue'
import ContainerModal from './ContainerModal.vue'
import FilePreviewDrawer from './FilePreviewDrawer.vue'
import FilesPanel from './FilesPanel.vue'
import LinkMenu from './LinkMenu.vue'
import WorkspaceHeader from './WorkspaceHeader.vue'
import { provideWorkspaceDnd, useWorkspace, type ContainerInput } from './useWorkspace'
import { packageCounts, type LinkTarget } from './workspace'

// «Разбор поезда» — /document-packages/:id/workspace (редизайн, волна 4в, доска Workspace): шапка и плашка решения,
// слева входящие файлы (фильтры, просмотр, привязка, загрузка, удаление), справа контейнеры с партиями.
// Привязка файла — перетаскиванием на контейнер, партию или фон («не распределять») либо через «Привязать к…».
// Редактор партии — своя страница: «Открыть» и «+ Клиент» ведут на /document-packages/:id/partia/….
// Права: правка дерева, привязка и «Сформировать» — reestr.write; «Решение по пакету» — packages.manage и reestr.write;
// загрузка и удаление файлов — canModifyFiles (как на сервере). Остальным — только чтение.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { confirm } = useConfirm()

// id следует только за маршрутом страницы: при уходе (другой маршрут со своим :id) пакет под ещё видимой страницей не меняется.
const PAGE_ROUTE = 'document-packages-workspace'
const id = ref(String(route.params.id ?? ''))
watch(() => (route.name === PAGE_ROUTE ? route.params.id : undefined), (v) => { if (typeof v === 'string' && v) id.value = v })

const ws = useWorkspace(() => id.value)
const { pkg, loading, notFound, loadError, isPending } = ws

// ---- Права ----
const role = computed(() => (auth.role ?? '').trim().toLowerCase())
const canEdit = computed(() => auth.hasPermission('reestr.write'))
const canDecide = computed(() => auth.hasPermission('packages.manage') && canEdit.value)
const canFiles = computed(() => !!pkg.value && canModifyFiles({
  role: role.value, canReview: auth.hasPermission('packages.manage'), status: pkg.value.status,
}))

// ---- Клиенты партий: компания, если известна (список клиентов, право clients.read), иначе логин ----
const companies = ref(new Map<string, string>())
const clientLabel = (name: string): string => companies.value.get(name.trim().toLowerCase()) ?? name.trim()
onMounted(async () => {
  if (role.value === 'client' || !auth.hasPermission('clients.read')) return
  try {
    const list = await clientsOnboardingApi.list({ silent: true })
    companies.value = new Map(list
      .filter((c) => c.companyName?.trim())
      .map((c) => [c.username.trim().toLowerCase(), c.companyName!.trim()]))
  } catch {
    // компания — только подпись: без неё остаётся логин
  }
})

// ---- Телефон: перетаскивания нет, только «Привязать к…» ----
const PHONE = '(max-width: 639px)'
const phone = ref(false)
let mql: MediaQueryList | null = null
const onMedia = () => { phone.value = !!mql?.matches }
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  mql = window.matchMedia(PHONE)
  onMedia()
  mql.addEventListener?.('change', onMedia)
})
onBeforeUnmount(() => mql?.removeEventListener?.('change', onMedia))

// ---- Привязка ----
const link = async (file: DocumentPackageFileDto, to: LinkTarget) => {
  if (!canEdit.value) return
  const ok = await ws.linkFile(file, to)
  if (ok) message.success(t(to.kind === 'none' ? 'broker.packageWorkspace.files.unlinked' : 'broker.packageWorkspace.files.linked'))
}
const dnd = provideWorkspaceDnd(computed(() => canEdit.value && !phone.value), (file, to) => { void link(file, to) })
const bgListeners = computed(() => (dnd.enabled.value ? dnd.target('none', { kind: 'none' }) : {}))
const overBackground = computed(() => dnd.over.value === 'none' && !!dnd.dragging.value)

const linkOpen = ref(false)
const linkTarget = shallowRef<DocumentPackageFileDto | null>(null)
const openLink = (f: DocumentPackageFileDto) => {
  linkTarget.value = f
  linkOpen.value = true
}
const onLinkSelect = (to: LinkTarget) => {
  const f = linkTarget.value
  if (f) void link(f, to)
}

// ---- Файлы ----
const previewOpen = ref(false)
const previewFile = shallowRef<DocumentPackageFileDto | null>(null)
const openPreview = (f: DocumentPackageFileDto) => {
  previewFile.value = f
  previewOpen.value = true
}
const download = async (f: DocumentPackageFileDto) => {
  try {
    saveBlob(await documentPackagesApi.downloadFile(id.value, f.id), f.originalFileName)
  } catch {
    // тост показал перехватчик
  }
}
const removeFile = async (f: DocumentPackageFileDto) => {
  if (!canFiles.value) return
  const ok = await confirm({
    title: t('broker.packageWorkspace.files.deleteTitle', { name: f.originalFileName }),
    content: t('broker.packageWorkspace.files.deleteText'),
    okText: t('broker.packageWorkspace.files.deleteOk'),
    cancelText: t('transit.otmena'),
    danger: true,
  })
  if (!ok) return
  if (await ws.deleteFile(f)) message.success(t('broker.packageWorkspace.files.deleted'))
}
const upload = async (files: File[]) => {
  if (!canFiles.value || !files.length) return
  const r = await ws.uploadFiles(files)
  // Ни один не принят — каждую причину уже показал перехватчик, итог не нужен.
  if (!r || r.done === 0) return
  const text = t('broker.packageWorkspace.files.uploaded', { n: r.done, m: r.total })
  if (r.done === r.total) message.success(text)
  else message.warning(text)
}

// ---- Контейнеры и партии ----
const containerOpen = ref(false)
const editing = shallowRef<DocumentPackageContainerDto | null>(null)
const openContainer = (c: DocumentPackageContainerDto | null) => {
  editing.value = c
  containerOpen.value = true
}
const containerSaving = computed(() => isPending(editing.value ? `container:${editing.value.id}` : 'container:new'))
const saveContainer = async (data: ContainerInput) => {
  const c = editing.value
  if (!(await ws.saveContainer(c, data))) return // окно остаётся открытым
  containerOpen.value = false
  message.success(t(c ? 'broker.packageWorkspace.container.saved' : 'broker.packageWorkspace.container.added'))
}
const deleteContainer = async (c: DocumentPackageContainerDto) => {
  const ok = await confirm({
    title: t('broker.packageWorkspace.container.deleteTitle'),
    content: t('broker.packageWorkspace.container.deleteText'),
    okText: t('broker.packageWorkspace.container.deleteOk'),
    cancelText: t('transit.otmena'),
    danger: true,
  })
  if (!ok) return
  if (await ws.deleteContainer(c.id)) message.success(t('broker.packageWorkspace.container.deleted'))
}
const containerBusy = (c: DocumentPackageContainerDto) => isPending(`container:${c.id}`) || isPending(`container-delete:${c.id}`)

const partiaName = (c: DocumentPackageContainerDto, pid: string) => {
  const p = c.consolidations.find((x) => x.id === pid)
  return p?.clientName?.trim() ? clientLabel(p.clientName) : t('broker.packageWorkspace.partia.noClient')
}
const deletePartia = async (c: DocumentPackageContainerDto, pid: string) => {
  const ok = await confirm({
    title: t('broker.packageWorkspace.partia.deleteTitle', { name: partiaName(c, pid) }),
    content: t('broker.packageWorkspace.partia.deleteText'),
    okText: t('broker.packageWorkspace.partia.deleteOk'),
    cancelText: t('transit.otmena'),
    danger: true,
  })
  if (!ok) return
  if (await ws.deletePartia(c.id, pid)) message.success(t('broker.packageWorkspace.partia.deleted'))
}
const openPartia = (pid: string) => { void router.push(`/document-packages/${id.value}/partia/${pid}`) }
const addPartia = (c: DocumentPackageContainerDto) => {
  void router.push({ path: `/document-packages/${id.value}/partia/new`, query: { container: c.id } })
}

// ---- Решение и строки реестра ----
const statusOpen = ref(false)
const onStatusChanged = (d: DocumentPackageDto) => ws.apply(d)
const generating = computed(() => isPending('generate'))
const generate = async () => {
  const p = pkg.value
  if (!p || !canEdit.value) return
  const n = packageCounts(p).partias
  const ok = await confirm({
    title: t(`broker.packageWorkspace.generateConfirm.${pluralForm(n, locale.value)}`, { n }),
    content: t('broker.packageWorkspace.generateConfirmText'),
    okText: t('broker.packageWorkspace.generateOk'),
    cancelText: t('transit.otmena'),
  })
  if (!ok) return
  const created = await ws.generateRows()
  if (created === null) return
  if (created > 0) {
    message.success(t('broker.packageWorkspace.generated', { n: created }))
    await router.push('/reestr')
  } else {
    message.info(t('broker.packageWorkspace.generatedNone'))
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-[18px]" data-ws-page>
    <div v-if="loading" class="flex flex-col gap-[18px]" aria-busy="true" data-ws-skeleton>
      <div class="flex flex-col gap-2.5">
        <ZSkeleton width="200px" height="13px" />
        <ZSkeleton width="min(280px, 80%)" height="28px" />
        <ZSkeleton width="min(460px, 90%)" height="14px" />
      </div>
      <div class="grid gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <ZSkeleton :lines="6" height="44px" />
        <div class="flex flex-col gap-3">
          <ZSkeleton height="150px" />
          <ZSkeleton height="110px" />
        </div>
      </div>
    </div>

    <div v-else-if="notFound" class="rounded-panel border border-dashed border-line-strong" data-ws-not-found>
      <ZEmpty :title="t('broker.packageWorkspace.page.notFound')" :hint="t('broker.packageWorkspace.page.notFoundHint')">
        <template #action>
          <RouterLink
            to="/document-packages"
            class="inline-flex h-10 items-center rounded-row bg-navy px-4 text-sm font-semibold text-white no-underline outline-hidden hover:bg-navy-hover focus-visible:shadow-focus max-sm:h-11"
          >{{ t('broker.packageWorkspace.page.toList') }}</RouterLink>
        </template>
      </ZEmpty>
    </div>

    <div v-else-if="loadError" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-ws-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.packageWorkspace.page.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-ws-retry @click="ws.load()">{{ t('broker.packageWorkspace.page.retry') }}</ZButton>
    </div>

    <template v-else-if="pkg">
      <WorkspaceHeader
        :pkg="pkg"
        :can-decide="canDecide"
        :can-generate="canEdit"
        :generating="generating"
        @decide="statusOpen = true"
        @generate="generate"
      />

      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <FilesPanel
          :pkg="pkg"
          :can-link="canEdit"
          :can-upload="canFiles"
          :can-delete="canFiles"
          :uploading="isPending('upload')"
          :is-pending="isPending"
          :client-label="clientLabel"
          class="lg:sticky lg:top-[calc(var(--shell-header-h,64px)+16px)] lg:max-h-[calc(100vh-var(--shell-header-h,64px)-32px)] lg:overflow-y-auto"
          @preview="openPreview"
          @link="openLink"
          @download="download"
          @delete="removeFile"
          @upload="upload"
        />

        <div
          class="flex min-w-0 flex-col gap-3 rounded-panel transition-[box-shadow] duration-150 motion-reduce:transition-none"
          :class="overBackground && 'shadow-[0_0_0_2px_var(--color-zircon)]'"
          :aria-label="t('broker.packageWorkspace.container.listLabel')"
          role="region"
          data-ws-tree
          v-on="bgListeners"
        >
          <p v-if="overBackground && dnd.dragging.value" class="m-0 rounded-row bg-zircon-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-zircon-ink" role="status" data-ws-drop-hint>
            {{ t('broker.packageWorkspace.drop.none', { name: dnd.dragging.value.originalFileName }) }}
          </p>
          <ContainerCard
            v-for="c in pkg.containers"
            :key="c.id"
            :pkg="pkg"
            :container="c"
            :can-edit="canEdit"
            :busy="containerBusy(c)"
            :is-pending="isPending"
            :client-label="clientLabel"
            @add-partia="addPartia(c)"
            @edit="openContainer(c)"
            @delete="deleteContainer(c)"
            @preview="openPreview"
            @open-partia="openPartia"
            @delete-partia="deletePartia(c, $event)"
          />
          <div v-if="!pkg.containers.length" class="rounded-panel border border-dashed border-line-strong" data-ws-no-containers>
            <ZEmpty :title="t('broker.packageWorkspace.container.empty')" :hint="canEdit ? t('broker.packageWorkspace.container.emptyHint') : undefined" />
          </div>
          <button
            v-if="canEdit"
            type="button"
            class="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-panel border border-dashed border-line-strong bg-transparent font-sans text-[13.5px] font-semibold text-ink-2 outline-hidden hover:border-faint hover:bg-surface hover:text-ink focus-visible:shadow-focus"
            data-ws-add-container
            @click="openContainer(null)"
          >
            <PhPlus :size="15" weight="bold" aria-hidden="true" />{{ t('broker.packageWorkspace.container.add') }}
          </button>
        </div>
      </div>

      <LinkMenu v-if="canEdit" v-model:open="linkOpen" :pkg="pkg" :file="linkTarget" :client-label="clientLabel" @select="onLinkSelect" />
      <FilePreviewDrawer v-model:open="previewOpen" :pkg-id="pkg.id" :file="previewFile" />
      <ContainerModal v-if="canEdit" v-model:open="containerOpen" :container="editing" :saving="containerSaving" @submit="saveContainer" />
      <PackageStatusModal v-if="canDecide" v-model:open="statusOpen" :pkg="pkg" @changed="onStatusChanged" />
    </template>
  </div>
</template>
