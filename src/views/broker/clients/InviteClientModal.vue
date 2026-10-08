<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCopy, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZModal from '@/components/z/ZModal.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import { clientsOnboardingApi, type InviteClientResponse } from '@/api/clientsOnboarding'
import { useBinLookup } from '@/composables/useBinLookup'
import { useAuthStore } from '@/stores/auth'
import { message } from '@/ui/message'
import { binDigits, isValidEmail } from './clients'

// Окно «Пригласить клиента»: форма → результат со ссылкой (действует 7 дней). Ошибки сервера показывает общий перехватчик,
// окно при этом остаётся открытым. reissue — строка списка для «Новой ссылки»: форма заполняется её данными и приглашение
// отправляется сразу (подтверждение спросил родитель).
export interface InviteReissue { email: string; bin: string; companyName: string; phone: string }

const props = defineProps<{ open: boolean; reissue?: InviteReissue | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; invited: [res: InviteClientResponse] }>()

const { t } = useI18n()
const auth = useAuthStore()
const { loading: binLoading, lookup } = useBinLookup()

type Service = 'import40' | 'transit'
// Аудит §4.14: экспедитор по умолчанию приглашает для транзита, остальные — «Импорт 40».
const defaultService = (): Service => ((auth.role ?? '').trim().toLowerCase() === 'expeditor' ? 'transit' : 'import40')
const draft = reactive({ email: '', bin: '', companyName: '', phone: '', service: defaultService() as Service })
const result = ref<InviteClientResponse | null>(null)
const sending = ref(false)
const emailTouched = ref(false)
const binTouched = ref(false)

const reset = () => {
  draft.email = ''
  draft.bin = ''
  draft.companyName = ''
  draft.phone = ''
  draft.service = defaultService()
  result.value = null
  emailTouched.value = false
  binTouched.value = false
}

const emailError = computed(() => (emailTouched.value && draft.email.trim() && !isValidEmail(draft.email) ? t('broker.clients.inviteModal.emailInvalid') : ''))
const binReady = computed(() => binDigits(draft.bin).length === 12)
const binError = computed(() => (binTouched.value && draft.bin && !binReady.value ? t('client.company.form.binInvalid') : ''))
const canSubmit = computed(() => !!draft.email.trim() && binReady.value)

const send = async () => {
  emailTouched.value = true
  binTouched.value = true
  if (sending.value || !canSubmit.value || !isValidEmail(draft.email)) return
  sending.value = true
  try {
    result.value = await clientsOnboardingApi.invite({
      email: draft.email.trim(),
      bin: binDigits(draft.bin),
      companyName: draft.companyName.trim() || null,
      phone: draft.phone.trim() || null,
      service: draft.service,
    })
    emit('invited', result.value)
  } catch {
    // Текст ошибки показал общий перехватчик (api/client.ts) — не дублируем.
  } finally {
    sending.value = false
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  reset()
  const r = props.reissue
  if (r) {
    draft.email = r.email
    draft.bin = r.bin
    draft.companyName = r.companyName
    draft.phone = r.phone
    void send()
  }
}, { immediate: true })

// БИН — только цифры, до 12.
const onBin = async (raw: string) => {
  const digits = binDigits(raw).slice(0, 12)
  // Набрали лишний символ — значение то же, и Vue не перерисует <input>: сдвигаем и возвращаем (как в ZPhone).
  if (digits === draft.bin && raw !== digits) {
    draft.bin = `${digits} `
    await nextTick()
  }
  draft.bin = digits
}
const findByBin = async () => {
  if (!binReady.value) return
  const company = await lookup(binDigits(draft.bin))
  if (company) draft.companyName = company.nameRu ?? company.nameKz ?? draft.companyName
}

const url = computed(() => (result.value ? `${window.location.origin}${result.value.invitePath}` : ''))
const copy = async () => {
  try {
    await navigator.clipboard.writeText(url.value)
    message.success(t('admin.ssylkaSkopirovana'))
  } catch {
    message.warning(t('admin.skopiruyteSsylkuVruchnuyu'))
  }
}

