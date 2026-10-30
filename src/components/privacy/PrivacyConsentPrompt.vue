<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZModal from '@/components/z/ZModal.vue'
import ZCheckbox from '@/components/z/ZCheckbox.vue'
import { privacyApi } from '@/api/privacy'
import { message } from '@/ui/message'

// Окно согласия для клиентов, зарегистрированных до 30.10.2026 (согласия в учётной записи нет). Решение владельца:
// работу не блокировать — окно можно закрыть («Позже»), но при следующем входе оно появится снова, пока клиент не
// согласится. «Позже» помнится только для текущего входа (ключ сессии) и вкладки — sessionStorage.
// Крестик, «Позже» и Escape — update:open(false) → later().
const PRIVACY_LATER_KEY = 'zircon-privacy-later'

const { t } = useI18n()
const open = ref(false)
const consent = ref(false)
const saving = ref(false)

// Отметка «Позже» привязана к текущему входу: хвост ключа сессии. Новый вход — новый ключ — окно снова.
const sessionMark = () => {
  try { return (localStorage.getItem('authToken') ?? '').slice(-24) } catch { return '' }
}
const postponed = () => {
  try { return sessionStorage.getItem(PRIVACY_LATER_KEY) === sessionMark() } catch { return false }
}

onMounted(async () => {
  if (postponed()) return
  try {
    const status = await privacyApi.status()
    open.value = status.required
  } catch { /* сервер без эндпоинта или сбой — не мешаем работе */ }
})

const later = () => {
  open.value = false
  try { sessionStorage.setItem(PRIVACY_LATER_KEY, sessionMark()) } catch { /* приватный режим */ }
}

const accept = async () => {
  if (!consent.value) return
  saving.value = true
  try {
    await privacyApi.accept()
    open.value = false
    message.success(t('privacy.promptDone'))
  } catch { /* ошибку показал перехватчик axios, окно остаётся */ } finally {
    saving.value = false
  }
}
</script>

<template>
  <ZModal
    :open="open"
    :title="t('privacy.promptTitle')"
    :ok-text="t('privacy.promptAccept')"
    :cancel-text="t('privacy.promptLater')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !consent }"
    :mask-closable="false"
    data-privacy-prompt
    @ok="accept"
    @update:open="(v: boolean) => { if (!v) later() }"
  >
    <div class="flex flex-col gap-4">
      <p class="m-0 text-sm leading-[1.55] text-ink-2">{{ t('privacy.promptText') }}</p>
      <a
        href="/privacy"
        target="_blank"
        rel="noopener"
        class="self-start rounded-[4px] text-sm font-medium text-zircon-ink underline underline-offset-2 outline-hidden hover:text-ink focus-visible:shadow-focus"
      >{{ t('privacy.promptRead') }}</a>
      <ZCheckbox
        v-model:checked="consent"
        class="items-start gap-2.5 text-[13.5px] leading-[1.45] text-ink-2 [&>button]:mt-0.5"
        data-privacy-prompt-consent
      >
        <i18n-t keypath="privacy.consent" tag="span" scope="global">
          <template #link>
            <a href="/privacy" target="_blank" rel="noopener" class="text-zircon-ink underline underline-offset-2">{{ t('privacy.consentLink') }}</a>
          </template>
        </i18n-t>
      </ZCheckbox>
    </div>
  </ZModal>
</template>
