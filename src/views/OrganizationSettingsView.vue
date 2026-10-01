<!-- Реквизиты своей организации: подставляются в счета и акты.
     Раньше реквизиты брокера были зашиты в шаблоны (аудит 2026-09-22, п.12). -->
<template>
  <div class="org-view crm-page">
    <PageHeader :kicker="t('org.kicker')" :title="t('org.title')" :subtitle="t('org.subtitle')">
      <template #actions>
        <a-button type="primary" :loading="saving" @click="save">{{ t('org.save') }}</a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading">
      <a-card class="crm-shell-card" :bordered="false">
        <div class="form-grid">
          <label class="full"><span>{{ t('org.companyName') }}</span><a-input v-model:value="form.companyName" placeholder="ТОО «…»" /></label>
          <label><span>{{ t('org.shortName') }}</span><a-input v-model:value="form.shortName" /></label>
          <label><span>{{ t('org.bin') }}</span><a-input v-model:value="form.bin" :maxlength="12" /></label>
          <label class="full"><span>{{ t('org.legalAddress') }}</span><a-input v-model:value="form.legalAddress" /></label>
          <label><span>{{ t('org.director') }}</span><a-input v-model:value="form.directorName" /></label>
          <label><span>{{ t('org.basis') }}</span><a-input v-model:value="form.directorBasis" /></label>
          <label><span>{{ t('org.accountant') }}</span><a-input v-model:value="form.accountantName" /></label>
          <label><span>{{ t('org.phone') }}</span><PhoneInput v-model:value="form.phone" /></label>
          <label><span>{{ t('org.email') }}</span><a-input v-model:value="form.email" /></label>
        </div>

        <div class="section-title">{{ t('org.bankSection') }}</div>
        <div class="form-grid">
          <label><span>{{ t('org.bank') }}</span><a-input v-model:value="form.bank" /></label>
          <label><span>{{ t('org.iik') }}</span><a-input v-model:value="form.iik" /></label>
          <label><span>{{ t('org.bik') }}</span><a-input v-model:value="form.bik" /></label>
          <label><span>{{ t('org.kbe') }}</span><a-input v-model:value="form.kbe" :maxlength="4" /></label>
        </div>

        <div class="section-title">{{ t('org.vatSection') }}</div>
        <div class="form-grid">
          <label><span>{{ t('org.vatPayer') }}</span>
            <a-switch v-model:checked="form.vatPayer" />
          </label>
          <label><span>{{ t('org.vatRate') }}</span>
            <a-input-number v-model:value="form.vatRate" :min="0" :max="30" :step="1" :disabled="!form.vatPayer" style="width: 120px" />
          </label>
        </div>

        <p class="hint">{{ t('org.hint') }}</p>
      </a-card>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import PhoneInput from '@/components/ui/PhoneInput.vue'
import { billingApi, type OrganizationSettings } from '@/api/billing'

const { t } = useI18n()
const loading = ref(false)
const saving = ref(false)

const form = reactive<OrganizationSettings>({
  companyName: '', shortName: '', bin: '', legalAddress: '',
  bank: '', iik: '', bik: '', kbe: '',
  directorName: '', directorBasis: 'устава', accountantName: '',
  phone: '', email: '', vatPayer: true, vatRate: 16, updatedAtUtc: null,
})

const load = async () => {
  loading.value = true
  try {
    Object.assign(form, await billingApi.organization())
  } catch {
    message.error(t('org.loadError'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const save = async () => {
  saving.value = true
  try {
    Object.assign(form, await billingApi.saveOrganization({ ...form }))
    message.success(t('org.saved'))
  } catch {
    message.error(t('org.saveError'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.org-view { display: flex; flex-direction: column; gap: 18px; }
.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.form-grid label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.form-grid label.full { grid-column: 1 / -1; }
.form-grid label > span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--atg-muted, #95a1b7); }
.section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--atg-charcoal, #445069); margin: 22px 0 10px; }
.hint { margin-top: 18px; font-size: 12px; color: var(--atg-muted, #95a1b7); }
@media (max-width: 900px) { .form-grid { grid-template-columns: 1fr; } }
</style>
