<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ZirconLogo from '@/components/shell/ZirconLogo.vue'
import LangSegment from '@/components/auth/LangSegment.vue'
import { privacyApi, type PrivacyOperator } from '@/api/privacy'
import { OPERATOR_FALLBACK, policyFor } from '@/views/privacy/policy'

// Политика конфиденциальности (30.10.2026, боевой запуск) — публичная страница /privacy, открывается без входа,
// в стиле /verify. Текст — на языке интерфейса (policy.ts); оператор и контакты — из «Настройки → Организация»
// (privacy/operator), без ответа — название и БИН по умолчанию.
const { t, locale } = useI18n()
const policy = computed(() => policyFor(locale.value))

const operator = ref<PrivacyOperator | null>(null)
onMounted(async () => {
  try { operator.value = await privacyApi.operator() } catch { /* остаются реквизиты по умолчанию */ }
})
const operatorRows = computed(() => {
  const o = operator.value
  return ([
    [t('privacy.bin'), o?.bin ?? OPERATOR_FALLBACK.bin],
    [t('privacy.address'), o?.legalAddress],
    [t('privacy.email'), o?.email],
    [t('privacy.phone'), o?.phone],
  ] as [string, string | null | undefined][]).filter(([, v]) => v) as [string, string][]
})
const operatorName = computed(() => operator.value?.companyName ?? OPERATOR_FALLBACK.companyName)

// Оглавление: прокрутка к разделу без смены адреса (адрес страницы — один, ссылку на /privacy дают целиком).
const scrollTo = (id: string) => document.getElementById(`privacy-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
</script>

<template>
  <div class="min-h-dvh bg-canvas px-4 py-6 sm:py-10" data-privacy-page>
    <div class="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <header class="flex items-center justify-between gap-3">
        <ZirconLogo size="md" />
        <LangSegment />
      </header>

      <article class="flex flex-col gap-6 rounded-panel border border-line bg-surface p-8 max-sm:p-5">
        <div class="flex flex-col gap-2">
          <h1 class="m-0 text-balance text-[26px] leading-[1.25] font-semibold tracking-[-0.015em] text-ink max-sm:text-[22px]">{{ policy.title }}</h1>
          <p class="m-0 text-sm text-ink-3" data-privacy-edition>{{ policy.edition }}</p>
        </div>
        <p class="m-0 text-[15px] leading-[1.6] text-ink-2">{{ policy.lead }}</p>

        <section class="flex flex-col gap-2 rounded-row border border-line bg-canvas px-5 py-4" data-privacy-operator>
          <h2 class="m-0 text-sm font-semibold text-ink-3">{{ t('privacy.operator') }}</h2>
          <p class="m-0 text-base font-semibold text-ink">{{ operatorName }}</p>
          <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm max-sm:grid-cols-1">
            <template v-for="[label, value] in operatorRows" :key="label">
              <dt class="text-ink-3">{{ label }}</dt>
              <dd class="m-0 break-words text-ink max-sm:mb-1.5">{{ value }}</dd>
            </template>
          </dl>
        </section>

        <nav :aria-label="t('privacy.contents')" class="flex flex-col gap-2">
          <h2 class="m-0 text-sm font-semibold text-ink-3">{{ t('privacy.contents') }}</h2>
          <ol class="m-0 list-none columns-2 gap-x-6 p-0 text-sm max-sm:columns-1">
            <li v-for="s in policy.sections" :key="s.id" class="mb-1 break-inside-avoid">
              <a
                :href="`#privacy-${s.id}`"
                class="rounded-[4px] text-zircon-ink underline-offset-2 outline-hidden hover:underline focus-visible:shadow-focus"
                @click.prevent="scrollTo(s.id)"
              >{{ s.title }}</a>
            </li>
          </ol>
        </nav>

        <section
          v-for="s in policy.sections"
          :id="`privacy-${s.id}`"
          :key="s.id"
          class="flex scroll-mt-6 flex-col gap-3"
          :data-privacy-section="s.id"
        >
          <h2 class="m-0 text-lg leading-[1.35] font-semibold text-ink">{{ s.title }}</h2>
          <template v-for="(block, i) in s.body" :key="i">
            <ul v-if="Array.isArray(block)" class="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[1.6] text-ink-2">
              <li v-for="(item, j) in block" :key="j" class="list-disc">{{ item }}</li>
            </ul>
            <p v-else class="m-0 text-[15px] leading-[1.6] text-ink-2">{{ block }}</p>
          </template>
        </section>
      </article>
    </div>
  </div>
</template>
