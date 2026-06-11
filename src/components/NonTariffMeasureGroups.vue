<template>
  <a-collapse v-if="groups.length" ghost style="margin-top:12px">
    <a-collapse-panel v-for="g in groups" :key="g.key">
      <template #header>
        <a-tag :color="g.color">{{ g.label }}</a-tag>
        <span class="muted">{{ g.items.length }}</span>
      </template>
      <div v-for="(m, i) in g.items" :key="i" class="mnrs-act">
        <div class="mnrs-act-name">{{ m.name }}</div>
        <div v-if="m.comment" class="muted">{{ m.comment }}</div>
        <div v-if="m.resolutionName" class="muted">
          <a v-if="m.resolutionUrl" :href="m.resolutionUrl" target="_blank" rel="noopener">{{ m.resolutionName }}</a>
          <span v-else>{{ m.resolutionName }}</span>
          <span v-if="m.resolutionNumber"> № {{ m.resolutionNumber }}</span>
        </div>
      </div>
    </a-collapse-panel>
  </a-collapse>
</template>

<script setup lang="ts">
import type { TnvedNonTariffMeasureDto } from '@/types/api'

export interface NonTariffMeasureGroup {
  key: string
  label: string
  color: string
  items: TnvedNonTariffMeasureDto[]
}

defineProps<{
  groups: NonTariffMeasureGroup[]
}>()
</script>

<style scoped>
.muted { color: var(--atg-muted); }

.mnrs-act {
  font-size: 12px;
  margin-bottom: 10px;
}

.mnrs-act-name {
  font-weight: 600;
  margin-bottom: 4px;
}
</style>