const serviceOptions = computed(() => [
  { value: 'import40', label: t('admin.import40') },
  { value: 'transit', label: t('admin.tranzit') },
])
</script>

<template>
  <ZModal
    :open="open"
    :title="t('broker.clients.inviteButton')"
    :width="520"
    :ok-text="t('admin.sozdatPriglashenie')"
    :cancel-text="t('admin.otmena')"
    :confirm-loading="sending"
    :ok-button-props="{ disabled: !canSubmit }"
    data-invite-modal
    @update:open="emit('update:open', $event)"
    @ok="send"
  >
    <div v-if="result" class="flex flex-col gap-4 pb-2" data-invite-result>
      <ZAlert
        type="success"
        show-icon
        :message="result.reissued ? t('admin.ssylkaPerevypuschena') : t('admin.priglashenieSozdano')"
        :description="t('admin.skopiruyteSsylkuIOtpravte')"
      />
      <div class="flex gap-2">
        <ZInput :value="url" readonly mono :aria-label="t('broker.clients.inviteModal.link')" class="min-w-0 flex-1 max-sm:h-11" data-invite-url />
        <ZButton variant="primary" class="shrink-0 max-sm:h-11" data-invite-copy @click="copy">
          <template #icon><PhCopy :size="16" aria-hidden="true" /></template>
          {{ t('admin.skopirovat') }}
        </ZButton>
      </div>
    </div>
    <div v-else class="flex flex-col gap-4 pb-2" data-invite-form>
      <p class="m-0 text-sm text-ink-3">{{ t('admin.klientPoluchitSsylkuPo') }}</p>
      <ZField :label="t('admin.emailKlienta')" required :error="emailError">
        <ZInput
          :value="draft.email"
          type="email"
          autocomplete="off"
          :placeholder="t('broker.clients.inviteModal.emailPh')"
          class="max-sm:h-11"
          data-invite-email
          @update:value="draft.email = $event"
          @blur="emailTouched = true"
          @press-enter="send"
        />
      </ZField>
      <ZField :label="t('admin.bin')" required :error="binError">
        <div class="flex gap-2">
          <ZInput
            :value="draft.bin"
            mono
            inputmode="numeric"
            autocomplete="off"
            :maxlength="12"
            :placeholder="t('client.company.form.binPh')"
            class="min-w-0 flex-1 max-sm:h-11"
            data-invite-bin
            @update:value="onBin"
            @blur="binTouched = true"
            @press-enter="send"
          />
          <ZButton
            :loading="binLoading"
            :disabled="!binReady"
            :aria-label="t('client.company.form.findLabel')"
            class="shrink-0 max-sm:h-11 max-sm:px-4"
            data-invite-bin-find
            @click="findByBin"
          >
            <template #icon><PhMagnifyingGlass :size="16" aria-hidden="true" /></template>
            {{ t('client.company.form.find') }}
          </ZButton>
        </div>
      </ZField>
      <ZField :label="t('admin.naimenovanieKompanii')">
        <ZInput :value="draft.companyName" :placeholder="t('client.company.form.companyNamePh')" class="max-sm:h-11" data-invite-company @update:value="draft.companyName = $event" />
      </ZField>
      <ZField :label="t('admin.telefon')">
        <ZPhone :value="draft.phone" class="max-sm:h-11" data-invite-phone @update:value="draft.phone = $event" />
      </ZField>
      <ZField :label="t('admin.uslugaDlyaKlienta')">
        <ZSegmented
          :value="draft.service"
          :options="serviceOptions"
          :aria-label="t('admin.uslugaDlyaKlienta')"
          data-invite-service
          @update:value="draft.service = $event as Service"
        />
      </ZField>
    </div>
    <template v-if="result" #footer>
      <ZButton variant="ghost" class="max-sm:h-11" data-invite-again @click="reset">{{ t('admin.priglasitEsche') }}</ZButton>
      <ZButton variant="primary" class="max-sm:h-11" data-invite-close @click="emit('update:open', false)">{{ t('z.close') }}</ZButton>
    </template>
  </ZModal>
</template>
