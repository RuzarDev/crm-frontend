<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import { isBinLike, type CompanyLookupDto } from '@/api/companyLookup'
import ZButton from '@/components/z/ZButton.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { useBinLookup } from '@/composables/useBinLookup'
import type { ReestrOrganizationInput } from '@/types/api'
import type { RecordDraft } from '../recordModel'
import { DEFAULT_ORGANIZATION_ROLE, useLocalOptions } from './localOptions'
import RecordSection from './RecordSection.vue'
import RepeatCards from './RepeatCards.vue'
import SectionAddButton from './SectionAddButton.vue'
import { boxCtl, ctl, grid, str } from './ui'

// Раздел «Организации» (разбор §2.6 c): декларант / отправитель / получатель. Адрес — одной строкой.
// «Найти по БИН» подставляет наименование, краткое наименование и адрес, только если они пусты.
const props = defineProps<{ draft: RecordDraft; readonly: boolean }>()
const { t } = useI18n()
const tp = (key: string) => t(`broker.transitRecord.parties.${key}`)

const { organizationRoles, subjectTypes } = useLocalOptions()
const cards = ref<{ add: () => void } | null>(null)
const newOrganization = (): ReestrOrganizationInput => ({
  role: DEFAULT_ORGANIZATION_ROLE, subjectType: null, bin: null, name: null, shortName: null, address: null, phone: null, email: null,
})

const { lookup } = useBinLookup()
const busy = shallowRef<ReestrOrganizationInput | null>(null)
const empty = (v: string | null | undefined) => (v ?? '').trim() === ''
async function findByBin(row: ReestrOrganizationInput) {
  if (busy.value) return
  busy.value = row
  let company: CompanyLookupDto | null = null
  try {
    company = await lookup(row.bin)
  } finally {
    busy.value = null
  }
  if (!company) return
  const name = company.nameRu ?? company.nameKz
  const address = company.addressRu ?? company.addressKz
  if (empty(row.name) && name) row.name = name
  if (empty(row.shortName) && name) row.shortName = name
  if (empty(row.address) && address) row.address = address
}
</script>

<template>
  <RecordSection id="organizations" :title="t('broker.transitRecord.sections.organizations')" :count="draft.organizations.length">
    <template v-if="!readonly" #actions>
      <SectionAddButton :label="t('broker.transitRecord.organizations.add')" @click="cards?.add()" />
    </template>
    <RepeatCards ref="cards" :items="draft.organizations" :readonly="readonly" :empty-text="t('broker.transitRecord.organizations.empty')" :new-item="newOrganization">
      <template #item="{ item }">
        <div :class="grid">
          <ZField :label="tp('role')">
            <ZSelect :value="item.role" :options="organizationRoles" :disabled="readonly" :class="boxCtl" data-f="role" @update:value="item.role = str($event) ?? DEFAULT_ORGANIZATION_ROLE" />
          </ZField>
          <ZField :label="tp('subjectType')">
            <ZSelect :value="item.subjectType" :options="subjectTypes" allow-clear :disabled="readonly" :placeholder="tp('choose')" :class="boxCtl" data-f="subjectType" @update:value="item.subjectType = str($event)" />
          </ZField>
          <ZField :label="tp('bin')">
            <div class="flex gap-2">
              <ZInput :value="item.bin" mono :maxlength="32" :disabled="readonly" :class="[ctl, 'min-w-0 flex-1']" data-f="bin" @update:value="item.bin = str($event)" />
              <ZButton
                v-if="!readonly"
                class="shrink-0 border border-line-strong bg-surface enabled:hover:bg-sunken max-sm:h-11"
                :disabled="!isBinLike(item.bin)"
                :loading="busy === item"
                :aria-label="t('binLookup.find')"
                :title="t(isBinLike(item.bin) ? 'binLookup.tipReady' : 'binLookup.tipEnter')"
                data-bin-lookup
                @click="findByBin(item)"
              >
                <template #icon><PhMagnifyingGlass :size="16" aria-hidden="true" /></template>
                {{ tp('find') }}
              </ZButton>
            </div>
          </ZField>
          <ZField :label="tp('name')" class="sm:col-span-2">
            <ZInput :value="item.name" :maxlength="500" :disabled="readonly" :class="ctl" data-f="name" @update:value="item.name = str($event)" />
          </ZField>
          <ZField :label="tp('shortName')">
            <ZInput :value="item.shortName" :maxlength="256" :disabled="readonly" :class="ctl" data-f="shortName" @update:value="item.shortName = str($event)" />
          </ZField>
          <ZField :label="tp('address')" class="sm:col-span-2">
            <ZInput :value="item.address" :maxlength="1000" :placeholder="tp('addressPlaceholder')" :disabled="readonly" :class="ctl" data-f="address" @update:value="item.address = str($event)" />
          </ZField>
          <ZField :label="tp('phone')">
            <ZInput :value="item.phone" type="tel" :maxlength="64" :disabled="readonly" :class="ctl" data-f="phone" @update:value="item.phone = str($event)" />
          </ZField>
          <ZField :label="tp('email')">
            <ZInput :value="item.email" type="email" :maxlength="256" :disabled="readonly" :class="ctl" data-f="email" @update:value="item.email = str($event)" />
          </ZField>
        </div>
      </template>
    </RepeatCards>
  </RecordSection>
</template>
