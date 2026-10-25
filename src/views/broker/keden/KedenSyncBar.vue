<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWarningCircle } from '@phosphor-icons/vue'
import ZAlert from '@/components/z/ZAlert.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import { kedenApi, type KedenSyncStatusDto } from '@/api/keden'
import { SYNC_REFRESH_MS, almatyStamp, isPermanentSyncError, lastPollAt, parseUtc, syncTime } from './kedenSync'

// Строка состояния kedenlogger над списком КЕДЕН (23.10.2026: постоянная сессия, опрос ДТ раз в 3 минуты, письма о
// смене статуса). Спрашивает GET sync-status при открытии и раз в минуту, пока экран открыт; в скрытой вкладке —
// не спрашивает (вернулись — сразу обновляет). stale — жёлтая плашка: данным в списке нельзя доверять.
// Нет права (403) или сервер ещё без маршрута (404) — строки нет и опрос прекращается; сбой сети/5xx — остаётся
// прежнее состояние до следующего раза. Время — по Алматы; последняя ошибка kedenlogger — в подсказке.
const { t } = useI18n()

const status = shallowRef<KedenSyncStatusDto | null>(null)
const now = ref(Date.now())
const off = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
let busy = false
let alive = true

const stopTimer = () => {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}

async function load() {
  if (off.value || busy || !alive) return
  busy = true
  try {
    const res = await kedenApi.syncStatus()
    if (alive) status.value = res
  } catch (e) {
    if (isPermanentSyncError(e)) {
      off.value = true
      status.value = null
      stopTimer()
    } else if (import.meta.env.DEV) console.error(e)
  } finally {
    busy = false
    now.value = Date.now()
  }
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
const tick = () => {
  now.value = Date.now()
  if (!hidden()) void load()
}
const onVisibility = () => { if (!hidden()) void load() }

onMounted(() => {
  void load()
  timer = setInterval(tick, SYNC_REFRESH_MS)
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  alive = false
  stopTimer()
  document.removeEventListener('visibilitychange', onVisibility)
})

const pollAt = computed(() => (status.value ? lastPollAt(status.value) : null))
const loginAt = computed(() => parseUtc(status.value?.lastLoginAtUtc))
const stale = computed(() => !!status.value?.stale)
const lastError = computed(() => status.value?.lastError?.trim() || '')

const when = (ms: number): string => {
  const s = syncTime(ms, now.value)
  if (s.kind === 'now') return t('broker.keden.sync.justNow')
  if (s.kind === 'ago') return t('broker.keden.sync.minAgo', { n: s.minutes })
  return s.text
}

const line = computed(() => {
  const parts = [
    pollAt.value === null ? t('broker.keden.sync.never') : t('broker.keden.sync.updated', { time: when(pollAt.value) }),
    t('broker.keden.sync.interval'),
  ]
  if (loginAt.value !== null) parts.push(t('broker.keden.sync.login', { time: when(loginAt.value) }))
  return parts.join(' · ')
})

// Подсказка: точное время (строка показывает «N мин назад»), счётчики и последняя ошибка.
const tip = computed(() => {
  const s = status.value
  if (!s) return ''
  const full = parseUtc(s.lastFullSyncAtUtc)
  const parts = [t('broker.keden.sync.tipTz')]
  if (pollAt.value !== null) parts.push(t('broker.keden.sync.tipPoll', { time: almatyStamp(pollAt.value) }))
  if (full !== null) parts.push(t('broker.keden.sync.tipFull', { time: almatyStamp(full) }))
  if (loginAt.value !== null) parts.push(t('broker.keden.sync.tipLogin', { time: almatyStamp(loginAt.value) }))
  parts.push(t('broker.keden.sync.tipCounts', { dt: s.dtCount ?? '—', logins: s.logins ?? '—', refreshes: s.refreshes ?? '—' }))
  if (lastError.value) parts.push(t('broker.keden.sync.tipError', { error: lastError.value }))
  return parts.join('. ')
})
</script>

<template>
  <div v-if="status" class="flex flex-col gap-2" data-keden-sync>
    <div class="flex min-w-0">
      <ZTooltip :title="tip">
        <p
          tabindex="0"
          class="m-0 inline-flex min-w-0 items-start gap-1.5 rounded-field text-[12.5px] leading-5 text-ink-3 outline-hidden focus-visible:shadow-focus"
          data-keden-sync-line
        >
          <span aria-hidden="true" :class="['mt-[6.5px] size-[7px] shrink-0 rounded-pill', stale ? 'bg-gold-ink' : 'bg-tone-done-fg']" />
          <span class="min-w-0 [overflow-wrap:anywhere]" data-keden-sync-text>{{ line }}</span>
          <PhWarningCircle v-if="lastError" :size="15" weight="fill" aria-hidden="true" class="mt-[2.5px] shrink-0 text-gold-ink" data-keden-sync-error />
        </p>
      </ZTooltip>
    </div>
    <ZAlert v-if="stale" type="warning" show-icon data-keden-sync-stale>{{ t('broker.keden.sync.stale') }}</ZAlert>
  </div>
</template>
