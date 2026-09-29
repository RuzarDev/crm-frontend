<template>
  <div class="dt-section">
    <div class="dt-section-bar"><DtGraphLabel graph="31–47" :text="t('dt.tovary')" /></div>
    <ReestrGoodsSection v-model="items" :readonly="readonly" :uppercase="true" :locked-currency="dealCurrency" :brand-fields="true">
      <template #goods-extra="{ item, index, change }">
        <Import40GoodsKedenFields
          :good="item as Import40GoodsItemInput"
          :all-goods="items"
          :index="index"
          :readonly="readonly"
          :container-indicator="containerIndicator"
          :usd-rate="usdRate"
          @change="change"
        />
      </template>
    </ReestrGoodsSection>
    <Import40GoodsKedenPanel v-model="items" :readonly="readonly" :container-indicator="containerIndicator" :usd-rate="usdRate" @calc-tpin="emit('calc-tpin')" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import DtGraphLabel from './DtGraphLabel.vue'
import ReestrGoodsSection from '@/components/ReestrGoodsSection.vue'
import Import40GoodsKedenPanel from '@/components/Import40GoodsKedenPanel.vue'
import Import40GoodsKedenFields from '@/components/Import40GoodsKedenFields.vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { useTroisCheckProvider } from '@/composables/useTroisCheck'
import './dt-sections.css'

const { t } = useI18n()

const props = defineProps<{
  modelValue: Import40GoodsItemInput[]
  readonly: boolean
  containerIndicator?: boolean
  // Item I (гр.46): курс USD (₸ за 1 USD) на дату гр.А — пробрасывается в
  // Import40GoodsKedenPanel для авторасчёта статистической стоимости.
  usdRate?: number | null
  // Пакет 6 №4: валюта сделки (гр.22, dtForm.currency) — блокирует поле валюты
  // у каждого товара (read-only, синхронизируется с гр.22).
  dealCurrency?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [Import40GoodsItemInput[]]; 'calc-tpin': [] }>()

// ТРОИС: торговые марки товаров проверяются пакетно (с задержкой после ввода); результат читают
// подсказка под «Торговой маркой» (ReestrGoodsSection) и подсказка у поля ОИС (Import40GoodsKedenFields).
useTroisCheckProvider(() => props.modelValue.map((g) => g.tradeMarkName))

// Тонкая обёртка: сами товарные поля живут в ReestrGoodsSection/Import40GoodsKedenPanel,
// поэтому здесь достаточно get/set-computed без локальной копии/watch (в отличие
// от DtSectionParties/Transport) — дочерние компоненты уже делают собственные копии.
//
// «Кол-во грузовых мест» в карточке товара одно — packagesCount (сюда же идёт Excel/реестр);
// КЕДЕН-поле cargoPlacesQuantity, из которого бэк берёт гр.31 XML, держим равным ему на любую правку.
const items = computed({
  get: () => props.modelValue,
  set: (v) => {
    for (const g of v) {
      const places = g.packagesCount ?? null
      if ((g.cargoPlacesQuantity ?? null) !== places) g.cargoPlacesQuantity = places
    }
    emit('update:modelValue', v)
  },
})
</script>
