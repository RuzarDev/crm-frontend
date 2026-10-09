<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ZAlert from '@/components/z/ZAlert.vue'
import ZAvatar from '@/components/z/ZAvatar.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import { businessRoleLabel } from '@/api/permissions'
import { setLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import DeclarantCard from './DeclarantCard.vue'
import PasswordCard from './PasswordCard.vue'
import PersonalCard from './PersonalCard.vue'
import ProfileCard from './ProfileCard.vue'
import { profileSections, type ProfileCard as CardKey } from './profileSections'

// «Профиль» (редизайн, волна 5б, доска Profile): шапка с инициалами и карточки, у каждой своя кнопка «Сохранить».
// Какие карточки видит пользователь — profileSections. Вход по временному паролю: сверху плашка, карточка пароля
// первой, остальные закрыты до смены (сервер до тех пор их всё равно не отдаёт).
const { t, locale } = useI18n()
const auth = useAuthStore()
const profile = useProfileStore()
const route = useRoute()
const router = useRouter()

const sections = computed(() => profileSections({
  role: auth.role ?? '',
  hasPermission: auth.hasPermission,
  clientHasModule: auth.clientHasModule,
  mustChangePassword: auth.mustChangePassword,
  passwordFirst: route.query.tab === 'password',
}))
// Профиль не загрузился: при временном пароле сменить его всё равно можно (иначе тупик), остальное — после повтора.
const cards = computed<CardKey[]>(() => (profile.profile ? sections.value.cards : sections.value.locked ? ['password'] : []))
const isLocked = (c: CardKey) => sections.value.locked && c !== 'password'

onMounted(async () => {
  const loading = profile.profile ? Promise.resolve() : profile.fetch()
  if (route.query.tab === 'password') {
    await nextTick()
    root.value?.querySelector<HTMLInputElement>('[data-password="current"]')?.focus()
  }
  await loading
})
const root = ref<HTMLElement | null>(null)

// ---- Шапка ----
const systemLabel = computed(() => {
  const key = (auth.role ?? '').trim().toLowerCase()
  return key && t(`enum.systemRole.${key}`) !== `enum.systemRole.${key}` ? t(`enum.systemRole.${key}`) : (auth.role ?? '')
})
// Сотруднику — его бизнес-роли (тип аккаунта «Импорт»/«Брокер» ничего ему не говорит); администратору и клиенту — тип.
const roleText = computed(() => {
  const role = (auth.role ?? '').trim().toLowerCase()
  if (role === 'administrator' || role === 'client') return systemLabel.value
  const roles = auth.businessRoles?.length ? auth.businessRoles : auth.businessRole ? [auth.businessRole] : []
  return roles.length ? roles.map(businessRoleLabel).join(', ') : systemLabel.value
})
const displayName = computed(() => profile.profile?.displayName?.trim() || profile.profile?.username || auth.username || '')
const metaLine = computed(() =>
  [profile.profile?.username ?? auth.username, roleText.value, profile.profile?.companyName?.trim()].filter(Boolean).join(' · '))

// ---- Язык ----
const langOptions = computed(() => SUPPORTED_LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) })))
const onLocale = (v: unknown) => { if (typeof v === 'string') void setLocale(v as AppLocale) }

const cardTitle = (c: CardKey) => t(`personal.profile.${c}.title`)
</script>

<template>
  <div ref="root" class="flex min-w-0 max-w-[48rem] flex-col gap-4" data-profile-page>
    <h1 class="sr-only">{{ t('shell.page.profile') }}</h1>

    <ZAlert v-if="sections.locked" type="warning" show-icon :message="t('personal.mustChange.text')" data-must-change />

    <div v-if="profile.loadError && !profile.profile" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-profile-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('personal.profile.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-profile-retry @click="profile.fetch()">{{ t('personal.profile.retry') }}</ZButton>
    </div>
    <div v-else-if="profile.loading && !profile.profile" class="flex items-center gap-4 rounded-panel border border-line bg-surface p-5" data-profile-skeleton>
      <ZSkeleton width="56px" height="56px" />
      <ZSkeleton class="flex-1" :lines="2" height="16px" />
    </div>
    <div v-else-if="profile.profile" class="flex min-w-0 items-center gap-4" data-profile-head>
      <ZAvatar :name="displayName" class="size-14 rounded-panel text-lg" />
      <div class="min-w-0">
        <p class="m-0 truncate text-lg font-semibold text-ink" data-profile-name>{{ displayName }}</p>
        <p class="m-0 text-sm text-muted [overflow-wrap:anywhere]" data-profile-meta>{{ metaLine }}</p>
      </div>
    </div>

    <template v-for="c in cards" :key="c">
      <section
        v-if="isLocked(c)"
        class="rounded-panel border border-line bg-surface p-5 opacity-60 max-sm:p-4"
        :aria-label="cardTitle(c)"
        :data-profile-card="c"
        data-locked
      >
        <h2 class="m-0 text-base font-semibold text-ink">{{ cardTitle(c) }}</h2>
        <p class="m-0 mt-1 text-sm text-muted">{{ t('personal.profile.locked') }}</p>
      </section>
      <PersonalCard v-else-if="c === 'personal'" :company-fields="sections.companyFields" />
      <ProfileCard v-else-if="c === 'company'" :title="cardTitle('company')" data-profile-card="company">
        <p class="m-0 text-sm text-ink-2">{{ t('personal.profile.company.hint') }}</p>
        <div>
          <ZButton variant="primary" class="max-sm:h-11 max-sm:w-full" data-open-company @click="router.push('/import-40/company')">{{ t('personal.profile.company.open') }}</ZButton>
        </div>
      </ProfileCard>
      <DeclarantCard v-else-if="c === 'declarant'" />
      <ProfileCard v-else-if="c === 'language'" :title="cardTitle('language')" data-profile-card="language">
        <ZField :label="t('personal.profile.language.label')">
          <ZSegmented :value="locale" :options="langOptions" data-language @update:value="onLocale" />
        </ZField>
      </ProfileCard>
      <PasswordCard v-else-if="c === 'password'" />
    </template>
  </div>
</template>
