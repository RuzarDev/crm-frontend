<script setup lang="ts">
import { onMounted, reactive, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import ZForm from '@/components/z/ZForm.vue'
import ZField from '@/components/z/ZField.vue'
import ZInput from '@/components/z/ZInput.vue'
import ZPhone from '@/components/z/ZPhone.vue'
import ZButton from '@/components/z/ZButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useBinLookup } from '@/composables/useBinLookup'
import { isBinLike, type CompanyLookupDto } from '@/api/companyLookup'
import { message } from '@/ui/message'
import type { ZRule } from '@/ui/validation'
import { authLabelClass as labelClass, authLinkClass as linkClass } from '@/components/auth/classes'

// Саморегистрация клиента (путь клиента 2026-09-21): email = логин, БИН обязателен, реквизиты — из ГБД ЮЛ
// по кнопке «Найти по БИН/ИИН». Подписи свои, как на входе (без звёздочек): обязательно всё, кроме телефона —
// у него пометка «необязательно». Несовпадение паролей — ошибка под полем повтора (правило), не тост.

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const uid = useId()
const ids = {
  email: `${uid}-email`, bin: `${uid}-bin`, companyName: `${uid}-company`, phone: `${uid}-phone`,
  password: `${uid}-password`, confirmPassword: `${uid}-confirm`,
}

const form = reactive({
  email: '',
  bin: '',
  companyName: '',
  phone: '',
  password: '',
  confirmPassword: '',
  legalAddress: '' as string | null,
  directorName: '' as string | null,
})

const rules: Record<string, ZRule[]> = {
  email: [
    { required: true, whitespace: true, message: () => t('register.vEmail') },
    { type: 'email', message: () => t('register.vEmailFormat') },
  ],
  bin: [
    { required: true, message: () => t('register.vBin') },
    { pattern: /^\d{12}$/, message: () => t('register.vBinFormat') },
  ],
  companyName: [{ required: true, whitespace: true, message: () => t('register.vCompany') }],
  password: [
    { required: true, message: () => t('register.vPassword') },
    { min: 8, message: () => t('register.vPasswordMin') },
  ],
  confirmPassword: [
    { required: true, message: () => t('register.vConfirm') },
    { validator: (_r, v) => (v && v !== form.password ? t('register.mismatch') : undefined) },
  ],
}

const formRef = ref<InstanceType<typeof ZForm>>()
// Пароль поменяли, когда повтор уже введён, — перепроверяем повтор (совпадение могло появиться или пропасть).
watch(() => form.password, () => {
  if (form.confirmPassword) void formRef.value?.validate(['confirmPassword'])
})

const { loading: binLoading, lookup } = useBinLookup({ anonymous: true })
const applyCompany = (c: CompanyLookupDto) => {
  form.companyName = c.nameRu ?? c.nameKz ?? form.companyName
  // У ИП (КГД) адреса и руководителя нет — не затираем то, что клиент уже ввёл.
  form.legalAddress = c.addressRu ?? c.addressKz ?? form.legalAddress ?? null
  form.directorName = c.director ?? form.directorName ?? null
}
const onFind = async () => {
  const company = await lookup(form.bin)
  if (!company) return
  applyCompany(company)
  // Наименование подставлено — снимаем показанную ошибку «Укажите наименование».
  if (form.companyName) void formRef.value?.validate(['companyName'])
}

const loading = ref(false)
const onFinish = async () => {
  loading.value = true
  try {
    const success = await authStore.registerClient({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      bin: form.bin.trim(),
      phone: form.phone.trim() || null,
      companyName: form.companyName.trim() || null,
      legalAddress: form.legalAddress || null,
      directorName: form.directorName || null,
    })
    // Аудит 5.22: бэк сразу отдаёт токен — не заставляем вводить только что придуманный пароль
    // ещё раз на странице входа, ведём сразу на старт нового клиента («Моя компания»).
    if (success) {
      message.success(t('register.successAuto'))
      router.push('/import-40/company')
    }
  } finally {
    loading.value = false
  }
}

// Автофокус — только на широком экране (lg, как у AuthLayout): на телефоне клавиатура закрыла бы форму.
const emailInput = ref<InstanceType<typeof ZInput>>()
onMounted(() => {
  if (window.matchMedia?.('(min-width: 1024px)').matches) emailInput.value?.focus()
})
</script>

<template>
  <AuthLayout
    :title="t('register.title')"
    :subtitle="t('register.subtitle')"
    :hero-title="t('register.heroTitle')"
    :hero-text="t('register.heroDesc')"
    :points="[t('register.step1'), t('register.step2'), t('register.step3')]"
  >
    <ZForm ref="formRef" :model="form" :rules="rules" @finish="onFinish">
      <ZField name="email">
        <label :for="ids.email" :class="[labelClass, 'mb-0.5']">{{ t('register.email') }}</label>
        <ZInput
          :id="ids.email"
          ref="emailInput"
          v-model:value="form.email"
          type="email"
          size="lg"
          placeholder="you@company.kz"
          autocomplete="email"
          autocapitalize="none"
          spellcheck="false"
        />
      </ZField>

      <ZField name="bin">
        <label :for="ids.bin" :class="[labelClass, 'mb-0.5']">{{ t('register.bin') }}</label>
        <!-- На узком телефоне (< 375px) 12 цифр не помещаются рядом с кнопкой — кнопка уходит строкой ниже. -->
        <div class="flex flex-wrap gap-2">
          <ZInput
            :id="ids.bin"
            v-model:value="form.bin"
            size="lg"
            mono
            :maxlength="12"
            inputmode="numeric"
            autocomplete="off"
            :placeholder="t('register.binPlaceholder')"
            class="min-w-[8.5rem] flex-1"
          />
          <!-- Высота — как у поля lg (42px), а не главной кнопки (44px): одна линия в строке. -->
          <ZButton size="lg" class="h-[42px] shrink-0 px-4" :loading="binLoading" :disabled="!isBinLike(form.bin)" @click="onFind">
            <template #icon><PhMagnifyingGlass :size="18" aria-hidden="true" /></template>
            {{ t('binLookup.find') }}
          </ZButton>
        </div>
      </ZField>

      <ZField name="companyName">
        <label :for="ids.companyName" :class="[labelClass, 'mb-0.5']">{{ t('register.companyName') }}</label>
        <ZInput :id="ids.companyName" v-model:value="form.companyName" size="lg" placeholder="ТОО «…»" autocomplete="organization" />
      </ZField>

      <ZField name="phone">
        <label :for="ids.phone" :class="[labelClass, 'mb-0.5']">
          {{ t('register.phone') }} <span class="font-normal text-ink-3">· {{ t('auth.optional') }}</span>
        </label>
        <ZPhone :id="ids.phone" v-model:value="form.phone" size="lg" />
      </ZField>

      <ZField name="password">
        <label :for="ids.password" :class="[labelClass, 'mb-0.5']">{{ t('register.password') }}</label>
        <ZInput
          :id="ids.password"
          v-model:value="form.password"
          type="password"
          size="lg"
          :placeholder="t('register.passwordPlaceholder')"
          autocomplete="new-password"
        />
      </ZField>

      <ZField name="confirmPassword">
        <label :for="ids.confirmPassword" :class="[labelClass, 'mb-0.5']">{{ t('register.confirm') }}</label>
        <ZInput
          :id="ids.confirmPassword"
          v-model:value="form.confirmPassword"
          type="password"
          size="lg"
          :placeholder="t('register.confirmPlaceholder')"
          autocomplete="new-password"
        />
      </ZField>

      <ZButton variant="primary" html-type="submit" size="lg" block :loading="loading">{{ t('register.submit') }}</ZButton>
    </ZForm>

    <template #footer>
      <p class="m-0 text-center text-[14px] text-ink-3">
        {{ t('register.haveAccount') }}
        <RouterLink to="/login" :class="[linkClass, 'font-semibold underline underline-offset-2']">{{ t('register.login') }}</RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>
