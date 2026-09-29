<!-- Подсказка под полем «Торговая марка» (гр.31): знак из ТРОИС (таможенный реестр ОИС, выгрузка КЕДЕН).
     Только информирует: признак ОИС (гр.33) не ставится и ДТ не блокируется. -->
<template>
  <div v-if="lines.length" class="trois-hint">
    <div v-for="(l, i) in lines" :key="i" :class="['trois-line', l.kind]" :title="l.title">{{ l.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTroisCheck } from '@/composables/useTroisCheck'
import { troisDate, troisTrustedShort, type TroisItem } from '@/api/trois'

const props = defineProps<{ name?: string | null }>()
const { t } = useI18n()
const trois = useTroisCheck()

interface Line { kind: 'warn' | 'info' | 'quiet'; text: string; title?: string }

const inactiveReason = (m: TroisItem) =>
  (m.status ?? '').toLowerCase().startsWith('действительн')
    ? t('dt.troisReasonExpired', { date: troisDate(m.validUntil) })
    : t('dt.troisReasonSuspended')

const short = (m: TroisItem) => `№ ${m.registrationNumber}${m.objectName ? ` ${m.objectName}` : ''}`

const lines = computed<Line[]>(() => {
  const res = trois?.resultFor(props.name)
  if (!res?.checked) return []
  const exact = res.matches.filter((m) => m.match === 'exact')
  const similar = res.matches.filter((m) => m.match === 'similar')
  const holder = res.matches.filter((m) => m.match === 'holder')
  if (!res.matches.length) return [{ kind: 'quiet', text: t('dt.troisNone') }]

  const out: Line[] = []
  const active = exact.find((m) => m.isActive)
  if (active) {
    const persons = troisTrustedShort(active.trustedPersons)
    out.push({
      kind: 'warn',
      text: persons
        ? t('dt.troisExact', { no: active.registrationNumber, holder: active.rightHolder ?? '—', until: troisDate(active.validUntil), persons })
        : t('dt.troisExactNoPersons', { no: active.registrationNumber, holder: active.rightHolder ?? '—', until: troisDate(active.validUntil) }),
    })
  }
  for (const m of exact.filter((x) => !x.isActive))
    out.push({ kind: 'quiet', text: t('dt.troisInactive', { no: m.registrationNumber, reason: inactiveReason(m) }) })
  const simActive = similar.filter((m) => m.isActive)
  if (simActive.length)
    out.push({
      kind: 'info', text: t('dt.troisSimilar', { list: simActive.map(short).join('; ') }),
      title: simActive.map((m) => `${short(m)} — ${m.rightHolder ?? ''}`).join('\n'),
    })
  const holderActive = holder.filter((m) => m.isActive)
  if (holderActive.length)
    out.push({
      kind: 'info', text: t('dt.troisHolder', { list: holderActive.map((m) => `№ ${m.registrationNumber} (${m.rightHolder ?? ''})`).join('; ') }),
      title: holderActive.map((m) => `№ ${m.registrationNumber} — ${m.rightHolder ?? ''}`).join('\n'),
    })
  // Совпадения есть, но все недействующие/слабые: тихая строка «не найден среди действующих».
  if (!out.length) out.push({ kind: 'quiet', text: t('dt.troisNone') })
  return out
})
</script>

<style scoped>
.trois-hint { margin-top: 4px; line-height: 1.4; }
.trois-line { font-size: 12px; }
.trois-line.warn { color: var(--z-warning, #8a6410); background: var(--z-warning-soft, #fdf1d8); border-radius: var(--r-sm, 6px); padding: 3px 8px; font-weight: 500; }
.trois-line.info { color: var(--z-muted, #8c95a6); }
.trois-line.quiet { color: var(--z-muted, #8c95a6); opacity: 0.85; }
.trois-line + .trois-line { margin-top: 2px; }
</style>
