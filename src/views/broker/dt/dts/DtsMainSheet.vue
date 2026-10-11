<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown } from '@phosphor-icons/vue'
import type { DtsDocRef, DtsParty, DtsSheet } from '@/api/dts'
import { formatDateText } from '@/ui/date'
import { cn } from '@/ui/cn'

// Основной лист ДТС (гр. 1–10) — только чтение, всё с сервера (перенос из сохранённой ДТ). Компактно: имена сторон,
// условия поставки, документы гр. 4 и 5 — номерами. «Подробнее» раскрывает адреса и БИН сторон, гр. 6, рег. номер,
// число добавочных листов и гр. 10б. ДТС-2 (по листу сервера, formCode 2): гр. 4 — основания поставки (box4Docs:
// договор и документы 03…/04…, счёта при бесплатной поставке нет), и сколько товаров имеют документ о стоимости
// для гр. 8 (evidence, 04051; сами документы — в раскрытой строке добавочного листа).
const props = defineProps<{ sheet: DtsSheet }>()
const { t } = useI18n()
const tm = (key: string, p?: Record<string, unknown>) => t(`broker.dt.dts.main.${key}`, p ?? {})

const open = ref(false)

const docLine = (d: DtsDocRef) => (d.date ? tm('docLine', { number: d.number, date: formatDateText(d.date) }) : d.number)
const docs = (list: readonly DtsDocRef[] | null | undefined) => (list ?? []).map(docLine).join('\n')
const terms = computed(() => [props.sheet.incotermsCode, props.sheet.incotermsPlace].filter(Boolean).join(' · '))
const partyFull = (p: DtsParty) => {
  const address = [p.region, p.city, p.street, p.house, p.apt].filter((x) => !!x?.trim()).join(', ')
  return [p.name, p.bin ? tm('bin', { bin: p.bin }) : null, address || null, p.countryName].filter(Boolean).join('\n')
}

const left = computed(() => [
  { key: 'seller', label: tm('seller'), value: props.sheet.seller?.name ?? '' },
  { key: 'buyer', label: tm('buyer'), value: props.sheet.buyer?.name ?? '' },
  { key: 'declarant', label: tm('declarant'), value: props.sheet.declarant?.name ?? '' },
])
const form2 = computed(() => props.sheet.formCode === 2)
const evidenceGoods = computed(() => new Set((props.sheet.evidence ?? []).filter((e) => e.docs.length).map((e) => e.goodsNumber)).size)
const right = computed(() => [
  { key: 'terms', label: tm('terms'), value: terms.value, mono: false },
  form2.value
    ? { key: 'box4', label: tm('box4'), value: docs(props.sheet.box4Docs), mono: true }
    : { key: 'box4', label: tm('invoices'), value: docs(props.sheet.invoices), mono: true },
  { key: 'box5', label: tm('contracts'), value: docs(props.sheet.contracts), mono: true },
  ...(form2.value
    ? [{ key: 'evidence', label: tm('evidence'), value: tm('evidenceCount', { n: evidenceGoods.value, total: props.sheet.goods?.length ?? 0 }), mono: false }]
    : []),
])
const more = computed(() => [
  { key: 'seller', label: tm('seller'), value: partyFull(props.sheet.seller ?? ({} as DtsParty)) },
  { key: 'buyer', label: tm('buyer'), value: partyFull(props.sheet.buyer ?? ({} as DtsParty)) },
  { key: 'declarant', label: tm('declarant'), value: partyFull(props.sheet.declarant ?? ({} as DtsParty)) },
  { key: 'box6', label: tm('box6'), value: docs(props.sheet.box6Docs) },
  { key: 'reg', label: tm('regNumber'), value: props.sheet.registrationNumber ?? '' },
  { key: 'add', label: tm('addSheets'), value: String(props.sheet.addSheets ?? 0) },
  { key: 'box10b', label: tm('box10b'), value: props.sheet.box10b ?? '' },
])

const row = 'flex gap-3 border-b border-line py-2 last:border-b-0 max-sm:flex-col max-sm:gap-0.5'
const label = 'm-0 w-36 shrink-0 text-[13px] text-ink-3 max-sm:w-auto'
const value = 'm-0 min-w-0 flex-1 whitespace-pre-line break-words text-sm text-ink'
</script>

<template>
  <section class="flex flex-col gap-3" data-dts-main>
    <h3 class="m-0 flex items-baseline gap-2 text-[14px] font-semibold text-ink">
      {{ tm('title') }} <span class="font-mono text-xs font-normal text-muted">{{ t('broker.dt.nav.graphs', { list: '1–10' }) }}</span>
    </h3>
    <div class="grid gap-x-8 md:grid-cols-2">
      <dl class="m-0">
        <div v-for="r in left" :key="r.key" :class="row" :data-dts-main-row="r.key">
          <dt :class="label">{{ r.label }}</dt>
          <dd :class="value">{{ r.value || '—' }}</dd>
        </div>
      </dl>
      <dl class="m-0 max-md:border-t max-md:border-line">
        <div v-for="r in right" :key="r.key" :class="row" :data-dts-main-row="r.key">
          <dt :class="label">{{ r.label }}</dt>
          <dd :class="cn(value, r.mono && r.value && 'font-mono text-[13px]')">{{ r.value || '—' }}</dd>
        </div>
      </dl>
    </div>
    <div>
      <button
        type="button"
        class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-1 font-sans text-[13px] font-semibold text-zircon-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
        :aria-expanded="open"
        aria-controls="dts-main-more"
        data-dts-main-more
        @click="open = !open"
      >
        <PhCaretDown :size="14" aria-hidden="true" :class="cn('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')" />
        {{ open ? tm('less') : tm('more') }}
      </button>
      <dl v-if="open" id="dts-main-more" class="m-0 mt-1 rounded-row bg-canvas px-3" data-dts-main-details>
        <div v-for="r in more" :key="r.key" :class="row" :data-dts-detail="r.key">
          <dt :class="label">{{ r.label }}</dt>
          <dd :class="value">{{ r.value || '—' }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
