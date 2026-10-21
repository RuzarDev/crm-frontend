<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { PhSparkle } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import AiTnvedModal from '@/components/aiTnved/AiTnvedModal.vue'
import { useAiTnvedButton } from '@/components/aiTnved/aiTnved'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import ZField from '@/components/z/ZField.vue'
import ZNumber from '@/components/z/ZNumber.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTextarea from '@/components/z/ZTextarea.vue'
import CustomsPostOption from '@/components/customsPost/CustomsPostOption.vue'
import { filterCustomsPostOption } from '@/utils/customsPosts'
import type { ZOption, ZOptionValue } from '@/ui/options'
import { formatNumberIn } from '@/ui/number'
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

// «Подобрать код с ИИ» (17.10): по описанию груза; выбранный код дописывается в груз — декларант его увидит и проверит.
// Кнопка — если администратор не выключил «ИИ для клиентов».
const auth = useAuthStore()
const aiVisible = useAiTnvedButton(() => auth.role === 'client')
const aiOpen = ref(false)
const aiUsed = ref(false)
const openAi = () => { aiUsed.value = true; aiOpen.value = true }
// Пометка «(код ТН ВЭД …)» — одна: прежняя убирается (и из текста для ИИ), длинный груз обрезается, а не пометка.
const CARGO_MAX = 500
const notePattern = computed(() => {
  const [before, after] = t('client.wizard.cargo.aiCode', { code: '\u0000' }).split('\u0000')
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\s*\\(${esc(before)}\\d{10}${esc(after)}\\)`, 'g')
})
const cargoWithoutNote = computed(() => (props.draft.cargo ?? '').replace(notePattern.value, '').trim())
const onAiSelect = ({ code }: { code: string }) => {
  const note = ` (${t('client.wizard.cargo.aiCode', { code })})`
  const cargo = cargoWithoutNote.value
  props.draft.cargo = cargo ? `${cargo.slice(0, CARGO_MAX - note.length)}${note}` : note.trim().replace(/^\(|\)$/g, '')
}
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
    <div v-if="aiVisible" class="-mt-2 flex flex-col gap-1">
      <ZButton size="sm" class="w-fit max-sm:h-11 max-sm:w-full" :disabled="(draft.cargo ?? '').trim().length < 3" data-wz-ai @click="openAi">
        <template #icon><PhSparkle :size="15" aria-hidden="true" /></template>{{ t('client.wizard.cargo.ai') }}
      </ZButton>
      <span class="text-xs text-muted">{{ t('client.wizard.cargo.aiHint') }}</span>
    </div>
    <AiTnvedModal v-if="aiUsed" v-model:open="aiOpen" :description="cargoWithoutNote" source="wizard" @select="onAiSelect" />

    <ZField :label="t('client.wizard.cargo.post')" :extra="t('client.wizard.cargo.postHelp')">
      <!-- Поиск по коду и названию поста (правка №11); окно на телефоне — не шире экрана. -->
      <ZSelect
        v-model:value="post"
        :options="postOptions"
        show-search
        allow-clear
        :filter-option="filterCustomsPostOption"
        :not-found-content="t('client.wizard.cargo.postNotFound')"
        :loading="postsLoading"
        :placeholder="t('client.wizard.cargo.postPh')"
        popup-width="min(420px, calc(100vw - 32px))"
        :class="phoneSelect"
        data-wz-post
      >
        <template #option="{ option }"><CustomsPostOption :option="option" /></template>
      </ZSelect>
    </ZField>

    <div class="grid grid-cols-[minmax(0,1fr)_112px] gap-2.5 sm:grid-cols-[minmax(0,1fr)_128px] sm:gap-3">
      <ZField :label="t('client.wizard.cargo.value')">
        <ZNumber
          v-model:value="draft.estimatedValue"
          :min="0"
          :precision="2"
          :placeholder="formatNumberIn(locale, 0, 2, 2)"
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
