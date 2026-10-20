<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCopy, PhDownloadSimple, PhTranslate } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZSpin from '@/components/z/ZSpin.vue'
import { translationApi, type FileTranslation } from '@/api/preBorder'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import { cn } from '@/ui/cn'

// «Перевести (ИИ)» у файла заявки (очередь 4, задача 1): китайский или английский документ — на русский. Перевод
// сохраняется рядом с файлом: уже переведённый открывается без модели. Скан без текста — честный отказ сервера
// («нужен текстовый PDF или фото с распознаванием»), его текст и показываем — ничего не додумываем.
const props = withDefaults(defineProps<{
  caseId: string
  fileId: string
  fileName: string
  /** Перевод уже есть (GET import40/{case}/translations). */
  translated?: boolean
  /** icon — квадратная кнопка со значком (списки файлов сотрудника), text — ссылка-текст. */
  variant?: 'icon' | 'text'
}>(), { translated: false, variant: 'text' })
const emit = defineEmits<{ translated: [fileId: string] }>()
const { t } = useI18n()

const open = ref(false)
const busy = ref(false)
const result = shallowRef<FileTranslation | null>(null)
const error = ref('')

const run = async (force: boolean) => {
  busy.value = true
  error.value = ''
  try {
    result.value = !force && props.translated
      ? await translationApi.get(props.caseId, props.fileId).catch(() => translationApi.translate(props.caseId, props.fileId))
      : await translationApi.translate(props.caseId, props.fileId, force)
    emit('translated', props.fileId)
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: { error?: string } } })?.response
    error.value = res?.data?.error || (res ? t('translate.failed') : t('translate.network'))
  } finally {
    busy.value = false
  }
}
const start = () => {
  open.value = true
  if (!result.value) void run(false)
}

const langName = computed(() => (result.value ? t(`translate.lang.${result.value.sourceLanguage}`) : ''))
const copy = async () => {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value.text)
    message.success(t('translate.copied'))
  } catch {
    message.error(t('translate.copyFailed'))
  }
}
const download = () => {
  if (!result.value) return
  const base = props.fileName.replace(/\.[^.]+$/, '')
  saveBlob(new Blob([result.value.text], { type: 'text/plain;charset=utf-8' }), `${base}.ru.txt`)
}

const label = computed(() => (props.translated ? t('translate.open') : t('translate.action')))
</script>

<template>
  <button
    v-if="variant === 'icon'"
    type="button"
    class="inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus max-sm:size-11"
    :class="translated ? 'text-zircon-ink' : ''"
    :aria-label="`${label}: ${fileName}`"
    :title="label"
    data-file-translate
    @click="start"
  ><PhTranslate :size="16" aria-hidden="true" /></button>
  <button
    v-else
    type="button"
    :class="cn('inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-field border-0 bg-transparent px-1 font-sans text-[12.5px] font-medium text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-8')"
    :aria-label="`${label}: ${fileName}`"
    data-file-translate
    @click="start"
  ><PhTranslate :size="14" aria-hidden="true" />{{ label }}</button>

  <ZModal v-model:open="open" :title="t('translate.title', { name: fileName })" :footer="null" :width="720" data-translate-modal>
    <div class="flex flex-col gap-3 pb-2">
      <div v-if="busy" class="flex items-center gap-3 py-6 text-sm text-ink-2" aria-busy="true" data-translate-busy>
        <ZSpin /> {{ t('translate.busy') }}
      </div>
      <div v-else-if="error" class="flex flex-col gap-3" data-translate-error>
        <p class="m-0 rounded-row bg-gold-soft px-3 py-2.5 text-sm text-ink" role="alert">{{ error }}</p>
        <ZButton size="sm" class="self-start max-sm:h-11" @click="run(false)">{{ t('translate.retry') }}</ZButton>
      </div>
      <template v-else-if="result">
        <p class="m-0 text-xs text-muted" data-translate-meta>
          {{ t('translate.meta', { lang: langName }) }}<template v-if="result.truncated"> · <b class="font-semibold text-gold-ink">{{ t('translate.truncated') }}</b></template>
        </p>
        <pre class="m-0 max-h-[55vh] overflow-auto rounded-row bg-sunken px-3 py-2.5 font-sans text-sm whitespace-pre-wrap text-ink [overflow-wrap:anywhere]" data-translate-text>{{ result.text }}</pre>
        <p class="m-0 text-xs text-ink-3">{{ t('translate.disclaimer') }}</p>
        <div class="flex flex-wrap gap-2">
          <ZButton size="sm" class="max-sm:h-11" data-translate-copy @click="copy">
            <template #icon><PhCopy :size="14" aria-hidden="true" /></template>{{ t('translate.copy') }}
          </ZButton>
          <ZButton size="sm" class="max-sm:h-11" data-translate-download @click="download">
            <template #icon><PhDownloadSimple :size="14" aria-hidden="true" /></template>{{ t('translate.download') }}
          </ZButton>
          <ZButton size="sm" variant="ghost" class="max-sm:h-11" data-translate-again @click="run(true)">{{ t('translate.again') }}</ZButton>
        </div>
      </template>
    </div>
  </ZModal>
</template>
