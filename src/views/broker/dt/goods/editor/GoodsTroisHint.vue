<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTroisCheck } from '@/composables/useTroisCheck'
import { troisDate, troisTrustedShort, type TroisItem } from '@/api/trois'

// Под «Торговой маркой» (гр. 31): знак из ТРОИС (таможенный реестр ОИС, выгрузка КЕДЕН) по пакетной проверке марок
// (провайдер — редактор товара). Только информирует: признак ОИС (гр. 33) не ставится и ДТ не блокируется.
// Перенос TroisTrademarkHint (правила строк те же): точное действующее совпадение — предупреждение, похожие и по
// правообладателю — справка, недействующие — тихо.
const props = defineProps<{ name?: string | null }>()
const { t } = useI18n()
const tt = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.trois.${key}`, p ?? {})
const trois = useTroisCheck()

interface Line { kind: 'warn' | 'info' | 'quiet'; text: string; title?: string }

const inactiveReason = (m: TroisItem) =>
  (m.status ?? '').toLowerCase().startsWith('действительн')
    ? tt('reasonExpired', { date: troisDate(m.validUntil) })
    : tt('reasonSuspended')
const short = (m: TroisItem) => `№ ${m.registrationNumber}${m.objectName ? ` ${m.objectName}` : ''}`

const lines = computed<Line[]>(() => {
  const res = trois?.resultFor(props.name)
  if (!res?.checked) return []
  if (!res.matches.length) return [{ kind: 'quiet', text: tt('none') }]
  const exact = res.matches.filter((m) => m.match === 'exact')
  const out: Line[] = []
  const active = exact.find((m) => m.isActive)
  if (active) {
    const persons = troisTrustedShort(active.trustedPersons)
    const p = { no: active.registrationNumber, holder: active.rightHolder ?? '—', until: troisDate(active.validUntil) }
    out.push({ kind: 'warn', text: persons ? tt('exact', { ...p, persons }) : tt('exactNoPersons', p) })
  }
  for (const m of exact.filter((x) => !x.isActive)) out.push({ kind: 'quiet', text: tt('inactive', { no: m.registrationNumber, reason: inactiveReason(m) }) })
  const similar = res.matches.filter((m) => m.match === 'similar' && m.isActive)
  if (similar.length) {
    out.push({
      kind: 'info',
      text: tt('similar', { list: similar.map(short).join('; ') }),
      title: similar.map((m) => `${short(m)} — ${m.rightHolder ?? ''}`).join('\n'),
    })
  }
  const holder = res.matches.filter((m) => m.match === 'holder' && m.isActive)
  if (holder.length) {
    out.push({
      kind: 'info',
      text: tt('holder', { list: holder.map((m) => `№ ${m.registrationNumber} (${m.rightHolder ?? ''})`).join('; ') }),
      title: holder.map((m) => `№ ${m.registrationNumber} — ${m.rightHolder ?? ''}`).join('\n'),
    })
  }
  if (!out.length) out.push({ kind: 'quiet', text: tt('none') })
  return out
})

const TONE: Record<Line['kind'], string> = {
  warn: 'rounded-field bg-gold-soft px-2 py-1 font-medium text-gold-ink',
  info: 'text-ink-3',
  quiet: 'text-muted',
}
</script>

<template>
  <div v-if="lines.length" class="flex flex-col gap-0.5 text-xs leading-[1.4]" data-goods-trois>
    <div v-for="(l, i) in lines" :key="i" :class="TONE[l.kind]" :title="l.title" :data-trois-line="l.kind">{{ l.text }}</div>
  </div>
</template>
