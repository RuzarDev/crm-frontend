<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40GoodsExtras, Import40GoodsItemInput, Import40GoodsPackage } from '@/types/api'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { cn } from '@/ui/cn'
import { withCurrent } from '../../dtOptions'
import type { GoodsSectionProps } from './types'

// «Упаковка» (гр. 31, доска DtGoodsEditor): наличие упаковки, вид, количество упаковок, частично занятые места
// (доп. сведения extras.cargoPartQuantity: товар в одной коробке с другим); 31.2 — доп. упаковка списком (индивидуальная,
// поддоны, груз; extras.packages, как окно 31.2 КЕДЕН); 31.3 — номер контейнера, только при контейнерной перевозке (гр. 19).
// Места (packagesCount = cargoPlacesQuantity) — в «Количество и стоимость». Не поля платежей — «Пересчитать» не ставят.
const props = defineProps<GoodsSectionProps>()
const { t } = useI18n()
const tp = (key: string, p?: Record<string, unknown>) => t(`broker.dt.goods.editor.packaging.${key}`, p ?? {})
const classifiers = useClassifiersStore()

type Goods = Import40GoodsItemInput
const str = (v: ZOptionValue | ZOptionValue[] | null) => (v == null || Array.isArray(v) || v === '' ? null : String(v))

const availability = computed(() => withCurrent(classifiers.options('packaging-availability'), props.item.packageAvailabilityCode).options)
const kindOptions = computed<ZOption[]>(() => classifiers.options('2013'))
const kindsFor = (code: string | null | undefined) => withCurrent(kindOptions.value, code).options

const setCode = (key: 'packageAvailabilityCode' | 'packageKindCode', v: ZOptionValue | ZOptionValue[] | null) => {
  props.model.setField(props.item, key, str(v) as Goods[typeof key])
}

// Доп. сведения создаются при первой правке (частично мест, 31.2) — пустые списки марок и автомобилей, как раньше.
const ensureExtras = (): Import40GoodsExtras => {
  const g = props.item
  g.extras ??= { traceable: false, exciseStamps: [], vehicles: [] }
  return g.extras
}
const onPartPlaces = (v: number | null) => { ensureExtras().cargoPartQuantity = v }

// 31.2: порядок как в окне КЕДЕН — индивидуальная, поддоны, груз; новая строка — поддоны.
const PKG_KINDS = ['1', '3', '2'] as const
const pkgKindOptions = computed<ZOption[]>(() => PKG_KINDS.map((k) => ({ value: k, label: tp(`kinds.${k}`) })))
const packages = computed(() => props.item.extras?.packages ?? [])
const addPkg = () => {
  const x = ensureExtras()
  x.packages ??= []
  x.packages.push({ kind: '3', packageKindCode: null, quantity: null, description: null })
}
const removePkg = (i: number) => { props.item.extras?.packages?.splice(i, 1) }
const setPkg = <K extends keyof Import40GoodsPackage>(p: Import40GoodsPackage, key: K, v: Import40GoodsPackage[K]) => { p[key] = v }

const onContainer = (v: string) => { props.model.setField(props.item, 'containerNumber', v.trim() ? v : null) }

const grid = 'grid grid-cols-1 gap-x-4 gap-y-4 @sm:grid-cols-2 @4xl:grid-cols-4'
const tall = 'max-sm:h-11'
const pkgRow = 'grid grid-cols-2 items-start gap-2 rounded-row border border-line p-2 @xl:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_6.5rem_minmax(0,1fr)_auto] @xl:border-0 @xl:p-0'
const removeBtn = cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3',
  'outline-hidden transition-colors hover:bg-sunken hover:text-danger focus-visible:shadow-focus max-sm:size-11',
)
</script>

