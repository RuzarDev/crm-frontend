<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'
import ZSwitch from '@/components/z/ZSwitch.vue'
import ZTag from '@/components/z/ZTag.vue'
import { aiTnvedApi, type AiSettings, type AiTnvedStats } from '@/api/aiTnved'
import { resetAiTnvedStatus } from '@/components/aiTnved/aiTnved'
import { formatNumberIn } from '@/ui/number'
import { message } from '@/ui/message'

// Настройки ИИ (администратор, 17.10): провайдер и модель — только чтение (из настроек сервера: Ai__Provider, Ai__Model,
// Ai__ApiKey), «ИИ для клиентов», дневные лимиты и статистика подбора кода ТН ВЭД.
const { t, locale } = useI18n()

const settings = shallowRef<AiSettings | null>(null)
const state = ref<'loading' | 'error' | 'ready'>('loading')
const draft = reactive({ clientsEnabled: true, userDailyLimit: 30 as number | null, clientDailyLimit: 60 as number | null, totalDailyLimit: 1000 as number | null })
const apply = (s: AiSettings) => {
  settings.value = s
  Object.assign(draft, { clientsEnabled: s.clientsEnabled, userDailyLimit: s.userDailyLimit, clientDailyLimit: s.clientDailyLimit, totalDailyLimit: s.totalDailyLimit })
}
const load = async () => {
  state.value = 'loading'
  try {
    apply(await aiTnvedApi.settings())
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
  void loadStats()
}
void load()

const LIMITS = ['userDailyLimit', 'clientDailyLimit', 'totalDailyLimit'] as const
const valid = (v: number | null, max: number) => v != null && Number.isInteger(v) && v >= 0 && v <= max
const maxOf = (k: (typeof LIMITS)[number]) => (k === 'totalDailyLimit' ? 100000 : 10000)
const invalid = computed(() => LIMITS.some((k) => !valid(draft[k], maxOf(k))))
const changed = computed(() => {
  const s = settings.value
  return !!s && (s.clientsEnabled !== draft.clientsEnabled || LIMITS.some((k) => s[k] !== draft[k]))
})
const saving = ref(false)
const save = async () => {
  if (invalid.value || !changed.value || saving.value) return
  saving.value = true
  try {
    apply(await aiTnvedApi.saveSettings({
      clientsEnabled: draft.clientsEnabled, userDailyLimit: draft.userDailyLimit!, clientDailyLimit: draft.clientDailyLimit!,
      totalDailyLimit: draft.totalDailyLimit!,
    }))
    resetAiTnvedStatus()
    message.success(t('aiSettings.saved'))
  } catch { /* общий перехватчик */ } finally {
    saving.value = false
  }
}

// ---- Статистика ----
const days = ref(30)
const stats = shallowRef<AiTnvedStats | null>(null)
const statsState = ref<'loading' | 'error' | 'ready'>('loading')
let statsSeq = 0
const loadStats = async () => {
  const my = ++statsSeq
  statsState.value = 'loading'
  try {
    const res = await aiTnvedApi.stats(days.value)
    if (my !== statsSeq) return
    stats.value = res
    statsState.value = 'ready'
  } catch {
    if (my === statsSeq) statsState.value = 'error'
  }
}
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—')
const num = (n: number) => formatNumberIn(locale.value, n, 0)
const tiles = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { key: 'requests', value: num(s.requests), sub: t('aiSettings.stats.today', { n: num(s.requestsToday) }) },
    { key: 'aiAnswered', value: num(s.aiAnswered), sub: t('aiSettings.stats.cached', { n: num(s.cached) }) },
    { key: 'fallback', value: num(s.fallback), sub: '' },
    { key: 'selectedFirst', value: num(s.selectedFirst), sub: pct(s.selectedFirst, s.withAnswer) },
    { key: 'selectedAny', value: num(s.selectedAny), sub: pct(s.selectedAny, s.withAnswer) },
    { key: 'tokens', value: num(s.inputTokens + s.outputTokens), sub: t('aiSettings.stats.tokensSplit', { input: num(s.inputTokens), output: num(s.outputTokens) }) },
  ]
})
const dayOptions = computed(() => [7, 30, 90].map((d) => ({ value: d, label: t('aiSettings.stats.days', { n: d }) })))

