<script setup lang="ts">
import { ref } from 'vue'
import { PhPaperclip } from '@phosphor-icons/vue'
import { import40ContractApi } from '@/api/import40Contract'
import { saveBlob } from '@/ui/download'

// Файлы подписи договора или доверенности: ссылки на скачивание (окно документов, вкладка «Документы» карточки клиента,
// «Компания клиента»). Ошибку скачивания показывает общий перехватчик.
const props = defineProps<{ clientId: string; docId: string; files: { id: string; originalFileName: string }[] }>()

const downloading = ref<string | null>(null)
const download = async (f: { id: string; originalFileName: string }) => {
  if (downloading.value) return
  downloading.value = f.id
  try {
    saveBlob(await import40ContractApi.downloadDocumentSignedFile(props.clientId, props.docId, f.id), f.originalFileName)
  } catch {
    // тост показал общий перехватчик
  } finally {
    downloading.value = null
  }
}
const fileLink = 'inline-flex max-w-full min-h-8 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-1 text-left font-sans text-sm text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 max-sm:min-h-11'
</script>

<template>
  <div class="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1" data-doc-files>
    <button
      v-for="f in files"
      :key="f.id"
      type="button"
      :class="fileLink"
      :disabled="downloading !== null"
      data-doc-file
      @click="download(f)"
    >
      <PhPaperclip :size="14" class="shrink-0" aria-hidden="true" />
      <span class="truncate" :title="f.originalFileName">{{ f.originalFileName }}</span>
    </button>
  </div>
</template>
