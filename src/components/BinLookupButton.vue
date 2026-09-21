<template>
  <a-tooltip :title="tooltip">
    <a-button
      :size="size"
      :type="type"
      :disabled="disabled || !isBinLike(bin)"
      :loading="loading"
      class="bin-lookup-btn"
      @click="lookup"
    >
      <SearchOutlined v-if="!loading" />
      <slot>Найти по БИН</slot>
    </a-button>
  </a-tooltip>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import { companyLookupApi, isBinLike, type CompanyLookupDto } from '@/api/companyLookup'

// Кнопка «Найти по БИН»: тянет карточку юрлица из ГБД ЮЛ (data.egov.kz) и отдаёт
// её родителю событием found — что именно подставлять, решает родитель (у профиля,
// мастера и граф ДТ разный набор полей). Ошибки показывает сама.
const props = withDefaults(defineProps<{
  bin: string | null | undefined
  size?: 'small' | 'middle' | 'large'
  type?: 'default' | 'primary' | 'link' | 'dashed' | 'text'
  disabled?: boolean
  // Публичный эндпоинт (страница регистрации, без токена) — с rate-limit по IP.
  anonymous?: boolean
}>(), { size: 'small', type: 'default', disabled: false, anonymous: false })

const emit = defineEmits<{ found: [company: CompanyLookupDto] }>()

const loading = ref(false)
const tooltip = computed(() =>
  isBinLike(props.bin) ? 'Подставить наименование, адрес и руководителя из ГБД ЮЛ (data.egov.kz)' : 'Введите 12-значный БИН',
)

const lookup = async () => {
  if (!isBinLike(props.bin)) return
  loading.value = true
  try {
    const company = await companyLookupApi.byBin(props.bin!, props.anonymous)
    emit('found', company)
    const status = company.statusRu ? ` · ${company.statusRu}` : ''
    message.success(`Найдено: ${company.nameRu ?? company.nameKz ?? company.bin}${status}. Проверьте адрес — данные реестра могут отставать.`)
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } }
    const st = err.response?.status
    const text = err.response?.data?.error
    if (st === 404) message.warning(text ?? 'Юрлицо с таким БИН в ГБД ЮЛ не найдено')
    else if (st === 503) message.error(text ?? 'Поиск по БИН не настроен (нет API-ключа data.egov.kz)')
    else if (st === 400) message.warning(text ?? 'БИН должен содержать 12 цифр')
    else message.error(text ?? 'data.egov.kz временно недоступен')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.bin-lookup-btn { white-space: nowrap; }
</style>