const card = 'flex max-w-[44rem] flex-col rounded-panel border border-line bg-surface'
const rowCls = 'flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-b-0 max-sm:px-4'
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4" data-ai-settings-page>
    <div class="min-w-0">
      <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('aiSettings.title') }}</h1>
      <p class="m-0 mt-1 max-w-[46rem] text-sm text-muted">{{ t('aiSettings.lead') }}</p>
    </div>

    <div v-if="state === 'error'" role="alert" class="flex max-w-[44rem] flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-ai-settings-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('aiSettings.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" @click="load">{{ t('aiSettings.retry') }}</ZButton>
    </div>
    <div v-else-if="state === 'loading'" class="max-w-[44rem] rounded-panel border border-line bg-surface p-5"><ZSkeleton :lines="6" height="18px" /></div>

    <template v-else-if="settings">
      <section :class="card" aria-labelledby="ai-provider-title" data-ai-provider>
        <div :class="rowCls">
          <h2 id="ai-provider-title" class="m-0 min-w-0 flex-1 text-md font-semibold text-ink">{{ t('aiSettings.provider') }}</h2>
          <ZTag :tone="settings.configured ? 'done' : 'neutral'" data-ai-configured>{{ t(settings.configured ? 'aiSettings.on' : 'aiSettings.off') }}</ZTag>
        </div>
        <dl class="m-0 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-5 py-3 text-sm max-sm:grid-cols-1 max-sm:px-4">
          <dt class="text-muted">{{ t('aiSettings.providerName') }}</dt>
          <dd class="m-0 break-words text-ink" data-ai-provider-name>{{ settings.provider }}</dd>
          <dt class="text-muted">{{ t('aiSettings.model') }}</dt>
          <dd class="m-0 font-mono break-words text-ink">{{ settings.model || '—' }}</dd>
          <template v-if="settings.baseUrlHost">
            <dt class="text-muted">{{ t('aiSettings.server') }}</dt>
            <dd class="m-0 font-mono break-words text-ink">{{ settings.baseUrlHost }}</dd>
          </template>
        </dl>
        <p class="m-0 border-0 border-t border-solid border-line px-5 py-3 text-[13px] text-ink-3 max-sm:px-4">
          {{ t(settings.configured ? 'aiSettings.readOnlyHint' : 'aiSettings.offHint') }}
        </p>
      </section>

      <form :class="card" novalidate data-ai-settings-form @submit.prevent="save">
        <div :class="rowCls">
          <label for="ai-clients" class="min-w-0 flex-1 text-sm">
            <span class="block font-medium text-ink">{{ t('aiSettings.clientsEnabled') }}</span>
            <span class="block text-xs text-muted">{{ t('aiSettings.clientsEnabledHint') }}</span>
          </label>
          <ZSwitch id="ai-clients" v-model:checked="draft.clientsEnabled" class="max-sm:min-h-11" data-ai-clients />
        </div>
        <div v-for="k in LIMITS" :key="k" :class="rowCls" :data-ai-limit="k">
          <label :for="`ai-${k}`" class="min-w-0 flex-1 text-sm">
            <span class="block font-medium text-ink">{{ t(`aiSettings.limits.${k}`) }}</span>
            <span class="block text-xs text-muted">{{ t(`aiSettings.limits.${k}Hint`) }}</span>
            <span v-if="!valid(draft[k], maxOf(k))" class="block text-xs text-tone-danger-fg" data-ai-limit-error>{{ t('aiSettings.limits.invalid', { max: num(maxOf(k)) }) }}</span>
          </label>
          <ZNumber :id="`ai-${k}`" v-model:value="draft[k]" :min="0" :max="maxOf(k)" :precision="0" class="w-32 max-sm:h-11" :data-ai-limit-input="k" />
        </div>
        <div class="flex flex-wrap justify-end gap-2 px-5 py-3 max-sm:px-4">
          <ZButton variant="primary" html-type="submit" :loading="saving" :disabled="!changed || invalid" class="max-sm:h-11 max-sm:flex-1" data-ai-settings-save>
            {{ t('aiSettings.save') }}
          </ZButton>
        </div>
      </form>

      <section :class="card" aria-labelledby="ai-stats-title" data-ai-stats>
        <div :class="rowCls">
          <h2 id="ai-stats-title" class="m-0 min-w-0 flex-1 text-md font-semibold text-ink">{{ t('aiSettings.stats.title') }}</h2>
          <ZSegmented :value="days" :options="dayOptions" :aria-label="t('aiSettings.stats.period')" data-ai-stats-days @update:value="days = Number($event); loadStats()" />
        </div>
        <p v-if="statsState === 'error'" class="m-0 px-5 py-3 text-sm text-ink-2 max-sm:px-4" role="alert">
          {{ t('aiSettings.loadError') }} <ZButton size="sm" class="ml-2 max-sm:h-11" @click="loadStats">{{ t('aiSettings.retry') }}</ZButton>
        </p>
        <div v-else-if="statsState === 'loading'" class="p-5"><ZSkeleton :lines="3" height="18px" /></div>
        <dl v-else class="m-0 grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
          <div v-for="tile in tiles" :key="tile.key" class="flex flex-col gap-0.5 bg-surface px-5 py-3 max-sm:px-4" :data-ai-stat="tile.key">
            <dt class="text-xs text-muted">{{ t(`aiSettings.stats.${tile.key}`) }}</dt>
            <dd class="m-0 text-xl font-semibold text-ink tabular-nums">{{ tile.value }}</dd>
            <dd v-if="tile.sub" class="m-0 text-xs text-muted tabular-nums">{{ tile.sub }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>
