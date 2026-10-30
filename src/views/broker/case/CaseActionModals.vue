<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { Import40Action, Import40CaseDto } from '@/api/import40'
import ReturnToClientModal from './ReturnToClientModal.vue'
import type { CaseActions, ReasonKind } from './useCaseActions'

// Общее окно «причины» (тексты — прежние import40Case.*): проблема (заметка обязательна + сообщение клиенту),
// шаг назад, отмена, возврат клиенту, завершение без счёта AQNIET. Тело действия — как раньше:
// value — причина (возврат и заметка проблемы — как введены, остальные — без пробелов по краям);
// у проблемы clientMessage — без пробелов по краям или null. Окно закрывается после успеха; при ошибке остаётся.
// Возврат клиенту (17.10) — своё окно ReturnToClientModal: чек-лист документов, подсказки нетарифных мер, комментарий.
const props = defineProps<{ kind: ReasonKind | null; actions: CaseActions; kase?: Import40CaseDto | null }>()
const emit = defineEmits<{ 'update:kind': [kind: ReasonKind | null] }>()
const { t } = useI18n()

interface Conf { action: Import40Action; title: string; ok: string; hint?: string; ph: string; danger?: boolean; trim: boolean }
const CONF: Record<ReasonKind, Conf> = {
  problem: { action: 'set-problem', title: 'import40Case.problemBtn', ok: 'import40Case.problemOk', ph: 'import40Case.problemPh', trim: false },
  stepBack: { action: 'step-back', title: 'import40Case.stepBackTitle', ok: 'import40Case.stepBackOk', hint: 'import40Case.stepBackHint', ph: 'import40Case.stepBackPh', trim: true },
  cancel: { action: 'cancel', title: 'import40Case.cancelTitle', ok: 'import40Case.cancelOk', hint: 'import40Case.cancelHint', ph: 'import40Case.cancelPh', danger: true, trim: true },
  return: { action: 'return-to-client', title: 'import40Case.returnTitle', ok: 'import40Case.returnOk', ph: 'import40Case.returnPh', trim: false },
  completeWithoutInvoice: {
    action: 'complete-without-invoice', title: 'import40Case.completeWithoutInvoice', ok: 'import40Case.completeWithoutInvoiceOk',
    hint: 'import40Case.completeWithoutInvoiceHint', ph: 'import40Case.completeWithoutInvoicePh', danger: true, trim: true,
  },
}

// Последний открытый вид остаётся, пока окно закрывается (анимация), — без мигания текста.
const shown = ref<ReasonKind>('problem')
const reason = ref('')
const clientMessage = ref('')
watch(() => props.kind, (k) => {
  if (!k) return
  shown.value = k
  reason.value = ''
  clientMessage.value = ''
}, { immediate: true })

const conf = computed(() => CONF[shown.value])
const pending = computed(() => props.actions.isPending(conf.value.action))
const close = () => { if (!pending.value) emit('update:kind', null) }

// S-29 (30.10.2026): «Шаг назад» с «На границе» возвращает заявку клиенту в черновик — без причины для клиента и пунктов
// доработки. Предупреждаем и предлагаем «Вернуть клиенту» (с причиной и чек-листом) вместо молчаливого возврата.
const stepBackToDraft = computed(() => shown.value === 'stepBack' && props.kase?.status === 1)
const switchToReturn = () => { if (!pending.value) emit('update:kind', 'return') }

const submit = async () => {
  if (!reason.value.trim() || props.actions.busy()) return
  const c = conf.value
  const value = c.trim ? reason.value.trim() : reason.value
  const extra = shown.value === 'problem' ? { clientMessage: clientMessage.value.trim() || null } : undefined
  const ok = await props.actions.run(c.action, { value, extra })
  if (ok && props.kind === shown.value) emit('update:kind', null)
}
</script>

<template>
  <ReturnToClientModal
    :open="kind === 'return'"
    :kase="kase ?? null"
    :actions="actions"
    @update:open="(v: boolean) => { if (!v) emit('update:kind', null) }"
  />
  <ZModal
    :open="kind !== null && kind !== 'return'"
    :title="t(conf.title)"
    :ok-text="t(conf.ok)"
    :cancel-text="t('common.cancel')"
    :confirm-loading="pending"
    :ok-button-props="{ disabled: !reason.trim(), danger: conf.danger }"
    :cancel-button-props="{ disabled: pending }"
    :data-reason-modal="shown"
    @update:open="(v: boolean) => { if (!v) close() }"
    @ok="submit"
  >
    <p v-if="conf.hint" class="m-0 mb-3 text-sm text-ink-3">{{ t(conf.hint) }}</p>
    <ZAlert v-if="stepBackToDraft" type="warning" show-icon class="mb-3" data-stepback-draft-warning>
      <div class="flex flex-col items-start gap-2">
        <span>{{ t('import40Case.stepBackToDraftWarning') }}</span>
        <ZButton size="sm" data-stepback-to-return @click="switchToReturn">{{ t('import40Case.stepBackUseReturn') }}</ZButton>
      </div>
    </ZAlert>
    <div class="flex flex-col gap-4">
      <ZField :label="shown === 'problem' ? t('import40Case.problemNoteLabel') : undefined" :required="shown === 'problem'">
        <ZTextarea
          v-model:value="reason"
          :rows="3"
          :placeholder="t(conf.ph)"
          :aria-label="shown === 'problem' ? undefined : t(conf.ph)"
          data-reason-input
        />
      </ZField>
      <ZField v-if="shown === 'problem'" :label="t('import40Case.problemClientMessageLabel')">
        <ZTextarea v-model:value="clientMessage" :rows="3" :placeholder="t('import40Case.problemClientMessagePh')" data-reason-client />
      </ZField>
    </div>
  </ZModal>
</template>
