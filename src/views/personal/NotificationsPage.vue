<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { PhBell } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { notificationsApi } from '@/api/notifications'
import { notificationTarget } from '@/shell/notificationTarget'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { calendarLocale } from '@/ui/date'
import { cn } from '@/ui/cn'
import type { AppNotification } from '@/types/api'

// «Уведомления» (редизайн, волна 5б): вся лента с прочитанными — колокольчик держит только последние.
// Непрочитанные жирным; клик читает и ведёт к заявке/реестру (notificationTarget). Первая загрузка — скелетон;
// ошибка — отдельное состояние с «Повторить», а не «уведомлений нет»; «Показать ещё» — только если пришла полная страница.
const PAGE_SIZE = 30
const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const store = useNotificationsStore()

const items = ref<AppNotification[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref(false)
const moreError = ref(false)
const hasMore = ref(false)
let seq = 0

// Первая страница заменяет список, следующие дописываются; ответ устаревшего запроса отбрасывается.
const loadPage = async (reset: boolean) => {
  const my = ++seq
  loading.value = true
  if (reset) error.value = false
  moreError.value = false
  try {
    const res = await notificationsApi.list({ limit: PAGE_SIZE, offset: reset ? 0 : items.value.length }, { silent: true })
    if (my !== seq) return
    items.value = reset ? res.data : [...items.value, ...res.data]
    hasMore.value = res.data.length === PAGE_SIZE
    loaded.value = true
  } catch {
    if (my !== seq) return
    if (reset || !items.value.length) error.value = true
    else moreError.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
onMounted(() => {
  void loadPage(true)
  void store.refreshUnreadCount()
})

const hasUnread = computed(() => items.value.some((n) => !n.isRead) || store.unreadCount > 0)
const markAllBusy = ref(false)
const markAll = async () => {
  if (markAllBusy.value) return
  markAllBusy.value = true
  try {
    await store.markAllRead()
    items.value.forEach((n) => (n.isRead = true))
  } catch { /* отказ показал общий перехватчик; список остаётся как был */ } finally {
    markAllBusy.value = false
  }
}

const open = async (n: AppNotification) => {
  if (!n.isRead) {
    try {
      await store.markRead(n.id)
      n.isRead = true
    } catch { /* не отметилось (тост уже показан) — переходим всё равно */ }
  }
  const to = notificationTarget(n, auth.isFinanceOnly)
  if (to) void router.push(to)
}

// Время — по языку интерфейса; сервер отдаёт UTC (если пояса нет — добавляем, иначе браузер прочёл бы его как местное).
const when = (utc: string) => {
  const iso = /(?:Z|[+-]\d\d:?\d\d)$/.test(utc) ? utc : `${utc}Z`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(calendarLocale(locale.value), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}
</script>

<template>
  <div class="flex min-w-0 max-w-[48rem] flex-col gap-3" data-notifications-page>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 class="m-0 min-w-0 flex-1 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('personal.notifications.title') }}</h1>
      <ZButton
        :disabled="!loaded || !hasUnread"
        :loading="markAllBusy"
        class="max-sm:h-11 max-sm:w-full"
        data-mark-all
        @click="markAll"
      >{{ t('personal.notifications.markAll') }}</ZButton>
    </div>

    <div v-if="error" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-notifications-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('personal.notifications.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-notifications-retry @click="loadPage(true)">{{ t('personal.notifications.retry') }}</ZButton>
    </div>
    <div v-else-if="!loaded" class="rounded-panel border border-line bg-surface p-4" data-notifications-skeleton>
      <ZSkeleton :lines="5" height="44px" />
    </div>
    <div v-else-if="!items.length" class="rounded-panel border border-line bg-surface" data-notifications-empty>
      <ZEmpty :title="t('personal.notifications.empty')" :hint="t('personal.notifications.emptyHint')">
        <template #icon><PhBell :size="20" aria-hidden="true" /></template>
      </ZEmpty>
    </div>
    <ul v-else class="m-0 flex list-none flex-col overflow-hidden rounded-panel border border-line bg-surface p-1" data-notifications-list>
      <li v-for="n in items" :key="n.id">
        <button
          type="button"
          :class="cn(
            'flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-row border-0 bg-transparent px-3 py-3 text-left font-sans text-ink',
            'outline-hidden transition-colors duration-150 hover:bg-canvas focus-visible:shadow-focus motion-reduce:transition-none max-sm:min-h-11',
          )"
          :data-unread="n.isRead ? undefined : ''"
          data-notification
          @click="open(n)"
        >
          <span class="mt-[7px] size-2 shrink-0 rounded-pill" :class="n.isRead ? 'bg-transparent' : 'bg-gold'" aria-hidden="true" />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-base [overflow-wrap:anywhere]" :class="n.isRead ? 'font-normal text-ink-2' : 'font-semibold text-ink'" data-notification-title>
              <span v-if="!n.isRead" class="sr-only">{{ t('personal.notifications.unread') }}: </span>{{ n.title }}
            </span>
            <span v-if="n.body" class="text-sm text-ink-3 [overflow-wrap:anywhere]">{{ n.body }}</span>
            <span class="text-[12.5px] text-muted tabular-nums" data-notification-time>{{ when(n.createdAtUtc) }}</span>
          </span>
        </button>
      </li>
    </ul>

    <div v-if="loaded && items.length && (hasMore || moreError)" class="flex flex-col items-center gap-2 pt-1">
      <p v-if="moreError" role="alert" class="m-0 text-sm text-danger" data-notifications-more-error>{{ t('personal.notifications.moreError') }}</p>
      <ZButton :loading="loading" class="max-sm:h-11 max-sm:w-full" data-notifications-more @click="loadPage(false)">{{ t('personal.notifications.more') }}</ZButton>
    </div>
  </div>
</template>
