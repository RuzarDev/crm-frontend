<template>
  <div class="party-fields">
    <a-button type="dashed" block class="party-toggle-btn" @click="expanded = !expanded">
      <span class="party-toggle-left">
        {{ title }}
        <a-tag :color="hasData ? 'green' : 'default'" class="party-status-tag">
          {{ hasData ? 'Заполнено' : 'Не заполнено' }}
        </a-tag>
      </span>
      <DownOutlined :class="{ 'party-chevron-rotated': expanded }" class="party-chevron" />
    </a-button>
    <div v-if="expanded" class="party-fields-body">
      <a-form-item label="Наименование">
        <a-input v-model:value="local.name" :disabled="readonly" :placeholder="title" />
      </a-form-item>
      <a-form-item label="Страна">
        <a-select
          v-model:value="local.countryCode"
          show-search
          allow-clear
          :disabled="readonly"
          :options="countryOptions"
          :filter-option="filterCountry"
          placeholder="Выберите страну по коду"
        />
      </a-form-item>
      <div class="party-grid-2">
        <a-form-item label="Регион / штат">
          <a-input v-model:value="local.region" :disabled="readonly" />
        </a-form-item>
        <a-form-item label="Город">
          <a-input v-model:value="local.city" :disabled="readonly" />
        </a-form-item>
      </div>
      <a-form-item label="Улица, номер дома, номер офиса">
        <a-input v-model:value="local.street" :disabled="readonly" placeholder="Например: ул. Абая, д. 12, оф. 305" />
      </a-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { DownOutlined } from '@ant-design/icons-vue'
import type { PartyAddress } from '@/types/api'

const props = defineProps<{
  modelValue: PartyAddress
  title: string
  countryOptions: { value: string; label: string }[]
  readonly?: boolean
  defaultExpanded?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PartyAddress): void
}>()

const expanded = ref(!!props.defaultExpanded)

function normalize(v?: PartyAddress | null): PartyAddress {
  return {
    name: v?.name ?? null,
    countryCode: v?.countryCode ?? null,
    region: v?.region ?? null,
    city: v?.city ?? null,
    street: v?.street ?? null,
  }
}

const local = reactive<PartyAddress>(normalize(props.modelValue))

const hasData = computed(() => Object.values(local).some((v) => !!v))

// Guard so that syncing the parent's value into `local` doesn't immediately
// re-emit it back (parent → local → emit → parent loop / cursor-jump risk).
let syncingFromParent = false

watch(
  () => props.modelValue,
  (v) => {
    const next = normalize(v)
    // Skip if nothing actually changed — avoids needless emit churn.
    if (JSON.stringify(next) === JSON.stringify({ ...local })) return
    syncingFromParent = true
    Object.assign(local, next)
  },
)

watch(
  local,
  (v) => {
    if (syncingFromParent) {
      syncingFromParent = false
      return
    }
    emit('update:modelValue', { ...v })
  },
  { deep: true },
)

function filterCountry(input: string, option: { label: string }) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}
</script>

<style scoped>
.party-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.party-toggle-btn :deep(span) {
  display: inline-flex;
  align-items: center;
}

.party-toggle-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.party-status-tag {
  margin: 0;
  font-weight: 400;
}

.party-chevron {
  float: right;
  transition: transform 0.15s;
}

.party-chevron-rotated {
  transform: rotate(180deg);
}

.party-fields-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--atg-line);
  border-radius: 8px;
  background: var(--atg-bg);
}

.party-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
</style>
