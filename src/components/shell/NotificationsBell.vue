<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { PhBell } from '@phosphor-icons/vue'
import ZPopover from '@/components/z/ZPopover.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { useNotificationsStore } from '@/stores/notifications'
import type { AppNotification } from '@/types/api'
import { cn } from '@/ui/cn'

// Колокольчик шапки: счётчик опрашивает стор (startPolling — в оболочке), список грузится при каждом открытии.
// Клик по уведомлению читает его и ведёт к заявке/реестру (аудит 2.2), окно закрывается.
const MAX_ITEMS = 8

const { t } = useI18n()
const router = useRouter()
const notifStore = useNotificationsStore()

const open = ref(false)
const listEl = ref<HTMLUListElement | null>(null)

const unread = computed(() => (notifStore.unreadCount > 0 ? notifStore.unreadCount : 0))
const label = computed(() => (unread.value ? t('shell.bell.labelUnread', { n: unread.value }) : t('shell.bell.label')))
const shown = computed(() => notifStore.items.slice(0, MAX_ITEMS))
const hasUnreadItems = computed(() => notifStore.items.some((i) => !i.isRead))
const firstLoad = computed(() => notifStore.loading && !notifStore.items.length)

watch(open, (v) => { if (v) void notifStore.fetch() })

const formatNotifTime = (iso: string) => dayjs(iso).format('DD.MM HH:mm')

// Ошибку действия показывает общий перехватчик (тост) — здесь её только не пускаем дальше.
const markAll = async (e: MouseEvent) => {
  const hadFocus = document.activeElement === e.currentTarget
  try { await notifStore.markAllRead() } catch { return }
  // Кнопка пропадает вместе с непрочитанными — фокус не должен уйти в никуда.
  if (hadFocus) {
    await nextTick()
    listEl.value?.querySelector<HTMLButtonElement>('button')?.focus()
  }
}

// Не прочиталось (сеть) — всё равно ведём, куда человек нажал: тост об ошибке он уже видит.
const openNotification = async (n: AppNotification) => {
  open.value = false
  if (!n.isRead) {
    try { await notifStore.markRead(n.id) } catch { /* тост показал перехватчик */ }
  }
  if (n.caseId) await router.push(`/import-40/${n.caseId}`)
  else if (n.reestrEntryId) await router.push('/reestr')
}

const onAllClick = (e: MouseEvent, navigate: (e?: MouseEvent) => unknown) => {
  navigate(e)
  if (e.defaultPrevented) open.value = false
}

const itemClass = cn(
  'flex w-full cursor-pointer items-start gap-2.5 border-0 bg-transparent px-4 py-2.5 text-left font-sans',
  'outline-hidden transition-colors duration-150 ease-out hover:bg-sunken motion-reduce:transition-none',
  // Пункт во всю ширину прокручиваемого списка: внешнее кольцо обрезалось бы — рисуем внутреннее.
  'focus-visible:bg-sunken focus-visible:shadow-[inset_0_0_0_2px_var(--color-zircon-ink)]',
)
</script>

<template>
  <ZPopover v-model:open="open" align="end" content-class="w-[calc(100vw-24px)] p-0 sm:w-[360px]">
    <template #trigger>
      <button
        type="button"
        :aria-label="label"
        class="relative flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-2 outline-hidden transition-colors duration-150 ease-out hover:bg-sunken hover:text-ink focus-visible:shadow-focus data-[state=open]:bg-sunken data-[state=open]:text-ink motion-reduce:transition-none"
      >
        <PhBell :size="18" aria-hidden="true" />
        <span
          v-if="unread"
          data-unread-dot
          aria-hidden="true"
          class="pointer-events-none absolute top-[7px] right-[8px] size-[7px] rounded-full bg-danger"
        />
      </button>
    </template>

    <div class="flex min-h-7 items-center justify-between gap-3 px-4 pt-3 pb-2">
      <p class="m-0 text-sm font-semibold text-ink">{{ t('shell.bell.title') }}</p>
      <button
        v-if="hasUnreadItems"
        type="button"
        class="-mr-2 h-7 shrink-0 cursor-pointer rounded-[7px] border-0 bg-transparent px-2 font-sans text-[13px] font-medium text-zircon-ink outline-hidden transition-colors duration-150 ease-out hover:bg-sunken focus-visible:shadow-focus motion-reduce:transition-none"
        @click="markAll"
      >
        {{ t('shell.bell.markAll') }}
      </button>
    </div>

    <div v-if="firstLoad" class="border-t border-line py-1">
      <div v-for="i in 3" :key="i" class="px-4 py-3">
        <ZSkeleton :lines="2" height="12px" />
      </div>
    </div>
    <p v-else-if="!shown.length" class="m-0 border-t border-line px-4 py-8 text-center text-[13px] text-muted">
      {{ t('shell.bell.empty') }}
    </p>
    <ul
      v-else
      ref="listEl"
      class="m-0 max-h-[min(440px,60dvh)] list-none overflow-y-auto overscroll-contain border-t border-line p-0 py-1 [scrollbar-width:thin]"
    >
      <li v-for="n in shown" :key="n.id">
        <button type="button" :class="itemClass" @click="openNotification(n)">
          <span
            aria-hidden="true"
            :class="cn('mt-[7px] size-1.5 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-zircon')"
          />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-baseline gap-3">
              <span :class="cn('min-w-0 flex-1 truncate text-sm leading-5 text-ink', n.isRead ? 'font-medium' : 'font-semibold')">
                <span v-if="!n.isRead" class="sr-only">{{ t('shell.bell.unreadSr') }}: </span>{{ n.title }}
              </span>
              <time :datetime="n.createdAtUtc" class="shrink-0 text-xs text-muted tabular-nums">{{ formatNotifTime(n.createdAtUtc) }}</time>
            </span>
            <span v-if="n.body" class="line-clamp-2 text-[13px] leading-[18px] text-ink-3">{{ n.body }}</span>
          </span>
        </button>
      </li>
    </ul>

    <div class="border-t border-line p-1">
      <RouterLink v-slot="{ href, navigate }" to="/notifications" custom>
        <a
          :href="href"
          class="flex h-9 items-center justify-center rounded-[7px] text-[13px] font-medium text-zircon-ink no-underline outline-hidden transition-colors duration-150 ease-out hover:bg-sunken focus-visible:shadow-focus motion-reduce:transition-none"
          @click="onAllClick($event, navigate)"
        >
          {{ t('shell.bell.all') }}
        </a>
      </RouterLink>
    </div>
  </ZPopover>
</template>
