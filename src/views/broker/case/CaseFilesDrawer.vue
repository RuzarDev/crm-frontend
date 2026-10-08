<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhFile } from '@phosphor-icons/vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import { import40Api, type Import40FileDto } from '@/api/import40'
import { saveBlob } from '@/ui/download'
import { formatFileSize, formatStamp } from '@/views/broker/packages/packages'
import { groupFiles, roleLabel, sectionLabelKey } from './caseFormat'

// «Все файлы» заявки по разделам: имя, размер, кто загрузил, когда; скачивание каждого.
const props = defineProps<{ open: boolean; caseId: string; files: Import40FileDto[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()

const groups = computed(() => groupFiles(props.files))
const who = (f: Import40FileDto) =>
  f.uploadedByStaffName ? t('import40Case.uploadedByStaff', { name: f.uploadedByStaffName }) : roleLabel(f.uploadedByBusinessRole, t)

const downloading = ref<string | null>(null)
const download = async (f: Import40FileDto) => {
  if (downloading.value) return
  downloading.value = f.id
  try {
    saveBlob(await import40Api.downloadFile(props.caseId, f.id), f.originalFileName)
  } catch {
    // тост показал перехватчик
  } finally {
    downloading.value = null
  }
}
const iconBtn = 'inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:size-11'
</script>

<template>
  <ZDrawer :open="open" :width="460" :title="t('broker.case.files.drawerTitle')" data-case-files-drawer @update:open="emit('update:open', $event)">
    <div class="flex flex-col gap-5">
      <section v-for="g in groups" :key="g.key" :aria-labelledby="`case-files-${g.key}`" :data-files-section="g.key">
        <h3 :id="`case-files-${g.key}`" class="m-0 mb-1 text-sm font-semibold text-ink">
          {{ t(sectionLabelKey(g.key)) }} <span class="font-medium tabular-nums text-muted">{{ g.files.length }}</span>
        </h3>
        <p v-if="!g.files.length" class="m-0 border-t border-line py-2.5 text-sm text-muted">{{ t('broker.case.files.sectionEmpty') }}</p>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="f in g.files" :key="f.id" class="flex items-center gap-2.5 border-t border-line py-2" data-file-row>
            <PhFile :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium text-ink" :title="f.originalFileName">{{ f.originalFileName }}</div>
              <div class="text-xs tabular-nums text-muted">{{ [formatFileSize(f.sizeBytes, t), who(f), formatStamp(f.createdAtUtc)].filter(Boolean).join(' · ') }}</div>
            </div>
            <button
              type="button"
              :class="iconBtn"
              :disabled="downloading !== null"
              :aria-busy="downloading === f.id || undefined"
              :aria-label="t('broker.case.files.download', { name: f.originalFileName })"
              :title="t('broker.case.files.download', { name: f.originalFileName })"
              data-file-download
              @click="download(f)"
            >
              <PhDownloadSimple :size="16" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </ZDrawer>
</template>
