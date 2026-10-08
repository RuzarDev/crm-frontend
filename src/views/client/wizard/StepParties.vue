<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBuildings, PhMagnifyingGlass } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useBinLookup } from '@/composables/useBinLookup'
import type { ZOption, ZOptionValue } from '@/ui/options'
import type { ZRule } from '@/ui/validation'
import { filterCountryOption } from '@/utils/countries'
import { isBinOk, type ShipmentDraft } from './useShipmentDraft'
import { blockTitle, phoneField, phoneSelect, stepHint, stepTitle } from './wizardUi'

// Шаг 3 «Отправитель и получатель»: отправитель (наименование, страна ОКСМ), получатель (наименование, БИН с
// поиском по госреестру, страна; по умолчанию Казахстан 398) и ссылка «Из моей компании».
const props = defineProps<{
  draft: ShipmentDraft
  countryOptions: ZOption[]
  /** Профиль компании загружен — можно подставить получателя. */
  canFillFromProfile?: boolean
}>()
const emit = defineEmits<{ fillFromProfile: [] }>()

const { t } = useI18n()
const uid = useId()
const headingId = `wz-parties-${uid}`
const senderId = `wz-sender-${uid}`
const receiverId = `wz-receiver-${uid}`

/** БИН необязателен, но если введён — ровно 12 цифр. */
const binRules = computed<ZRule[]>(() => [
  { validator: (_r, v) => (isBinOk(String(v ?? '')) ? undefined : t('client.wizard.parties.binInvalid')) },
])

// Страна в ZSelect — null, а не '' (пустая строка — выбранное значение без подписи).
const countryModel = (key: 'senderCountry' | 'receiverCountry') => computed<ZOptionValue | null>({
  get: () => props.draft[key] || null,
  set: (v) => { props.draft[key] = v === null || v === undefined ? null : String(v) },
})
const senderCountry = countryModel('senderCountry')
const receiverCountry = countryModel('receiverCountry')
const filterCountry = (input: string, o: ZOption) => filterCountryOption(input, o as { searchText?: string })

// «Найти» (ГБД ЮЛ / КГД): наименование и страна Казахстан — как прежний BinLookupButton в мастере.
const { loading: binLoading, lookup } = useBinLookup()
const binLookupReady = computed(() => /^\d{12}$/.test(props.draft.receiverBin.trim()))
const findByBin = async () => {
  const company = await lookup(props.draft.receiverBin.trim())
  if (!company) return
  props.draft.receiverName = company.nameRu ?? company.nameKz ?? props.draft.receiverName
  props.draft.receiverCountry = '398'
}
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-6" data-step="parties">
    <div>
      <h2 :id="headingId" tabindex="-1" :class="stepTitle">{{ t('client.wizard.parties.title') }}</h2>
      <p :class="stepHint">{{ t('client.wizard.parties.hint') }}</p>
    </div>

    <div role="group" :aria-labelledby="senderId" class="flex flex-col gap-4" data-wz-sender>
      <h3 :id="senderId" :class="blockTitle">{{ t('client.wizard.parties.sender') }}</h3>
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)] sm:gap-x-3">
        <ZField :label="t('client.wizard.parties.name')">
          <ZInput v-model:value="draft.senderName" :placeholder="t('client.wizard.parties.senderPh')" :class="phoneField" data-wz-sender-name />
        </ZField>
        <ZField :label="t('client.wizard.parties.country')">
          <ZSelect
            v-model:value="senderCountry"
            :options="countryOptions"
            show-search
            allow-clear
            :filter-option="filterCountry"
            :placeholder="t('client.wizard.parties.countryPh')"
            :class="phoneSelect"
            data-wz-sender-country
          />
        </ZField>
      </div>
    </div>

    <div role="group" :aria-labelledby="receiverId" class="flex flex-col gap-4 border-0 border-t border-solid border-line pt-6" data-wz-receiver>
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 :id="receiverId" :class="blockTitle">{{ t('client.wizard.parties.receiver') }}</h3>
        <button
          v-if="canFillFromProfile"
          type="button"
          class="-mr-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-field border-0 bg-transparent px-2 font-sans text-sm font-semibold text-zircon-ink outline-hidden hover:text-ink focus-visible:shadow-focus sm:min-h-8"
          data-wz-from-profile
          @click="emit('fillFromProfile')"
        >
          <PhBuildings :size="16" aria-hidden="true" />{{ t('client.wizard.parties.fromMyCompany') }}
        </button>
      </div>
      <ZField :label="t('client.wizard.parties.name')">
        <ZInput v-model:value="draft.receiverName" :placeholder="t('client.wizard.parties.receiverPh')" :class="phoneField" data-wz-receiver-name />
      </ZField>
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)] sm:gap-x-3">
        <ZField :label="t('client.wizard.parties.bin')" :rules="binRules">
          <div class="flex gap-2">
            <ZInput
              v-model:value="draft.receiverBin"
              mono
              inputmode="numeric"
              autocomplete="off"
              :maxlength="12"
              :placeholder="t('client.wizard.parties.binPh')"
              :class="[phoneField, 'flex-1']"
              data-wz-receiver-bin
              @press-enter="binLookupReady && findByBin()"
            />
            <ZButton
              :loading="binLoading"
              :disabled="!binLookupReady"
              :aria-label="t('client.wizard.parties.findLabel')"
              class="shrink-0 max-sm:h-12 max-sm:px-4 max-sm:text-base"
              data-wz-bin-find
              @click="findByBin"
            >
              <PhMagnifyingGlass :size="16" aria-hidden="true" />{{ t('client.wizard.parties.find') }}
            </ZButton>
          </div>
        </ZField>
        <ZField :label="t('client.wizard.parties.country')">
          <ZSelect
            v-model:value="receiverCountry"
            :options="countryOptions"
            show-search
            allow-clear
            :filter-option="filterCountry"
            :placeholder="t('client.wizard.parties.countryPh')"
            :class="phoneSelect"
            data-wz-receiver-country
          />
        </ZField>
      </div>
    </div>
  </section>
</template>
