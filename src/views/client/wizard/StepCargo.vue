<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import type { ZOption, ZOptionValue } from '@/ui/options'
import type { ZRule } from '@/ui/validation'
import type { ShipmentDraft } from './useShipmentDraft'
import { phoneField, phoneSelect, phoneTextarea, stepHint, stepTitle } from './wizardUi'

// Шаг 1 «Груз»: груз (обязателен), пост/СВХ, примерная стоимость и валюта (перенесены сюда со шага «Стороны»).
const props = defineProps<{
  draft: ShipmentDraft
  postOptions: ZOption[]
  postsLoading?: boolean
}>()

const { t, locale } = useI18n()
const uid = useId()
const headingId = `wz-cargo-${uid}`

/** Груз годится для «Далее»: хотя бы два символа (как в прежнем мастере). */
const cargoRules = computed<ZRule[]>(() => [
  {
    required: true,
    whitespace: true,
    message: () => t('client.wizard.cargo.cargoShort'),
  },
  {
    validator: (_r, v) => (String(v ?? '').trim().length === 1 ? t('client.wizard.cargo.cargoShort') : undefined),
  },
])

// Пустой пост — null для ZSelect (иначе '' — выбранное значение с пустой подписью и без подсказки).
const post = computed<ZOptionValue | null>({
  get: () => props.draft.post || null,
  set: (v) => { props.draft.post = v === null || v === undefined ? '' : String(v) },
})

// Валюта: в поле — код (USD), в списке — код и название на языке интерфейса; поиск — и по названию.
// Название — Intl.DisplayNames (аудит 2026-09-28, п.10: не захардкоженный русский).
const CURRENCY_CODES = ['USD', 'EUR', 'CNY', 'KZT', 'RUB', 'TRY', 'AED', 'GBP']
const LOCALE_TAG: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const currencyOptions = computed<ZOption[]>(() => {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([LOCALE_TAG[locale.value] || 'ru-RU'], { type: 'currency' })
  } catch {
    names = null
  }
  return CURRENCY_CODES.map((code) => {
    let name = ''
    try {
      name = names?.of(code) ?? ''
    } catch {
      name = ''
    }
    return { value: code, label: code, name: name && name !== code ? name : '' }
  })
})
const filterCurrency = (input: string, o: ZOption) => {
  const q = input.trim().toLocaleLowerCase()
  return `${o.label} ${String(o.name ?? '')}`.toLocaleLowerCase().includes(q)
}
const currency = computed<ZOptionValue | null>({
  get: () => props.draft.currency || null,
  set: (v) => { props.draft.currency = v === null || v === undefined ? null : String(v) },
})
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-5" data-step="cargo">
    <div>
      <h2 :id="headingId" tabindex="-1" :class="stepTitle">{{ t('client.wizard.cargo.title') }}</h2>
      <p :class="stepHint">{{ t('client.wizard.cargo.hint') }}</p>
    </div>

    <ZField :label="t('client.wizard.cargo.cargo')" :rules="cargoRules">
      <ZTextarea
        v-model:value="draft.cargo"
        :rows="2"
        auto-grow
        :maxlength="500"
        :placeholder="t('client.wizard.cargo.cargoPh')"
        :class="phoneTextarea"
        data-wz-cargo
      />
    </ZField>

    <ZField :label="t('client.wizard.cargo.post')" :extra="t('client.wizard.cargo.postHelp')">
      <ZSelect
        v-model:value="post"
        :options="postOptions"
        show-search
        allow-clear
        :loading="postsLoading"
        :placeholder="t('client.wizard.cargo.postPh')"
        :class="phoneSelect"
        data-wz-post
      />
    </ZField>

    <div class="grid grid-cols-[minmax(0,1fr)_112px] gap-2.5 sm:grid-cols-[minmax(0,1fr)_128px] sm:gap-3">
      <ZField :label="t('client.wizard.cargo.value')">
        <ZNumber
          v-model:value="draft.estimatedValue"
          :min="0"
          :precision="2"
          placeholder="0.00"
          :class="phoneField"
          class="tabular-nums"
          data-wz-value
        />
      </ZField>
      <ZField :label="t('client.wizard.cargo.currency')">
        <ZSelect
          v-model:value="currency"
          :options="currencyOptions"
          show-search
          :filter-option="filterCurrency"
          :popup-width="240"
          :class="[phoneSelect, 'w-full']"
          data-wz-currency
        >
          <template #option="{ option }">
            <span class="font-medium tabular-nums">{{ option.label }}</span>
            <span v-if="option.name" class="ml-2 text-ink-3">{{ option.name }}</span>
          </template>
        </ZSelect>
      </ZField>
    </div>
  </section>
</template>
