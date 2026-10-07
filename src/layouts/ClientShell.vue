<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ShellFrame from '@/components/shell/ShellFrame.vue'
import ZAskBanner from '@/components/z/ZAskBanner.vue'
import ZAlert from '@/components/z/ZAlert.vue'
import { buildClientNav, navAccessFromStore } from '@/shell/navModel'
import { registrationBannerState, shouldRedirectToRegistration, type RegistrationSnapshot } from '@/shell/registrationBanner'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { useAuthStore } from '@/stores/auth'
import { REG_REDIRECT_FLAG as REDIRECT_FLAG } from '@/shell/resetSession'

// Кабинет клиента: свои разделы (navModel), просторная раскладка и плашка незавершённой регистрации.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const registration = useClientRegistration()

const model = computed(() =>
  buildClientNav(navAccessFromStore(authStore, registration.loaded.value && !registration.complete.value)))

const snapshot = (): RegistrationSnapshot => ({
  isClient: registration.isClient.value,
  loaded: registration.loaded.value,
  complete: registration.complete.value,
  nextStep: registration.nextStep.value,
  doneCount: registration.doneCount.value,
  needNew: registration.needNew.value,
})
const banner = computed(() => registrationBannerState(snapshot(), route.path))
const continueRegistration = () => {
  const b = banner.value
  if (b?.kind === 'todo') void router.push(b.to)
}

onMounted(async () => {
  await registration.refresh()
  let redirected = false
  try { redirected = sessionStorage.getItem(REDIRECT_FLAG) === '1' } catch { /* приватный режим */ }
  if (shouldRedirectToRegistration(snapshot(), route.path, redirected)) {
    try { sessionStorage.setItem(REDIRECT_FLAG, '1') } catch { /* приватный режим */ }
    void router.replace('/import-40/company')
  }
})

// Ушёл со страницы регистрации — перечитываем, чтобы плашка и точка в меню погасли.
watch(() => route.path, (path, prev) => {
  if (registration.isClient.value && prev?.startsWith('/import-40/company') && !path.startsWith('/import-40/company')) {
    void registration.refresh()
  }
})
</script>

<template>
  <ShellFrame :model="model" comfortable client>
    <template #banner>
      <ZAskBanner
        v-if="banner?.kind === 'todo'"
        class="mb-6"
        :title="t('registration.title')"
        :description="t('registration.text', { done: banner.done, next: t(`registration.step.${banner.next}`) })"
        :action-text="t('registration.continue')"
        @action="continueRegistration"
      />
      <ZAlert
        v-else-if="banner?.kind === 'waiting'"
        class="mb-6"
        type="info"
        show-icon
        :message="t('registration.waitingTitle')"
        :description="t('registration.waitingText')"
      />
    </template>
  </ShellFrame>
</template>
