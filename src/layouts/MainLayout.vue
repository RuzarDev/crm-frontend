<template>
  <a-layout class="main-layout app-shell">
    <a-layout-header class="app-header">
      <div class="brand">
        <div class="brand-text">
          <div class="brand-title">Zircon</div>
          <!-- Клиенту не нужен внутренний термин «CRM Operations» — это его личный кабинет
               брокера AQNIET, а не рабочий инструмент сотрудника (аудит 5.23). -->
          <div class="brand-subtitle">{{ isClientRole ? t('header.brandSubtitleClient') : t('header.brandSubtitle') }}</div>
        </div>
      </div>

      <!-- Сквозной поиск: заявки, ДТ, клиенты, документы, счета в одном поле -->
      <div class="header-search">
        <a-auto-complete
          v-model:value="searchTerm"
          :options="searchOptions"
          :placeholder="(authStore.role || '').toLowerCase() === 'client' ? t('header.searchPhClient') : t('header.searchPh')"
          style="width: 100%"
          @search="onSearch"
          @select="onSearchSelect"
        >
          <template #default>
            <a-input-search :loading="searching" allow-clear />
          </template>
        </a-auto-complete>
      </div>

      <div class="header-right">
        <LanguageSwitcher dark />

        <!-- Меню пользователя: профиль ушёл сюда из «Администрирования» — там он был единственным
             пунктом и группа не несла смысла ни у одной роли (аудит 2026-09-28, раздел 8). -->
        <a-dropdown :trigger="['click']" placement="bottomRight">
          <button type="button" class="user-menu-trigger">
            <!-- Бейдж бизнес-роли клиенту ни о чём не говорит — это его собственный кабинет, роль тут
                 неуместна (аудит 5.23). -->
            <span v-if="!isClientRole" class="role-badge">{{ roleLabel }}</span>
            <span class="username">{{ authStore.username }}</span>
            <UserOutlined class="user-menu-icon" />
          </button>
          <template #overlay>
            <a-menu @click="handleUserMenuClick">
              <a-menu-item key="/profile">
                <UserOutlined /> {{ t('nav.profile') }}
              </a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout">
                <LogoutOutlined /> {{ t('header.logout') }}
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>

        <!-- Notifications bell -->
        <a-dropdown :trigger="['click']" placement="bottomRight" @open-change="onNotifOpen">
          <a-badge :count="notifStore.unreadCount" :overflow-count="99" class="notif-badge">
            <a-button class="notif-btn" :title="t('header.notifications')">
              <BellOutlined />
            </a-button>
          </a-badge>
          <template #overlay>
            <div class="notif-dropdown">
              <div class="notif-header">
                <span class="notif-title">{{ t('header.notifications') }}</span>
                <a-button
                  v-if="notifStore.items.length"
                  type="link"
                  size="small"
                  @click.stop="notifStore.markAllRead()"
                >
                  {{ t('header.markAllRead') }}
                </a-button>
              </div>
              <a-spin :spinning="notifStore.loading">
                <div v-if="notifStore.items.length" class="notif-list">
                  <div
                    v-for="n in notifStore.items"
                    :key="n.id"
                    class="notif-item"
                    :class="{ 'notif-item--unread': !n.isRead }"
                    @click="openNotification(n)"
                  >
                    <div v-if="n.title" class="notif-title-row">{{ n.title }}</div>
                    <div class="notif-msg">{{ n.body }}</div>
                    <div class="notif-time">{{ formatNotifTime(n.createdAtUtc) }}</div>
                  </div>
                </div>
                <div v-else class="notif-empty">{{ t('header.notificationsEmpty') }}</div>
              </a-spin>
              <div class="notif-footer">
                <a-button type="link" size="small" block @click.stop="openAllNotifications">
                  {{ t('header.allNotifications') }}
                </a-button>
              </div>
            </div>
          </template>
        </a-dropdown>

        <a-button class="menu-toggle-btn" @click="mobileNavOpen = true" :title="t('misc.menyu')">
          <MenuOutlined />
        </a-button>
      </div>
    </a-layout-header>

    <a-layout>
      <a-layout-sider width="248" class="sider">
        <nav class="sider-nav">
          <a-config-provider :theme="zirconDarkSiderTheme">
            <a-menu
              mode="inline"
              theme="dark"
              :selected-keys="[selectedMenuKey]"
              :open-keys="openKeys"
              @open-change="onOpenChange"
              @click="handleMenuClick"
              :items="menuItems"
            />
          </a-config-provider>
        </nav>
      </a-layout-sider>

      <a-layout-content class="content">
        <!-- Клиент, не завершивший регистрацию (реквизиты → договор → доверенность), видит это на
             любой странице: без неё заявку не подать. На самой странице регистрации — не дублируем. -->
        <a-alert
          v-if="registrationBanner"
          class="registration-banner"
          :type="registrationBanner.type"
          show-icon
          :message="registrationBanner.title"
          :description="registrationBanner.text"
        >
          <template v-if="registrationBanner.action" #action>
            <a-button type="primary" @click="router.push(registration.needNew.value ? `/import-40/company?step=${registration.needNew.value}` : '/import-40/company')">{{ t('registration.continue') }}</a-button>
          </template>
        </a-alert>
        <!-- Карточка ДТ читает caseId/dtId один раз при создании: переход с одной ДТ на другую
             (например, в новую ДТ ВТО после разделения) должен пересоздавать страницу. -->
        <router-view :key="route.name === 'import-40-dt' ? String(route.params.dtId) : undefined" />
      </a-layout-content>
    </a-layout>
  </a-layout>

  <!-- Mobile navigation drawer -->
  <a-drawer
    v-model:open="mobileNavOpen"
    placement="left"
    :width="264"
    class="atg-mobile-drawer"
    :closable="true"
  >
    <template #title>
      <div class="drawer-brand">
        <div>
          <div class="drawer-brand-title">Zircon</div>
          <div class="drawer-brand-sub">{{ isClientRole ? t('header.brandSubtitleClient') : t('header.brandSubtitle') }}</div>
        </div>
      </div>
    </template>

    <a-config-provider :theme="zirconDarkSiderTheme">
      <a-menu
        mode="inline"
        theme="dark"
        :selected-keys="[selectedMenuKey]"
        @click="handleMobileMenuClick"
        :items="menuItems"
        class="drawer-menu"
      />
    </a-config-provider>

    <div class="drawer-footer">
      <div v-if="!isClientRole" class="drawer-footer-role">{{ roleLabel }}</div>
      <div class="drawer-footer-user">{{ authStore.username }}</div>
      <a-button class="drawer-logout" block @click="handleMobileMenuClick({ key: '/profile' })">
        <UserOutlined />
        {{ t('nav.profile') }}
      </a-button>
      <a-button class="drawer-logout" block @click="handleLogout">
        <LogoutOutlined />
        {{ t('header.logout') }}
      </a-button>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { systemApi } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import type { AppNotification } from '@/types/api'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import {
  ApiOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  BuildOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  ContainerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarCircleOutlined,
  DollarOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  IdcardOutlined,
  ImportOutlined,
  KeyOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  SyncOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons-vue'
import { formatRole } from '@/utils/labels'
import { businessRoleLabel } from '@/api/permissions'
import { useClientRegistration } from '@/composables/useClientRegistration'
import { zirconDarkSiderTheme } from '@/theme/antdTheme'
import dayjs from 'dayjs'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notifStore = useNotificationsStore()
const { t } = useI18n()

const mobileNavOpen = ref(false)
const openKeys = ref<string[]>([])
const isClientRole = computed(() => (authStore.role || '').trim().toLowerCase() === 'client')

// Опрос unread-count раз в минуту (только на видимой вкладке) — раньше счётчик обновлялся
// только при перезагрузке страницы или открытии колокольчика (аудит 2.3).
onMounted(() => {
  notifStore.fetch()
  notifStore.startPolling()
})
onUnmounted(() => notifStore.stopPolling())

const registration = useClientRegistration()
const registrationBanner = computed(() => {
  if (!registration.isClient.value || !registration.loaded.value || registration.complete.value) return null
  if (route.path.startsWith('/import-40/company')) return null
  if (!registration.nextStep.value) {
    // Всё, что зависит от клиента, сделано — договор на подписи у AQNIET.
    return { type: 'info' as const, title: t('registration.waitingTitle'), text: t('registration.waitingText'), action: false }
  }
  return {
    type: 'warning' as const,
    title: t('registration.title'),
    text: t('registration.text', {
      done: registration.doneCount.value,
      next: t(`registration.step.${registration.nextStep.value}`),
    }),
    action: true,
  }
})
onMounted(async () => {
  if (!registration.isClient.value) return
  await registration.refresh()
  // Первый заход незарегистрированного клиента — сразу на шаги регистрации, а не на пустой дашборд.
  let redirected = false
  try { redirected = sessionStorage.getItem('zircon-reg-redirect') === '1' } catch { /* приватный режим */ }
  if (!redirected && !registration.complete.value && registration.nextStep.value
    && (route.path === '/' || route.path.startsWith('/dashboard'))) {
    try { sessionStorage.setItem('zircon-reg-redirect', '1') } catch { /* приватный режим */ }
    void router.replace('/import-40/company')
  }
})
// Ушёл со страницы регистрации — перечитываем, чтобы плашка и точка в меню погасли.
watch(() => route.path, (path, prev) => {
  if (registration.isClient.value && prev?.startsWith('/import-40/company') && !path.startsWith('/import-40/company')) {
    void registration.refresh()
  }
})

const onNotifOpen = (open: boolean) => {
  if (open) notifStore.fetch()
}

// Клик по уведомлению — читаем и ведём к заявке/реестру (аудит 2.2: раньше клик никуда не вёл,
// в модели не было привязки к заявке).
const openNotification = async (n: AppNotification) => {
  if (!n.isRead) await notifStore.markRead(n.id)
  if (n.caseId) {
    router.push(`/import-40/${n.caseId}`)
  } else if (n.reestrEntryId) {
    router.push('/reestr')
  }
}

const openAllNotifications = () => {
  router.push('/notifications')
}

const formatNotifTime = (iso: string) => dayjs(iso).format('DD.MM HH:mm')

const menuItems = computed(() => {
  const role = (authStore.role || '').trim().toLowerCase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operationsItems: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientsItems: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salesItems: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referenceItems: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminItems: any[] = []

  // Финансист (бухгалтер): видит только платежи и документы. Операционные экраны
  // декларанта/КПП и транзит ему не нужны — по требованию владельца 2026-09-23.
  // Признак: есть finance.read, но нет ни одного операционного права Импорта 40 и транзита.
  const financeOnly = authStore.isFinanceOnly

  // ─── Операции ───────────────────────────────────────────
  // «Уведомления» — доступны всем ролям без ограничения по правам (аудит 2.5): раньше пункт
  // требовал users.read и лежал в «Администрировании», хотя события есть у всех.
  operationsItems.push({
    key: '/notifications',
    icon: () => h(BellOutlined),
    label: t('nav.notifications'),
  })

  if (role !== 'sales' && !financeOnly) {
    operationsItems.push({
      key: '/dashboard',
      icon: () => h(DashboardOutlined),
      label: t('nav.dashboard'),
    })
  }

  // Клиенту-импортёру транзитные экраны не показываем (аудит 2026-09-22, п.11 и 2026-09-28, 5.1):
  // меню клиента решает clientHasModule, а не право reestr.read — оно у клиента есть всегда
  // (Auth/RolePermissions.cs), поэтому проверка ниже для роли client идёт ТОЛЬКО по модулю.
  const clientTransit = role === 'client' && authStore.clientHasModule('transit')
  const clientImport = role === 'client' && authStore.clientHasModule('import40')
  if (!financeOnly && (role === 'administrator' || clientTransit || (role !== 'client' && authStore.hasPermission('reestr.read')))) {
    operationsItems.push({
      key: '/reestr',
      icon: () => h(DatabaseOutlined),
      label: t('nav.registry'),
    })
  }

  // Сводный реестр заявок (импорт + транзит) — только владельцу/админу: остальным
  // это дубль их рабочего списка («Реестр» или «Импорт»), а три реестра подряд путают.
  if (role === 'administrator') {
    operationsItems.push({
      key: '/requests-registry',
      icon: () => h(ContainerOutlined),
      label: t('nav.requestsRegistry'),
    })
  }

  if (!financeOnly && (role === 'administrator' || role === 'expeditor' || authStore.hasPermission('packages.manage'))) {
    operationsItems.push({
      key: '/document-packages',
      icon: () => h(FileAddOutlined),
      label: t('nav.documentPackages'),
    })
  }

  if (authStore.canUseImport40 && !financeOnly) {
    operationsItems.push({
      key: '/import-40',
      icon: () => h(ImportOutlined),
      // Клиенту «Импорт 40» ни о чём не говорит — это его заявки.
      label: role === 'client' ? t('nav.myRequests') : t('nav.import'),
    })
  }

  // Клиенту «Моя компания» — рядом с заявками, а не в «Справочниках»; точка — регистрация не завершена.
  if (clientImport) {
    operationsItems.push({
      key: '/import-40/company',
      icon: () => h(SolutionOutlined),
      label: registration.loaded.value && !registration.complete.value
        ? h('span', { class: 'menu-attn' }, [t('nav.myCompany'), h('i', { class: 'menu-attn-dot' })])
        : t('nav.myCompany'),
    })
  }

  // Панель руководителя — назначения/проблемные (право import40.assign).
  if (authStore.hasPermission('import40.assign')) {
    operationsItems.push({
      key: '/import-40/manage',
      icon: () => h(TeamOutlined),
      label: t('nav.manage'),
    })
  }

  // Финансы — бухгалтер/КПП/руководитель (право finance.read).
  if (authStore.hasPermission('finance.read')) {
    operationsItems.push({
      key: '/finance',
      icon: () => h(DollarOutlined),
      label: t('nav.finance'),
    })
  }

  // Счета и акты брокера — там же, где финансы.
  if (authStore.hasPermission('finance.read') && role !== 'client') {
    operationsItems.push({
      key: '/billing',
      icon: () => h(FileDoneOutlined),
      label: t('nav.billing'),
    })
  }

  // Клиенту Импорта 40 — «Счета»: только свои, только чтение (аудит 5.2/решение владельца 4).
  if (clientImport) {
    operationsItems.push({
      key: '/billing',
      icon: () => h(FileDoneOutlined),
      label: t('nav.myInvoices'),
    })
  }

  // Админ видит один пункт КЕДЕН — «Декларации КЕДЕН» (полный список деклараций); отдельная
  // «Статусы КЕДЕН» показывала те же данные под другим названием (аудит §8) — ниже она уже не
  // выводится администратору, только остальным ролям, которым нужна была только эта страница.
  if (role === 'administrator') {
    operationsItems.push({
      key: '/keden',
      icon: () => h(SafetyCertificateOutlined),
      label: t('nav.keden'),
    })
  }

  // Статусы КЕДЕН по БИН — брокер/экспедитор/декларант(importer)/клиент транзита.
  // Клиенту Импорта 40 без транзита не показываем (аудит 5.1) — у него нет своих ДТ в КЕДЕН,
  // а import40.read/reestr.read клиенту даются всегда и раньше срабатывали как фолбэк.
  if (!financeOnly && role !== 'administrator' && (clientTransit || role === 'expeditor'
    || (role !== 'client' && (authStore.hasPermission('reestr.read') || authStore.hasPermission('import40.read'))))) {
    operationsItems.push({
      key: '/keden-status',
      icon: () => h(FlagOutlined),
      label: t('nav.kedenStatuses'),
    })
  }

  // Аналитика — среди операционных отчётов, а не в «Продажах» (аудит §8): иначе бухгалтер и
  // экспедитор, у которых есть analytics.read/clients.read, но нет продаж, видели группу
  // «Продажи» без единого пункта продаж.
  if (authStore.hasPermission('analytics.read')) {
    operationsItems.push({
      key: '/analytics',
      icon: () => h(BarChartOutlined),
      label: t('nav.analytics'),
    })
  }

  // ─── Клиенты ────────────────────────────────────────────
  if (role !== 'client' && (role === 'administrator' || authStore.hasPermission('clients.read'))) {
    clientsItems.push({
      key: '/clients',
      icon: () => h(IdcardOutlined),
      label: t('nav.clients'),
    })
  }

  if (authStore.hasPermission('clients.read') && role !== 'client') {
    clientsItems.push({
      key: '/client-documents',
      icon: () => h(FileProtectOutlined),
      label: t('nav.clientDocuments'),
    })
  }

  // ─── Продажи ────────────────────────────────────────────
  if (authStore.canUseSales) {
    salesItems.push({
      key: '/sales',
      icon: () => h(CalculatorOutlined),
      label: t('nav.salesModule'),
    })
  }

  // ─── Справочники ────────────────────────────────────────
  // Справочник ДТ — только декларанту (аудит §8): раньше открывался по references.read,
  // а его держат ещё и МПП/экспедитор, которым заполнение ДТ не нужно.
  if (!financeOnly && (role === 'administrator' || authStore.hasPermission('import40.declarant'))) {
    referenceItems.push({
      key: '/dt-guide',
      icon: () => h(ReadOutlined),
      label: t('nav.dtGuide'),
    })
  }

  if (role === 'administrator') {
    referenceItems.push({
      key: '/references',
      icon: () => h(BankOutlined),
      label: t('nav.referencesBook'),
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tnvedChildren: any[] = [
    { key: '/tnved/tree', icon: () => h(UnorderedListOutlined), label: t('nav.tnvedClassifier') },
    { key: '/tnved/news', icon: () => h(FileTextOutlined), label: t('nav.news') },
    { key: '/tnved/regulations', icon: () => h(FileSearchOutlined), label: t('nav.npa') },
    { key: '/tnved/currencies', icon: () => h(DollarCircleOutlined), label: t('nav.currencies') },
    { key: '/tnved/timeline', icon: () => h(CalendarOutlined), label: t('nav.timeline') },
    // Отдельная подпись от «Аналитики» операций (аудит §8) — это статистика по кодам ТН ВЭД,
    // а не аналитика заявок/продаж.
    { key: '/tnved/analytics', icon: () => h(LineChartOutlined), label: t('nav.tnvedAnalytics') },
  ]

  if (authStore.hasPermission('tnved.manage')) {
    tnvedChildren.push({ key: '/tnved/sync', icon: () => h(SyncOutlined), label: t('nav.sync') })
  }

  if (!financeOnly && (role === 'administrator' || role === 'client' || authStore.hasPermission('references.read'))) {
    referenceItems.push({
      key: 'tnved-group',
      icon: () => h(GlobalOutlined),
      label: t('nav.tnved'),
      // Клиенту — справочная часть; хронология и аналитика справочника нужны только сотрудникам.
      children: role === 'client'
        ? tnvedChildren.filter((c) => ['/tnved/tree', '/tnved/news', '/tnved/regulations', '/tnved/currencies'].includes(c.key))
        : tnvedChildren,
    })
  }

  if (clientTransit) {
    referenceItems.push({
      key: '/my-documents',
      icon: () => h(FolderOpenOutlined),
      label: t('nav.myDocuments'),
    })
  }

  // ─── Администрирование ──────────────────────────────────
  // Профиль ушёл в меню пользователя в шапке (аудит §8) — раньше это был единственный пункт
  // «Администрирования» у большинства ролей, и группа не несла смысла.
  if (role === 'administrator') {
    adminItems.push({
      key: '/system/audit',
      icon: () => h(AuditOutlined),
      label: t('nav.audit'),
    })
  }

  if (authStore.hasPermission('users.write')) {
    adminItems.push({
      key: '/settings/organization',
      icon: () => h(BuildOutlined),
      label: t('nav.organization'),
    })
  }

  if (authStore.hasPermission('users.write')) {
    adminItems.push({
      key: '/users',
      icon: () => h(UserSwitchOutlined),
      label: t('nav.users'),
    })
  }

  if (authStore.hasPermission('users.read')) {
    adminItems.push({
      key: '/roles',
      icon: () => h(KeyOutlined),
      label: t('nav.roles'),
    })
  }

  if (authStore.hasPermission('endpoints.read')) {
    adminItems.push({
      key: '/system/endpoints',
      icon: () => h(ApiOutlined),
      label: t('nav.apiCatalog'),
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[] = []

  if (operationsItems.length) {
    groups.push({ key: 'group-operations', type: 'group', label: t('nav.operations'), children: operationsItems })
  }
  if (clientsItems.length) {
    groups.push({ key: 'group-clients', type: 'group', label: t('nav.clientsGroup'), children: clientsItems })
  }
  if (salesItems.length) {
    groups.push({ key: 'group-sales', type: 'group', label: t('nav.sales'), children: salesItems })
  }
  if (referenceItems.length) {
    groups.push({ key: 'group-references', type: 'group', label: t('nav.references'), children: referenceItems })
  }
  if (adminItems.length) {
    groups.push({ key: 'group-admin', type: 'group', label: t('nav.admin'), children: adminItems })
  }

  return groups
})

// Сквозной поиск (debounce 250 мс, показываем до 15 совпадений).
const searchTerm = ref('')
const searching = ref(false)
const searchOptions = ref<{ value: string; label: string }[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

const onSearch = (value: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  const term = value.trim()
  if (term.length < 2) {
    searchOptions.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const hits = await systemApi.search(term)
      searchOptions.value = hits.slice(0, 15).map((h) => ({
        value: h.url,
        label: `${h.title} — ${h.subtitle}`,
      }))
    } catch {
      searchOptions.value = []
    } finally {
      searching.value = false
    }
  }, 250)
}

const onSearchSelect = (url: string) => {
  searchTerm.value = ''
  searchOptions.value = []
  router.push(url)
}

// Аудит §10: бейдж в шапке показывал системный тип аккаунта («Импорт») одинаково у всех
// сотрудников — теперь показываем бизнес-роли (через enum.businessRole), администратору
// оставляем системную метку «Администратор».
const roleLabel = computed(() => {
  const role = (authStore.role || '').trim().toLowerCase()
  if (role === 'administrator') return formatRole(authStore.role || '')
  const roles = authStore.businessRoles?.length ? authStore.businessRoles : (authStore.businessRole ? [authStore.businessRole] : [])
  return roles.length ? roles.map((r) => businessRoleLabel(r)).join(', ') : formatRole(authStore.role || '')
})

function onOpenChange(keys: string[]) {
  openKeys.value = keys
}

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/tnved/')) openKeys.value = ['tnved-group']
  },
  { immediate: true },
)

const selectedMenuKey = computed(() => {
  if (route.path.startsWith('/dashboard')) return '/dashboard'
  if (route.path.startsWith('/analytics')) return '/analytics'
  if (route.path.startsWith('/my-documents')) return '/my-documents'
  if (route.path.startsWith('/clients')) return '/clients'
  if (route.path.startsWith('/document-packages')) return '/document-packages'
  // более специфичный /import-40/company — раньше общего /import-40, иначе его пункт не подсветится
  if (route.path.startsWith('/import-40/company')) return '/import-40/company'
  if (route.path.startsWith('/import-40/manage')) return '/import-40/manage'
  if (route.path.startsWith('/import-40')) return '/import-40'
  if (route.path.startsWith('/finance')) return '/finance'
  if (route.path.startsWith('/billing')) return '/billing'
  if (route.path.startsWith('/client-documents')) return '/client-documents'
  if (route.path.startsWith('/settings/organization')) return '/settings/organization'
  if (route.path.startsWith('/system/audit')) return '/system/audit'
  if (route.path.startsWith('/clients')) return '/clients'
  if (route.path.startsWith('/dt-guide')) return '/dt-guide'
  if (route.path.startsWith('/references')) return '/references'
  if (route.path.startsWith('/keden-status')) return '/keden-status'
  if (route.path.startsWith('/keden')) return '/keden'
  if (route.path.startsWith('/tnved/')) return route.path
  if (route.path.startsWith('/notifications')) return '/notifications'
  if (route.path.startsWith('/roles')) return '/roles'
  if (route.path.startsWith('/users')) return '/users'
  if (route.path.startsWith('/system/endpoints')) return '/system/endpoints'
  if (route.path.startsWith('/profile')) return '/profile'
  if (route.path.startsWith('/sales')) return '/sales'
  if (route.path.startsWith('/requests-registry')) return '/requests-registry'
  return '/reestr'
})

const handleMenuClick = ({ key }: { key: string }) => {
  router.push(key)
}

const handleMobileMenuClick = ({ key }: { key: string }) => {
  mobileNavOpen.value = false
  router.push(key)
}

const handleLogout = () => {
  mobileNavOpen.value = false
  notifStore.reset()
  authStore.logout()
  router.push('/login')
}

const handleUserMenuClick = ({ key }: { key: string }) => {
  if (key === 'logout') {
    handleLogout()
    return
  }
  router.push(key)
}
</script>

<style scoped>
/* ─── Shell ──────────────────────────────────────────────── */

.main-layout {
  min-height: 100vh;
}

.app-shell {
  background:
    linear-gradient(148deg, rgba(43, 188, 212, 0.04), transparent 26%),
    var(--atg-bg);
}

/* ─── Header ─────────────────────────────────────────────── */

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
  min-height: 64px;
  padding: 0 var(--sp-5, 24px);
  line-height: normal;
  background: linear-gradient(135deg, #1B2A4A 0%, #1E3060 60%, #243575 100%);
  border-bottom: 2px solid #2BBCD4;
  box-shadow: 0 2px 20px rgba(27, 42, 74, 0.5);
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  color: #f0f3ff;
  flex-shrink: 0;
}

.brand-text {
  min-width: 0;
}

.brand-title {
  display: block;
  color: #f0f3ff;
  font-family: var(--font-heading);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.brand-subtitle {
  display: block;
  margin-top: 3px;
  color: rgba(240, 243, 255, 0.48);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Header right */
.header-search { flex: 1; max-width: 420px; margin: 0 18px; }
@media (max-width: 900px) { .header-search { display: none; } }
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 0;
}

.username {
  color: rgba(240, 243, 255, 0.82);
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid rgba(43, 188, 212, 0.45);
  border-radius: 999px;
  color: #2BBCD4;
  background: rgba(43, 188, 212, 0.12);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Notifications */
.notif-badge :deep(.ant-badge-count) {
  box-shadow: none;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
}

.notif-btn {
  color: rgba(240, 243, 255, 0.75);
  border-color: rgba(240, 243, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  min-height: 36px;
  min-width: 36px;
  padding: 0;
  transition:
    color var(--atg-transition),
    border-color var(--atg-transition),
    background var(--atg-transition);
}

.notif-btn:hover {
  color: #1B2A4A !important;
  border-color: #2BBCD4 !important;
  background: #2BBCD4 !important;
}

.notif-dropdown {
  width: 320px;
  background: #fff;
  border-radius: var(--atg-radius-lg);
  border: 1px solid var(--atg-line);
  box-shadow: var(--atg-shadow-lg);
  overflow: hidden;
}

.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--atg-line);
}

.notif-title {
  font-size: 13px;
  font-weight: 750;
  color: var(--atg-ink);
  letter-spacing: -0.01em;
}

.notif-list {
  max-height: 360px;
  overflow-y: auto;
}

.notif-item {
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--atg-line);
  transition: background var(--atg-transition);
}

.notif-item:last-child {
  border-bottom: none;
}

.notif-item:hover {
  background: var(--atg-accent-soft);
}

.notif-item--unread {
  border-left: 3px solid var(--atg-teal);
  padding-left: 13px;
}

.notif-title-row {
  font-size: 13px;
  font-weight: 700;
  color: var(--atg-ink, #182640);
  line-height: 1.4;
  margin-bottom: 2px;
}

.notif-msg {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--atg-charcoal);
  line-height: 1.5;
}

.notif-code {
  display: inline-block;
  margin-top: 3px;
  padding: 1px 7px;
  background: var(--atg-teal-soft);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
  color: var(--atg-teal-dark);
  letter-spacing: 0.04em;
}

.notif-time {
  margin-top: 4px;
  font-size: 11px;
  color: var(--atg-muted);
}

.notif-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--atg-muted);
}

.notif-footer {
  border-top: 1px solid var(--atg-line);
  text-align: center;
}

.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(240, 243, 255, 0.14);
  border-radius: var(--atg-radius, 8px);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(240, 243, 255, 0.82);
  cursor: pointer;
  transition:
    color var(--atg-transition),
    border-color var(--atg-transition),
    background var(--atg-transition);
}

.user-menu-trigger:hover {
  color: #1B2A4A;
  border-color: #2BBCD4;
  background: #2BBCD4;
}

.user-menu-icon {
  font-size: 15px;
}

/* ─── Notifications ──────────────────────────────────────── */

.bell-btn {
  font-size: 18px;
  color: rgba(240, 243, 255, 0.82);
}

.bell-btn:hover,
.bell-btn:focus {
  color: #2bbcd4;
  background: rgba(255, 255, 255, 0.06);
}

.notif-dropdown {
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--atg-line);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(27, 42, 74, 0.12);
}

