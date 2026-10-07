<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhList, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZDrawer from '@/components/z/ZDrawer.vue'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import ShellSidebar from '@/components/shell/ShellSidebar.vue'
import ShellSectionTabs from '@/components/shell/ShellSectionTabs.vue'
import NotificationsBell from '@/components/shell/NotificationsBell.vue'
import LangMenu from '@/components/shell/LangMenu.vue'
import UserMenu from '@/components/shell/UserMenu.vue'
import CommandPalette from '@/components/shell/CommandPalette.vue'
import { allSections, resolveActive, type NavModel } from '@/shell/navModel'
import { homeAttention } from '@/shell/attention'
import { installPaletteHotkey, useCommandPalette, type PaletteDestination } from '@/shell/useCommandPalette'
import { useNotificationsStore } from '@/stores/notifications'
import { useProfileStore } from '@/stores/profile'
import { profileApi } from '@/api/profile'
import { cn } from '@/ui/cn'

// Каркас оболочки (брокер и клиент, макеты Main.dc / Client.dc): меню слева на тёплом фоне, справа белая
// рабочая панель со своей шапкой. Ниже lg меню уходит в ящик слева, вкладки раздела — второй строкой шапки.
// Старые экраны (AntD) рендерятся в <main> как есть.
const props = withDefaults(defineProps<{
  model: NavModel
  /** Кабинет клиента: крупнее пункты меню. */
  comfortable?: boolean
  /** Кабинет клиента: уже меню, шире поля, своя подсказка в поиске. */
  client?: boolean
}>(), { comfortable: false, client: false })

const { t, locale } = useI18n()
const route = useRoute()
const palette = useCommandPalette()
const notifStore = useNotificationsStore()
const profileStore = useProfileStore()

// ---- Раздел и вкладки ----
const active = computed(() => resolveActive(props.model, route.path))
const tabsSection = computed(() => {
  const s = active.value?.section
  return s && s.pages.length >= 2 ? s : null
})

// На Главной без вкладок — сегодняшняя дата («Среда, 8 октября»). Пересчитывается при переходах и смене языка.
const today = computed(() => {
  void route.path
  const s = new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return s.charAt(0).toLocaleUpperCase(locale.value) + s.slice(1)
})
const isHome = computed(() => route.path === '/home')

// ---- Палитра: переходы по всем видимым вкладкам (действия вроде «Оформить поставку» — не переходы) ----
// computed, а не массив в шаблоне: новый массив на каждый рендер сбрасывал бы активный пункт палитры.
const destinations = computed<PaletteDestination[]>(() =>
  allSections(props.model)
    .filter((s) => !s.action)
    .flatMap((s) => s.pages.map((p) => ({
      key: `${s.key}:${p.key}`,
      label: t(p.labelKey),
      hint: p.labelKey !== s.labelKey ? t(s.labelKey) : undefined,
      to: p.to,
    }))),
)

// ---- Ящик меню (ниже lg) ----
const drawerOpen = ref(false)
watch(() => route.fullPath, () => { drawerOpen.value = false })

// «К содержимому»: фокус в <main> без смены адреса (ссылка #main сменила бы URL и прошла через роутер).
const mainEl = ref<HTMLElement | null>(null)
const skipToMain = () => mainEl.value?.focus()

// ---- Жизненный цикл: счётчик уведомлений, ⌘K, имя для шапки ----
let offHotkey: (() => void) | null = null
onMounted(() => {
  void notifStore.fetch()
  notifStore.startPolling()
  offHotkey = installPaletteHotkey()
  // Имя в меню пользователя — из профиля; фоновая загрузка, без тоста при ошибке (останется логин).
  if (!profileStore.profile) {
    profileApi.get({ silent: true })
      .then((r) => { if (!profileStore.profile) profileStore.profile = r.data })
      .catch(() => {})
  }
})
onUnmounted(() => {
  notifStore.stopPolling()
  offHotkey?.()
  offHotkey = null
})

const iconButton = 'flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-2 outline-hidden transition-colors duration-150 ease-out hover:bg-sunken hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none'
</script>

