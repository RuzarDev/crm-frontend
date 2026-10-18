<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import { telegramApi, type TelegramStatus } from '@/api/telegram'
import { useConfirm } from '@/ui/confirm'
import { message } from '@/ui/message'
import ProfileCard from './ProfileCard.vue'

// «Telegram» (очередь 4, задача 3): клиент получает одноразовую ссылку на бота (15 минут), после /start чат привязан —
// карточка показывает, кто подключён, выключатель уведомлений и «Отвязать». Пока ссылка жива — опрашиваем статус
// раз в 3 с, чтобы карточка сама увидела привязку без перезагрузки. Бот не настроен на сервере — карточка говорит об этом.
const { t, locale } = useI18n()
const { confirm } = useConfirm()

const status = ref<TelegramStatus | null>(null)
const loading = ref(true)
const loadError = ref(false)
const link = ref<{ url: string; expiresAtUtc: string } | null>(null)
const creating = ref(false)
const unlinking = ref(false)
const switching = ref(false)
let poll: ReturnType<typeof setInterval> | null = null

const load = async (silent = true) => {
  try {
    status.value = await telegramApi.status({ silent })
    loadError.value = false
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const stopPoll = () => { if (poll) { clearInterval(poll); poll = null } }
const startPoll = () => {
  stopPoll()
  poll = setInterval(async () => {
    if (!link.value) return stopPoll()
    if (new Date(link.value.expiresAtUtc).getTime() < Date.now()) { link.value = null; return stopPoll() }
    await load()
    if (status.value?.linked) { link.value = null; stopPoll(); message.success(t('personal.profile.telegram.linkedToast')) }
  }, 3000)
}

const createLink = async () => {
  if (creating.value) return
  creating.value = true
  try {
    link.value = await telegramApi.createLink()
    startPoll()
  } finally {
    creating.value = false
  }
}

const openLink = () => { if (link.value) window.open(link.value.url, '_blank', 'noopener') }

const copy = async () => {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value.url)
    message.success(t('personal.profile.telegram.copied'))
  } catch {
    message.warning(t('personal.profile.telegram.copyFailed'))
  }
}

const unlink = async () => {
  if (unlinking.value) return
  const ok = await confirm({
    title: t('personal.profile.telegram.unlinkTitle'),
    content: t('personal.profile.telegram.unlinkText'),
    okText: t('personal.profile.telegram.unlink'),
    cancelText: t('common.cancel'),
    danger: true,
  })
  if (!ok) return
  unlinking.value = true
  try {
    await telegramApi.unlink()
    await load()
    message.success(t('personal.profile.telegram.unlinked'))
  } finally {
    unlinking.value = false
  }
}

const toggle = async (checked: boolean) => {
  if (!status.value || switching.value) return
  const prev = status.value.notificationsEnabled
  status.value.notificationsEnabled = checked
  switching.value = true
  try {
    await telegramApi.setNotifications(checked)
  } catch {
    status.value.notificationsEnabled = prev
  } finally {
    switching.value = false
  }
}

const expiresText = computed(() => {
  if (!link.value) return ''
  const d = new Date(link.value.expiresAtUtc)
  return t('personal.profile.telegram.expires', { time: d.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }) })
})
const accountText = computed(() => {
  const s = status.value
  if (!s) return ''
  return s.username ? `@${s.username}` : s.firstName || t('personal.profile.telegram.linkedNoName')
})

onMounted(() => load())
onBeforeUnmount(stopPoll)
</script>

<template>
  <ProfileCard :title="t('personal.profile.telegram.title')" data-profile-card="telegram">
    <div v-if="loading" class="flex flex-col gap-2" data-telegram-loading>
      <ZSkeleton :lines="2" height="16px" />
    </div>
    <div v-else-if="loadError" class="flex flex-wrap items-center gap-3" data-telegram-error>
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-2">{{ t('personal.profile.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11" @click="load(false)">{{ t('personal.profile.retry') }}</ZButton>
    </div>
    <p v-else-if="!status?.botConfigured" class="m-0 text-sm text-muted" data-telegram-off>{{ t('personal.profile.telegram.notConfigured') }}</p>

    <template v-else-if="status.linked">
      <p class="m-0 text-sm text-ink-2" data-telegram-linked>
        {{ t('personal.profile.telegram.linkedAs') }} <span class="font-medium text-ink">{{ accountText }}</span>
      </p>
      <div class="flex items-center gap-3 rounded-panel border border-line px-4 py-3">
        <label for="telegram-notify" class="min-w-0 flex-1 text-sm">
          <span class="block font-medium text-ink">{{ t('personal.profile.telegram.notify') }}</span>
          <span class="block text-xs text-muted">{{ t('personal.profile.telegram.notifyHint') }}</span>
        </label>
        <ZSwitch id="telegram-notify" :checked="status.notificationsEnabled" :disabled="switching" class="max-sm:min-h-11" data-telegram-notify @update:checked="toggle" />
      </div>
      <p class="m-0 text-[13px] text-muted">{{ t('personal.profile.telegram.commands') }}</p>
      <div>
        <ZButton variant="danger-ghost" :loading="unlinking" class="max-sm:h-11 max-sm:w-full" data-telegram-unlink @click="unlink">{{ t('personal.profile.telegram.unlink') }}</ZButton>
      </div>
    </template>

    <template v-else>
      <p class="m-0 text-sm text-ink-2">{{ t('personal.profile.telegram.hint') }}</p>
      <template v-if="link">
        <div class="flex flex-col gap-2 rounded-panel border border-line bg-canvas px-4 py-3" data-telegram-link>
          <a :href="link.url" target="_blank" rel="noopener" class="break-all text-sm font-medium text-zircon-ink underline-offset-2 hover:text-ink hover:underline" data-telegram-url>{{ link.url }}</a>
          <p class="m-0 text-xs text-muted">{{ expiresText }} · {{ t('personal.profile.telegram.waiting') }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <ZButton variant="primary" class="max-sm:h-11 max-sm:w-full" data-telegram-open @click="openLink">{{ t('personal.profile.telegram.open') }}</ZButton>
          <ZButton class="max-sm:h-11 max-sm:w-full" data-telegram-copy @click="copy">{{ t('personal.profile.telegram.copy') }}</ZButton>
        </div>
      </template>
      <div v-else>
        <ZButton variant="primary" :loading="creating" class="max-sm:h-11 max-sm:w-full" data-telegram-connect @click="createLink">{{ t('personal.profile.telegram.connect') }}</ZButton>
      </div>
    </template>
  </ProfileCard>
</template>
