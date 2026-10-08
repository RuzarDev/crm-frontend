<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhPaperclip } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZTag from '@/components/z/ZTag.vue'
import { import40ContractApi, type Import40DocumentDto, type Import40DocumentFileDto } from '@/api/import40Contract'
import type { ClientOnboardingRow } from '@/api/clientsOnboarding'
import { saveBlob } from '@/ui/download'
import { formatDay } from '@/views/broker/list'
import { blankFileName, clientName, docKindLabelKey, docStatusLabelKey, docStatusTone, signMethodLabelKey } from './clients'

// Документы клиента (договор и доверенность): статус, подписи сторон, бланк и подписанные файлы. Открывают только
// те, у кого есть import40.read, — иначе сервер отвечает 403 (проверяет родитель). Бланк сервер собирает по данным
// клиента на момент запроса. Ошибка загрузки — на месте, с «Повторить»; ошибки скачивания показывает перехватчик.
const props = defineProps<{ open: boolean; client: ClientOnboardingRow | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { t } = useI18n()

const docs = shallowRef<Import40DocumentDto[]>([])
const loading = ref(false)
const failed = ref(false)
let seq = 0
const load = async (clientId: string) => {
  const my = ++seq
  loading.value = true
  failed.value = false
  try {
    const res = await import40ContractApi.listDocuments(clientId, undefined, { silent: true })
    if (my === seq) docs.value = res
  } catch {
    if (my === seq) failed.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => [props.open, props.client?.id] as const, ([open, id]) => {
  if (!open || !id) return
  docs.value = []
  void load(id)
}, { immediate: true })

const kindLabel = (d: Import40DocumentDto) => t(docKindLabelKey(d.kind))
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now()
const signText = (signed: boolean, at: string | null, method: string | null) =>
  signed ? t('broker.clients.docs.signed', { date: formatDay(at), method: t(signMethodLabelKey(method)) }) : t('admin.netPodpisi')

// ---- Скачивание ----
const downloading = ref<string | null>(null)
const run = async (key: string, job: () => Promise<void>) => {
  if (downloading.value) return
  downloading.value = key
  try {
    await job()
  } catch {
    // тост показал общий перехватчик
  } finally {
    downloading.value = null
  }
}
const downloadBlank = (d: Import40DocumentDto) => {
  const c = props.client
  if (!c) return Promise.resolve()
  return run(d.id, async () => saveBlob(await import40ContractApi.downloadDocument(c.id, d.id), blankFileName(kindLabel(d), d)))
}
const downloadSigned = (d: Import40DocumentDto, f: Import40DocumentFileDto) => {
  const c = props.client
  if (!c) return Promise.resolve()
  return run(f.id, async () => saveBlob(await import40ContractApi.downloadDocumentSignedFile(c.id, d.id, f.id), f.originalFileName))
}
const fileLink = 'inline-flex max-w-full min-h-8 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-1 text-left font-sans text-sm text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:min-h-11'
</script>

<template>
  <ZDrawer :open="open" :width="560" data-client-docs-drawer @update:open="emit('update:open', $event)">
    <template #title>
      <span class="block text-lg leading-6">{{ t('broker.clients.docs.title') }}</span>
      <span v-if="client" class="block text-sm font-normal text-muted [overflow-wrap:anywhere]" data-docs-client>{{ clientName(client) }}</span>
    </template>

    <div v-if="failed" class="flex flex-wrap items-center gap-3 rounded-row bg-sunken px-3.5 py-3" data-docs-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('broker.clients.docs.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" data-docs-retry @click="client && load(client.id)">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <ZSkeleton v-else-if="loading" :lines="3" height="96px" data-docs-skeleton />
    <ZEmpty v-else-if="!docs.length" :title="t('admin.uKlientaPokaNetDokumentov')" data-docs-empty />
    <ul v-else class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="d in docs" :key="d.id" class="flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-4" data-doc-card>
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div class="min-w-0">
            <div class="text-base font-semibold text-ink" data-doc-title>{{ t('broker.clients.docs.number', { kind: kindLabel(d), number: d.number, year: d.year }) }}</div>
            <div class="text-xs text-muted">{{ t('admin.sformirovanDate', { date: formatDay(d.generatedAtUtc) }) }}</div>
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ZTag :tone="docStatusTone(d.status)" data-doc-status>{{ t(docStatusLabelKey(d.status)) }}</ZTag>
            <span
              v-if="d.validUntilUtc"
              :class="['text-xs', isExpired(d.validUntilUtc) ? 'text-tone-danger-fg' : 'text-muted']"
              data-doc-until
            >{{ t('admin.doDate', { date: formatDay(d.validUntilUtc) }) }}</span>
            <ZTag v-if="d.isSingleUse" tone="accent" data-doc-single>{{ t('admin.razovyy') }}</ZTag>
          </div>
        </div>
        <div class="flex flex-col gap-0.5 text-sm text-ink-2">
          <div data-sign-client>{{ t('broker.clients.docs.clientSign', { value: signText(d.clientSigned, d.clientSignedAtUtc, d.clientSignMethod) }) }}</div>
          <div v-if="d.kind === 'contract'" data-sign-provider>{{ t('broker.clients.docs.providerSign', { value: signText(d.providerSigned, d.providerSignedAtUtc, d.providerSignMethod) }) }}</div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ZButton size="sm" :loading="downloading === d.id" :disabled="downloading !== null && downloading !== d.id" class="max-sm:h-11" data-doc-blank @click="downloadBlank(d)">
            <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
            {{ t('admin.skachatBlank') }}
          </ZButton>
          <button
            v-for="f in d.files"
            :key="f.id"
            type="button"
            :class="fileLink"
            :disabled="downloading !== null"
            data-doc-file
            @click="downloadSigned(d, f)"
          >
            <PhPaperclip :size="14" class="shrink-0" aria-hidden="true" />
            <span class="truncate" :title="f.originalFileName">{{ f.originalFileName }}</span>
          </button>
          <span v-if="!d.files.length" class="text-sm text-muted">{{ t('admin.podpisannyhFaylovNet') }}</span>
        </div>
      </li>
    </ul>
  </ZDrawer>
</template>
