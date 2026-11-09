<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhWarningCircle } from '@phosphor-icons/vue'
import { systemApi } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { calendarLocale } from '@/ui/date'
import { useBlock } from '@/views/home/useBlock'
import { canSeeServiceHealth, formatSince, serviceAlerts, type ServiceAlert } from '@/views/home/serviceHealth'

// Плашка «сервис не работает» на «Главной» администратора и РОП (09.11.2026): сервер раз в 15 минут проверяет ключ ИИ
// и Zircon AI; сбой подтверждён (2 неудачи подряд) — красная строка с временем начала и причиной. Сбоя нет, запрос не
// прошёл или роль другая — ничего не показываем (на «Главной» не должно быть тревоги без причины).
const { t, locale } = useI18n()
const auth = useAuthStore()

const health = useBlock(canSeeServiceHealth(auth), () => systemApi.serviceHealth())
onMounted(() => { void health.load() })

const alerts = computed(() => serviceAlerts(health.data?.checks))
const noEmails = computed(() => health.data?.alertEmailsConfigured === false)
// Адреса меняют те, кому открыта «Настройки → Организация» на запись (как OrganizationPage).
const canEditOrg = computed(() => auth.hasPermission('finance.write') || auth.hasPermission('users.write'))

const lineOf = (a: ServiceAlert) =>
  t(a.lineKey, { since: formatSince(a.since, calendarLocale(locale.value)) || '—', reason: t(a.kindKey) })
</script>

<template>
  <section
    v-if="alerts.length"
    role="alert"
    data-home-service-health
    class="flex items-start gap-3 rounded-panel border border-[#F6D2D4] bg-tone-danger-bg px-4 py-3"
  >
    <PhWarningCircle :size="18" weight="fill" aria-hidden="true" class="mt-0.5 shrink-0 text-danger" />
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <div v-for="a in alerts" :key="a.name" :data-service="a.name" class="min-w-0">
        <p class="m-0 text-sm font-semibold text-tone-danger-fg [overflow-wrap:anywhere]" data-service-line>{{ lineOf(a) }}</p>
        <p v-if="a.error" class="m-0 font-mono text-[12.5px] text-ink-2 [overflow-wrap:anywhere]" data-service-error>{{ a.error }}</p>
      </div>
      <p class="m-0 text-[13px] text-ink-2" data-service-hint>
        <template v-if="noEmails">
          {{ t('home.serviceHealth.noEmails') }}
          <RouterLink v-if="canEditOrg" to="/settings/organization" class="font-medium text-zircon-ink underline-offset-2 hover:underline" data-service-settings>
            {{ t('home.serviceHealth.settings') }}
          </RouterLink>
        </template>
        <template v-else>{{ t('home.serviceHealth.emailed') }}</template>
      </p>
    </div>
  </section>
</template>
