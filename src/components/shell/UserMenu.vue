<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhSignOut, PhUserCircle } from '@phosphor-icons/vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { useNotificationsStore } from '@/stores/notifications'
import { businessRoleLabel } from '@/api/permissions'
import { formatRole } from '@/utils/labels'
import { homeAttention } from '@/shell/attention'
import { shortName } from '@/shell/shortName'
import { cn } from '@/ui/cn'

// Меню пользователя в шапке: аватар и «Айгерим К.», в меню — полное имя, роль, «Профиль» и «Выйти».
// compact — только аватар (имя остаётся для чтения с экрана); ниже sm имя тоже скрыто.
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const notifStore = useNotificationsStore()

const displayName = computed(() => profileStore.profile?.displayName?.trim() || authStore.username || '')
const short = computed(() => shortName(displayName.value))

// Роль клиенту ни о чём не говорит — это его собственный кабинет (аудит 5.23). Сотрудникам — бизнес-роли
// (аудит §10), администратору — системная метка «Администратор».
const roleLine = computed(() => {
  const role = (authStore.role || '').trim().toLowerCase()
  if (role === 'client') return ''
  if (role === 'administrator') return formatRole(authStore.role || '')
  const roles = authStore.businessRoles?.length ? authStore.businessRoles : (authStore.businessRole ? [authStore.businessRole] : [])
  return roles.length ? roles.map((r) => businessRoleLabel(r)).join(', ') : formatRole(authStore.role || '')
})

const items = computed<ZDropdownItem[]>(() => [
  { key: 'profile', label: t('shell.user.profile'), icon: PhUserCircle },
  { key: 'logout', label: t('shell.user.logout'), icon: PhSignOut, divider: true },
])

const triggerClass = computed(() => cn(
  'flex h-[34px] max-w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-field border-0 bg-transparent px-1.5 font-sans text-ink',
  'outline-hidden transition-colors duration-150 ease-out hover:bg-sunken focus-visible:shadow-focus data-[state=open]:bg-sunken motion-reduce:transition-none',
  props.compact && 'w-[34px] justify-center px-0',
))

const onSelect = (key: string) => {
  if (key === 'profile') {
    void router.push('/profile')
    return
  }
  if (key === 'logout') {
    // Следующий на этом устройстве не должен увидеть чужие уведомления, бейдж «Требует внимания» и имя.
    notifStore.reset()
    profileStore.reset()
    homeAttention.value = null
    authStore.logout()
    void router.push('/login')
  }
}
</script>

<template>
  <ZDropdown :items="items" @select="onSelect">
    <button type="button" :class="triggerClass">
      <ZAvatar size="sm" :name="displayName" />
      <span class="sr-only">{{ t('shell.user.menu') }}: </span>
      <span
        data-user-name
        :class="cn('min-w-0 truncate text-[13px] font-medium text-ink', compact ? 'sr-only' : 'max-sm:sr-only')"
      >{{ short }}</span>
    </button>
    <template #header>
      <span class="block max-w-60 truncate text-[13px] font-semibold text-ink">{{ displayName }}</span>
      <span v-if="roleLine" class="mt-0.5 block max-w-60 truncate">{{ roleLine }}</span>
    </template>
  </ZDropdown>
</template>
