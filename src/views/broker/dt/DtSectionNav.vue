<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck } from '@phosphor-icons/vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { ZOption } from '@/ui/options'
import { cn } from '@/ui/cn'
import type { DtNavMark } from './dtPageModel'
import type { DtSectionKey } from './dtSections'

// Навигация разделов ДТ (доска DtGeneral): название и графы бланка, справа отметка — галочка (готово по серверу),
// число (пунктов не хватает), точка (платежи устарели), пустой кружок (не проверено). Активный — с фоном.
// От 768 px — липкая колонка; уже — выпадающий список (на телефоне колонке места нет).
const props = defineProps<{
  sections: DtSectionKey[]
  active: DtSectionKey
  marks: Partial<Record<DtSectionKey, DtNavMark>>
  /** Разделы с точкой «платежи устарели». */
  stale?: DtSectionKey[]
}>()
const emit = defineEmits<{ select: [key: DtSectionKey] }>()
const { t } = useI18n()

// Подпись граф раздела — как на бланке и доске (диапазоны пишем вручную: «31–47», а не перечень).
const GRAPHS: Record<DtSectionKey, string> = {
  number: 'А',
  general: '1, 3–7',
  parties: '2, 8, 9, 14',
  countries: '11, 15–17',
  transport: '18, 19, 21, 25, 26',
  finance: '12, 20, 22–24',
  customs: '29, 30',
  goods: '31–47',
  docs: '40, 44',
  dts: '',
  closing: '48, 52, 54, В',
}

const markOf = (k: DtSectionKey): DtNavMark => props.marks[k] ?? { kind: 'unknown' }
const countOf = (k: DtSectionKey) => { const m = markOf(k); return m.kind === 'count' ? m.count : 0 }
const isStale = (k: DtSectionKey) => !!props.stale?.includes(k)
const stateText = (k: DtSectionKey) => {
  const m = markOf(k)
  const base = m.kind === 'count' ? t('broker.dt.nav.state.count', { n: m.count }) : t(`broker.dt.nav.state.${m.kind}`)
  return isStale(k) ? `${base}, ${t('broker.dt.nav.state.stale')}` : base
}

const options = computed<ZOption[]>(() => props.sections.map((k) => {
  const m = markOf(k)
  const count = m.kind === 'count' ? ` · ${m.count}` : ''
  return { value: k, label: `${t(`broker.dt.sections.${k}`)}${count}` }
}))
const onSelect = (v: unknown) => {
  if (typeof v === 'string' && (props.sections as string[]).includes(v)) emit('select', v as DtSectionKey)
}
</script>

<template>
  <nav :aria-label="t('broker.dt.page.sectionsLabel')" data-dt-nav>
    <div class="md:hidden">
      <ZSelect
        :value="active"
        :options="options"
        :aria-label="t('broker.dt.nav.select')"
        class="*:h-11"
        data-dt-nav-select
        @update:value="onSelect"
      />
    </div>
    <ul class="m-0 hidden list-none flex-col gap-px p-0 md:flex">
      <li v-for="k in sections" :key="k">
        <a
          :href="`?s=${k}`"
          :aria-current="active === k ? 'true' : undefined"
          :class="cn(
            'flex min-h-11 items-center gap-2 rounded-row px-2.5 py-1 text-ink-2 no-underline outline-hidden',
            'transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none',
            active === k && 'bg-sunken text-ink',
          )"
          :data-dt-nav-item="k"
          :data-mark="markOf(k).kind"
          @click.prevent="emit('select', k)"
        >
          <span class="flex min-w-0 flex-col">
            <span :class="cn('text-[13px] leading-[1.3]', active === k && 'font-semibold')">{{ t(`broker.dt.sections.${k}`) }}</span>
            <span v-if="GRAPHS[k]" class="font-mono text-[11px] leading-[1.3] text-muted">{{ t('broker.dt.nav.graphs', { list: GRAPHS[k] }) }}</span>
          </span>
          <span class="ml-auto flex shrink-0 items-center gap-1.5" aria-hidden="true">
            <span v-if="isStale(k)" class="size-2 rounded-pill bg-gold" data-dt-nav-stale />
            <span
              v-if="markOf(k).kind === 'count'"
              class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-gold-soft px-[5px] text-[11.5px] font-bold tabular-nums text-gold-ink"
              data-dt-nav-count
            >{{ countOf(k) }}</span>
            <PhCheck v-else-if="markOf(k).kind === 'done'" :size="14" weight="bold" class="text-tone-done-fg" />
            <span v-else-if="!isStale(k)" class="size-2 rounded-pill shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]" />
          </span>
          <span class="sr-only">, {{ stateText(k) }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>