.notif-head {
  padding: 10px 14px;
  font-weight: 700;
  border-bottom: 1px solid var(--atg-line);
}

.notif-empty {
  padding: 18px;
  text-align: center;
  color: var(--atg-muted);
}

.notif-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--atg-line);
  cursor: pointer;
}

.notif-item:hover {
  background: var(--atg-bg);
}

.notif-unread {
  background: rgba(43, 188, 212, 0.06);
}

.notif-title {
  font-weight: 600;
  font-size: 13px;
}

.notif-body {
  font-size: 12px;
  color: var(--atg-charcoal);
  margin-top: 2px;
}

/* ─── Sider ──────────────────────────────────────────────── */

.sider {
  position: sticky;
  top: 64px;
  align-self: flex-start;
  height: calc(100vh - 64px);
  overflow: hidden;
  background: linear-gradient(180deg, #1B2A4A 0%, #132040 100%);
  border-right: 1px solid rgba(43, 188, 212, 0.14);
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 16px rgba(27, 42, 74, 0.25);
}

.sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  padding: 12px;
  height: calc(100vh - 64px);
}

.sider-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sider :deep(.ant-menu) {
  border-inline-end: 0;
  background: transparent;
  color: rgba(240, 243, 255, 0.6);
}

.sider :deep(.ant-menu-item-group-title) {
  padding: 12px 12px 4px;
  color: rgba(240, 243, 255, 0.38);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sider :deep(.ant-menu-item-group:first-child .ant-menu-item-group-title) {
  padding-top: 4px;
}

.sider :deep(.ant-menu-item) {
  height: 42px;
  margin: 3px 0;
  border-radius: 8px;
  color: rgba(240, 243, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
  transition:
    color var(--atg-transition),
    background var(--atg-transition);
}

.sider :deep(.ant-menu-item .anticon) {
  font-size: 16px;
  opacity: 0.8;
  transition: opacity var(--atg-transition);
}

.sider :deep(.ant-menu-item:hover) {
  color: #f0f3ff !important;
  background: rgba(240, 243, 255, 0.07) !important;
}

.sider :deep(.ant-menu-item:hover .anticon) {
  opacity: 1;
}

.sider :deep(.ant-menu-item-selected),
.sider :deep(.ant-menu-item-selected .ant-menu-title-content),
.sider :deep(.ant-menu-item-selected a) {
  color: #ffffff !important;
  font-weight: 700;
}

.sider :deep(.ant-menu-item-selected) {
  background: linear-gradient(90deg, #2BBCD4, #1FA8C0) !important;
  box-shadow: 0 2px 8px rgba(43, 188, 212, 0.35);
}

.sider :deep(.ant-menu-item-selected .anticon) {
  color: #ffffff !important;
  opacity: 1;
}

/* Фон раскрытого подменю (inline) — прозрачный, чтобы совпадал с navy-сайдбаром,
   а не выделялся почти-чёрным прямоугольником (страховка к darkSubMenuItemBg). */
.sider :deep(.ant-menu-sub),
.sider :deep(.ant-menu-sub.ant-menu-inline),
.sider :deep(.ant-menu.ant-menu-dark .ant-menu-sub) {
  background: transparent !important;
}

/* ─── Content ────────────────────────────────────────────── */

.content {
  min-height: calc(100vh - 68px);
  padding: 28px;
  background: transparent;
}

/* ─── Drawer menu ────────────────────────────────────────── */

.drawer-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-brand-title {
  font-size: 14px;
  font-weight: 700;
  color: #f0f3ff;
  line-height: 1.3;
}

.drawer-brand-sub {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(240, 243, 255, 0.45);
  margin-top: 2px;
}

.drawer-menu {
  border-inline-end: 0 !important;
  background: transparent !important;
  color: rgba(240, 243, 255, 0.6) !important;
}

.drawer-menu :deep(.ant-menu-item-group-title) {
  padding: 12px 12px 4px;
  color: rgba(240, 243, 255, 0.38);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.drawer-menu :deep(.ant-menu-item) {
  height: 44px;
  margin: 3px 0;
  border-radius: 8px;
  color: rgba(240, 243, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
}

.drawer-menu :deep(.ant-menu-item:hover) {
  color: #f0f3ff !important;
  background: rgba(240, 243, 255, 0.07) !important;
}

.drawer-menu :deep(.ant-menu-item-selected),
.drawer-menu :deep(.ant-menu-item-selected .ant-menu-title-content),
.drawer-menu :deep(.ant-menu-item-selected a),
.drawer-menu :deep(.ant-menu-item-selected .anticon) {
  color: #ffffff !important;
  font-weight: 700;
}

.drawer-menu :deep(.ant-menu-item-selected) {
  background: linear-gradient(90deg, #2BBCD4, #1FA8C0) !important;
}

.drawer-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px 12px 18px;
  border-top: 1px solid rgba(43, 188, 212, 0.18);
  background: #1B2A4A;
}

.drawer-footer-role {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #2BBCD4;
  margin-bottom: 2px;
}

.drawer-footer-user {
  font-size: 13px;
  font-weight: 600;
  color: rgba(240, 243, 255, 0.5);
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-logout {
  color: rgba(240, 243, 255, 0.7);
  border-color: rgba(240, 243, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}

.drawer-logout:hover {
  color: #1B2A4A !important;
  border-color: #2BBCD4 !important;
  background: #2BBCD4 !important;
}

/* ─── Responsive ─────────────────────────────────────────── */

@media (max-width: 860px) {
  .app-header {
    height: 60px;
    min-height: 60px;
    padding: 0 var(--sp-4, 16px);
  }

  .sider {
    display: none;
  }

  .content {
    padding: 16px;
    min-height: calc(100vh - 60px);
  }

  .role-badge,
  .username,
  .user-menu-trigger {
    display: none;
  }
}

@media (max-width: 480px) {
  .brand-subtitle {
    display: none;
  }

  .content {
    padding: 12px;
  }
}

.registration-banner {
  margin-bottom: 16px;
}
:deep(.menu-attn) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
:deep(.menu-attn-dot) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--z-gold, #C9A84C);
}
</style>