<template>
  <div class="flex flex-col gap-5" data-goods-packaging-section>
    <div :class="grid">
      <ZField graph="31" :label="tp('availability')" class="@sm:col-span-2 @4xl:col-span-1" data-graph="31" :data-goods-index="index" data-goods-field="packageAvailabilityCode">
        <ZSelect :value="item.packageAvailabilityCode || null" :options="availability" allow-clear :disabled="readonly" :placeholder="tp('availabilityPlaceholder')" popup-width="280px" :class="tall" data-f="packageAvailabilityCode" @update:value="setCode('packageAvailabilityCode', $event)" />
      </ZField>
      <ZField graph="31" :label="tp('kind')" class="@sm:col-span-2 @4xl:col-span-1" :data-goods-index="index" data-graph="31" data-goods-field="packageKindCode">
        <ZSelect :value="item.packageKindCode || null" :options="kindsFor(item.packageKindCode)" show-search allow-clear :disabled="readonly" :placeholder="tp('kindPlaceholder')" popup-width="360px" :class="tall" data-f="packageKindCode" @update:value="setCode('packageKindCode', $event)" />
      </ZField>
      <ZField graph="31" :label="tp('quantity')" :data-goods-index="index" data-graph="31" data-goods-field="packageQuantity">
        <ZNumber :value="item.packageQuantity ?? null" :min="0" :disabled="readonly" :class="tall" data-f="packageQuantity" @update:value="model.setField(item, 'packageQuantity', $event)" />
      </ZField>
      <ZField graph="31" :label="tp('partPlaces')" :title="tp('partPlacesHint')" :data-goods-index="index" data-graph="31" data-goods-field="cargoPartQuantity">
        <ZNumber :value="item.extras?.cargoPartQuantity ?? null" :min="0" :max="99999999" :precision="0" placeholder="0" :disabled="readonly" :class="tall" :title="tp('partPlacesHint')" data-f="cargoPartQuantity" @update:value="onPartPlaces" />
      </ZField>
      <ZField v-if="ctx.containerIndicator" graph="31.3" :label="tp('container')" class="@sm:col-span-2" :data-goods-index="index" data-graph="31" data-goods-field="containerNumber">
        <ZInput v-uppercase :value="item.containerNumber ?? ''" mono :disabled="readonly" placeholder="GLDU9071686" :class="tall" data-f="containerNumber" @update:value="onContainer" />
      </ZField>
    </div>

    <!-- 31.2: доп. упаковка, поддоны, груз — дополнительно к основной упаковке -->
    <div class="flex flex-col gap-2" data-graph="31" data-goods-field="packages" :data-goods-index="index" data-goods-pkg-extra>
      <div>
        <p class="m-0 text-[13px] font-medium text-ink-2">{{ tp('extraTitle') }}</p>
        <p class="m-0 text-xs text-muted">{{ tp('extraHint') }}</p>
      </div>
      <p v-if="!packages.length && readonly" class="m-0 text-[13px] text-muted">{{ tp('extraEmpty') }}</p>
      <div v-if="packages.length" class="hidden gap-2 px-0 text-xs text-muted @xl:grid @xl:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_6.5rem_minmax(0,1fr)_auto]" aria-hidden="true">
        <span>{{ tp('extraKind') }}</span><span>{{ tp('kind') }}</span><span>{{ tp('quantity') }}</span><span>{{ tp('extraDesc') }}</span><span class="w-9" />
      </div>
      <div v-for="(p, pi) in packages" :key="pi" :class="pkgRow" :data-goods-pkg-row="pi">
        <ZSelect :value="p.kind" :options="pkgKindOptions" :disabled="readonly" popup-width="260px" :aria-label="tp('extraKind')" :class="tall" :data-f="`pkg-${pi}-kind`" @update:value="setPkg(p, 'kind', str($event) ?? '3')" />
        <div class="flex min-w-0 flex-col gap-1">
          <ZSelect :value="p.packageKindCode || null" :options="kindsFor(p.packageKindCode)" show-search allow-clear :disabled="readonly" :placeholder="tp('kindPlaceholder')" popup-width="360px" :aria-label="tp('kind')" :class="tall" :data-f="`pkg-${pi}-packageKindCode`" @update:value="setPkg(p, 'packageKindCode', str($event))" />
          <span v-if="!p.packageKindCode" class="text-xs text-gold-ink">{{ tp('kindMissing') }}</span>
        </div>
        <ZNumber :value="p.quantity ?? null" :min="0" :max="99999999" :precision="0" :disabled="readonly" :aria-label="tp('quantity')" :class="tall" :data-f="`pkg-${pi}-quantity`" @update:value="setPkg(p, 'quantity', $event)" />
        <div class="flex min-w-0 items-start gap-1">
          <ZInput v-uppercase :value="p.description ?? ''" :maxlength="250" :disabled="readonly" :placeholder="tp('extraDescPlaceholder')" :aria-label="tp('extraDesc')" :class="['min-w-0 flex-1', tall]" :data-f="`pkg-${pi}-description`" @update:value="setPkg(p, 'description', $event || null)" />
          <button v-if="!readonly" type="button" :class="removeBtn" :aria-label="tp('remove')" :title="tp('remove')" :data-goods-pkg-remove="pi" @click="removePkg(pi)">
            <PhX :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div v-if="!readonly">
        <ZButton variant="ghost" size="sm" class="max-sm:h-11" data-goods-pkg-add @click="addPkg">
          <PhPlus :size="14" aria-hidden="true" />{{ tp('add') }}
        </ZButton>
      </div>
    </div>
  </div>
</template>
