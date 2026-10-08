<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhFile, PhX } from '@phosphor-icons/vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import ZUpload from '@/components/z/ZUpload.vue'
import { documentPackagesApi } from '@/api/documentPackages'
import type { DocumentPackageDto } from '@/types/api'
import { formatFileSize, parseContainerNumbers } from './packages'

// Окно «Новый пакет документов»: поезд, комментарий, номера контейнеров (по одному в строке), файлы.
// Создание — пакет, затем файлы по одному. Пакет создаётся один раз: если файл не загрузился, окно всё равно
// закрывается (created с числом неудач) — повторное «Создать» сделало бы дубль, а недостающее добавляют в панели пакета.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; created: [pkg: DocumentPackageDto, failedFiles: number] }>()
const { t } = useI18n()

const draft = reactive({ train: '', comment: '', containers: '' })
const files = ref<File[]>([])
const trainTouched = ref(false)
const creating = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  draft.train = ''
  draft.comment = ''
  draft.containers = ''
  files.value = []
  trainTouched.value = false
}, { immediate: true })

const trainError = computed(() => (trainTouched.value && !draft.train.trim() ? t('transit.ukazhiteNomerPoezdaSostava') : ''))

// Один и тот же файл (имя и размер) дважды не добавляем.
const addFiles = (picked: File[]) => {
  const next = [...files.value]
  for (const f of picked) {
    if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f)
  }
  files.value = next
}
const removeFile = (i: number) => { files.value = files.value.filter((_, idx) => idx !== i) }

const submit = async () => {
  trainTouched.value = true
  if (!draft.train.trim() || creating.value) return
  creating.value = true
  try {
    const created = await documentPackagesApi.create({
      trainNumber: draft.train.trim(),
      comment: draft.comment.trim() || null,
      containerNumbers: parseContainerNumbers(draft.containers),
    })
    let failed = 0
    for (const f of files.value) {
      try {
        await documentPackagesApi.uploadFile(created.id, f)
      } catch {
        failed++ // тост ошибки показал перехватчик; остальные файлы всё равно пробуем
      }
    }
    emit('update:open', false)
    emit('created', created, failed)
  } catch {
    // Пакет не создан: текст ошибки показал общий перехватчик, окно остаётся открытым.
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('transit.novyyPaketDokumentov')"
    :width="520"
    :ok-text="t('transit.sozdat')"
    :cancel-text="t('transit.otmena')"
    :confirm-loading="creating"
    data-create-package
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 pb-2">
      <ZField :label="t('transit.nomerPoezdaSostava')" required :error="trainError">
        <ZInput
          :value="draft.train"
          :placeholder="t('broker.packages.trainPh')"
          data-create-train
          @update:value="draft.train = $event"
          @blur="trainTouched = true"
          @press-enter="submit"
        />
      </ZField>
      <ZField :label="`${t('transit.kommentariy')} (${t('transit.neobyazatelno').toLowerCase()})`">
        <ZTextarea :value="draft.comment" :rows="2" data-create-comment @update:value="draft.comment = $event" />
      </ZField>
      <ZField :label="t('transit.nomeraKonteynerovChernovik')">
        <ZTextarea
          :value="draft.containers"
          :rows="3"
          :placeholder="t('transit.vvediteNomeraKonteynerovKazhdyy')"
          class="font-mono"
          data-create-containers
          @update:value="draft.containers = $event"
        />
      </ZField>
      <ZField :label="t('broker.packages.create.files')" :extra="t('broker.packages.create.filesHint')">
        <div class="flex flex-col gap-2">
          <ZUpload
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
            :max-size-mb="25"
            data-create-upload
            @select="addFiles"
          >{{ t('broker.packages.create.addFiles') }}</ZUpload>
          <ul v-if="files.length" class="m-0 flex list-none flex-col gap-1 p-0" data-create-files>
            <li v-for="(f, i) in files" :key="`${f.name}-${f.size}`" class="flex items-center gap-2 text-sm text-ink-2">
              <PhFile :size="16" class="shrink-0 text-ink-3" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate" :title="f.name">{{ f.name }}</span>
              <span class="shrink-0 text-xs tabular-nums text-muted">{{ formatFileSize(f.size, t) }}</span>
              <button
                type="button"
                class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus"
                :aria-label="t('broker.packages.create.removeFile', { name: f.name })"
                data-create-file-remove
                @click="removeFile(i)"
              >
                <PhX :size="14" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>
      </ZField>
    </div>
  </ZModal>
</template>
