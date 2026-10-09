<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import Doc44List from '@/components/broker/Doc44List.vue'
import type { ZOption } from '@/ui/options'
import DtGraphHelp from '../DtGraphHelp.vue'
import type { DtFormState } from '../dtPayload'
import PrevDocsTable from './PrevDocsTable.vue'

// Документы: гр. 40 (общая декларация / предшествующий документ) и гр. 44 (дополнительная информация, представленные
// документы). Оба списка правятся прямо в форме. Документ гр. 44 привязывается к товарам по номеру позиции; варианты —
// «Товар N · код» (код ТН ВЭД, а пока его нет — описание). У гр. 40 «№ товара» — номер в предшествующем документе. Готовность раздела отмечает сервер
// (нужен хотя бы один документ гр. 44), страница лишь показывает отметку.
const props = defineProps<{ form: DtFormState; readonly: boolean }>()
const { t } = useI18n()
const td = (key: string, p?: Record<string, unknown>) => t(`broker.dt.docs.${key}`, p ?? {})

const goodsOptions = computed<ZOption[]>(() => props.form.goodsItems.map((g, i) => {
  const text = (g.tnvedCode || g.description || '').trim()
  return { value: i, label: text ? td('goodsOption', { n: i + 1, text }) : td('goodsOptionBare', { n: i + 1 }) }
}))

const prev = ref<InstanceType<typeof PrevDocsTable> | null>(null)
const doc44 = ref<InstanceType<typeof Doc44List> | null>(null)

const h2 = 'm-0 flex items-baseline gap-2 text-[15px] font-semibold text-ink'
const graphTag = 'font-mono text-xs font-normal text-muted'
const addBtn = 'self-start max-sm:h-11'
</script>

<template>
  <section class="@container flex flex-col gap-6" data-dt-docs>
    <div class="flex flex-col gap-3" data-graph="40">
      <h2 :class="h2">
        {{ td('prevTitle') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '40' }) }}</span>
        <DtGraphHelp graph="40" />
      </h2>
      <PrevDocsTable ref="prev" :items="form.prevDocItems" :readonly="readonly" />
      <ZButton v-if="!readonly" :class="addBtn" data-prev-add @click="prev?.add()">
        <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
        {{ td('prev.add') }}
      </ZButton>
    </div>

    <div class="flex flex-col gap-3 border-t border-line pt-5" data-graph="44">
      <h2 :class="h2">
        {{ td('doc44Title') }}
        <span :class="graphTag">{{ t('broker.dt.nav.graphs', { list: '44' }) }}</span>
        <DtGraphHelp graph="44" />
      </h2>
      <Doc44List ref="doc44" :items="form.doc44Items" :readonly="readonly" :goods-options="goodsOptions" />
      <ZButton v-if="!readonly" :class="addBtn" data-doc44-add @click="doc44?.add()">
        <template #icon><PhPlus :size="16" aria-hidden="true" /></template>
        {{ td('doc44Add') }}
      </ZButton>
    </div>
  </section>
</template>
