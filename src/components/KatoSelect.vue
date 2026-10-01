<template>
  <a-select
    :value="value ?? undefined"
    show-search
    allow-clear
    :disabled="disabled"
    :filter-option="false"
    :options="options"
    :not-found-content="loading ? undefined : (query ? 'Ничего не найдено' : 'Введите код или название')"
    :placeholder="placeholder"
    @search="onSearch"
    @change="onChange"
    @dropdown-visible-change="onOpen"
  >
    <template v-if="loading" #notFoundContent><a-spin size="small" /></template>
    <template #option="{ code, nameRu, path }">
      <div class="kato-opt">
        <span class="kato-opt__name">{{ nameRu }}</span>
        <span class="kato-opt__meta">{{ code }}<template v-if="path"> · {{ path }}</template></span>
      </div>
    </template>
  </a-select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { katoApi, katoLabel, type KatoDto } from '@/api/kato'

// Селект КАТО с серверным поиском (полный классификатор в клиент не грузим).
// Значение — 9-значный код; подпись выбранного кода подтягиваем отдельно, чтобы
// сохранённая ДТ показывала название, а не голый код.
const props = defineProps<{
  value: string | null | undefined
  disabled?: boolean
  placeholder?: string
}>()
const emit = defineEmits<{ (e: 'update:value', v: string | null): void; (e: 'change', v: string | null): void }>()

type Opt = KatoDto & { value: string; label: string }
const toOpt = (k: KatoDto): Opt => ({ ...k, value: k.code, label: katoLabel(k) })

const options = ref<Opt[]>([])
const loading = ref(false)
const query = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

const runSearch = async (q: string) => {
  const my = ++seq
  loading.value = true
  try {
    const items = await katoApi.search(q, 40)
    if (my !== seq) return
    const current = options.value.find((o) => o.value === props.value)
    const list = items.map(toOpt)
    // Выбранное значение держим в списке, иначе AntD покажет голый код.
    if (current && !list.some((o) => o.value === current.value)) list.unshift(current)
    options.value = list
  } finally {
    if (my === seq) loading.value = false
  }
}

const onSearch = (q: string) => {
  query.value = q
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => runSearch(q.trim()), 250)
}
const onOpen = (open: boolean) => {
  if (open && !query.value && options.value.length <= 1) void runSearch('')
}
const onChange = (v: string | undefined) => {
  const code = v ?? null
  emit('update:value', code)
  emit('change', code)
}

// Подпись для уже сохранённого кода.
const ensureLabel = async (code: string | null | undefined) => {
  if (!code || options.value.some((o) => o.value === code)) return
  const k = await katoApi.get(code)
  if (k && !options.value.some((o) => o.value === code)) options.value = [toOpt(k), ...options.value]
}
watch(() => props.value, (v) => { void ensureLabel(v) }, { immediate: true })
</script>

<style scoped>
.kato-opt { display: flex; flex-direction: column; line-height: 1.25; }
.kato-opt__name { font-weight: 500; }
.kato-opt__meta { font-size: 12px; color: var(--atg-muted, #95a1b7); }
</style>