<template>
  <div
    class="min-h-dvh bg-canvas font-sans text-ink lg:flex"
    :data-density="comfortable ? 'comfortable' : 'compact'"
  >
    <a
      href="#main"
      class="sr-only rounded-field bg-navy px-3 py-2 text-sm font-semibold text-white no-underline outline-hidden focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:shadow-focus"
      @click.prevent="skipToMain"
    >{{ t('shell.skip') }}</a>

    <aside
      :class="cn(
        'sticky top-0 hidden h-dvh shrink-0 overflow-y-auto lg:block',
        client ? 'lg:w-[240px]' : 'lg:w-[248px]',
      )"
    >
      <ShellSidebar
        :model="model"
        :path="route.path"
        :attention="homeAttention"
        :comfortable="comfortable"
        @search="palette.show()"
      />
    </aside>

    <div class="flex min-w-0 flex-1 flex-col bg-surface lg:m-2.5 lg:ml-0 lg:min-h-[calc(100dvh-20px)] lg:rounded-panel lg:border lg:border-line">
      <header class="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-3 lg:flex-nowrap lg:rounded-t-panel lg:px-7 lg:py-3.5">
        <div class="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            :aria-label="t('shell.menu')"
            :aria-expanded="drawerOpen"
            aria-haspopup="dialog"
            :class="cn(iconButton, '-ml-1.5')"
            @click="drawerOpen = true"
          >
            <PhList :size="20" aria-hidden="true" />
          </button>
          <RouterLink
            to="/home"
            class="flex items-center rounded-field no-underline outline-hidden focus-visible:shadow-focus"
          >
            <ZirconLogo size="sm" />
          </RouterLink>
        </div>

        <div
          v-if="tabsSection && active"
          class="order-last -mx-1 -my-1 w-[calc(100%+0.5rem)] min-w-0 lg:order-none lg:w-auto"
        >
          <ShellSectionTabs :section="tabsSection" :active-key="active.page.key" />
        </div>
        <span v-else-if="isHome" class="hidden text-[13px] text-muted lg:block">{{ today }}</span>

        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            :aria-label="t('shell.search.open')"
            :class="cn(iconButton, 'lg:hidden')"
            @click="palette.show()"
          >
            <PhMagnifyingGlass :size="18" aria-hidden="true" />
          </button>
          <NotificationsBell />
          <LangMenu />
          <UserMenu />
        </div>
      </header>

      <main
        id="main"
        ref="mainEl"
        tabindex="-1"
        :class="cn(
          'min-w-0 flex-1 px-4 py-5 outline-hidden',
          client ? 'lg:px-10 lg:py-8' : 'lg:px-7 lg:py-6',
        )"
      >
        <slot name="banner" />
        <!-- Карточка ДТ читает caseId/dtId один раз при создании: переход с одной ДТ на другую
             (например, в новую ДТ ВТО после разделения) должен пересоздавать страницу. -->
        <router-view :key="route.name === 'import-40-dt' ? String(route.params.dtId) : undefined" />
      </main>
    </div>

    <ZDrawer
      v-model:open="drawerOpen"
      placement="left"
      :width="280"
      :aria-label="t('shell.menu')"
    >
      <!-- Шапка ящика — логотип в одной строке с крестиком; имя окна для чтения с экрана — «Меню». -->
      <template #title>
        <span class="sr-only">{{ t('shell.menu') }}</span>
        <!-- Выровнен по иконкам пунктов: у плотного меню они на 2px левее поля заголовка ящика. -->
        <span aria-hidden="true" :class="cn('flex', !comfortable && '-ml-0.5')" data-shell-logo><ZirconLogo size="sm" /></span>
      </template>
      <div class="-mx-6 -my-4 h-[calc(100%+2rem)]">
        <ShellSidebar
          :model="model"
          :path="route.path"
          :attention="homeAttention"
          :comfortable="comfortable"
          :searchable="false"
          :show-logo="false"
          @navigate="drawerOpen = false"
        />
      </div>
    </ZDrawer>

    <CommandPalette :destinations="destinations" :client="client" />
  </div>
</template>
