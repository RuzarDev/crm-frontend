<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZRadioGroup from '@/components/z/ZRadioGroup.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import { documentPackagesApi } from '@/api/documentPackages'
import type { DocumentPackageDto, DocumentPackageStatus } from '@/types/api'
import { message } from '@/ui/message'
import { REVIEW_STATUSES } from './packages'

// Смена статуса пакета проверяющим (packages.manage). Комментарий для экспедитора подставляется текущий:
// сервер при каждой смене статуса перезаписывает его присланным значением, и пустое поле стёрло бы его.
// «Нужно исправить» без комментария не отправляется — экспедитору нечего исправлять. Окно закрывается после
// успеха (changed — родитель обновляет панель и список); при отказе сервера остаётся открытым.
const props = defineProps<{ open: boolean; pkg: DocumentPackageDto | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [pkg: DocumentPackageDto] }>()

const { t } = useI18n()

const status = ref<DocumentPackageStatus | null>(null)
const comment = ref('')
const touched = ref(false)
const saving = ref(false)
watch(() => props.open, (v) => {
  if (!v) return
  // «Загружен» выставить нельзя — тогда выбора нет, пока проверяющий не решит.
  status.value = props.pkg && REVIEW_STATUSES.includes(props.pkg.status) ? props.pkg.status : null
  comment.value = props.pkg?.reviewComment ?? ''
  touched.value = false
}, { immediate: true })

const options = computed(() => REVIEW_STATUSES.map((s) => ({ value: s, label: t(`broker.packages.status.${s}`) })))
const commentMissing = computed(() => status.value === 'needsFix' && !comment.value.trim())
const commentError = computed(() => (commentMissing.value && touched.value ? t('broker.packages.status.commentRequired') : ''))

const save = async () => {
  touched.value = true
  const target = status.value
  const pkg = props.pkg
  if (!target || !pkg || commentMissing.value || saving.value) return
  saving.value = true
  try {
    const updated = await documentPackagesApi.changeStatus(pkg.id, { status: target, reviewComment: comment.value.trim() || null })
    message.success(t('transit.statusObnovlen'))
    emit('changed', updated)
    emit('update:open', false)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts); окно остаётся открытым.
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.packages.status.title')"
    :width="460"
    :ok-text="t('transit.sohranit')"
    :cancel-text="t('transit.otmena')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: status === null }"
    data-package-status-modal
    @update:open="emit('update:open', $event)"
    @ok="save"
  >
    <div class="flex flex-col gap-4 pb-2">
      <ZField :label="t('broker.packages.status.status')">
        <ZRadioGroup
          :value="status"
          :options="options"
          orientation="vertical"
          data-package-status-radio
          @update:value="status = $event as DocumentPackageStatus"
        />
      </ZField>
      <ZField :label="t('broker.packages.status.comment')" :required="status === 'needsFix'" :error="commentError">
        <ZTextarea
          :value="comment"
          :rows="3"
          :placeholder="t('broker.packages.status.commentPh')"
          data-package-status-comment
          @update:value="comment = $event"
          @blur="touched = true"
        />
      </ZField>
    </div>
  </ZModal>
</template>
