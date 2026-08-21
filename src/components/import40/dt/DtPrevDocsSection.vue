<template>
  <div class="prev-docs">
    <div v-for="(p, i) in items" :key="i" class="prev-docs-row">
      <a-auto-complete
        v-model:value="p.docTypeCode"
        :options="classifiers.options('prev-doc-types')"
        :disabled="readonly"
        placeholder="Вид документа"
        style="width: 260px"
        @change="emitChange"
      />
      <a-input v-model:value="p.docNumber" :disabled="readonly" placeholder="Номер" style="width: 200px" @change="emitChange" />
      <a-date-picker
        v-model:value="p.docDate"
        format="DD.MM.YYYY"
        value-format="YYYY-MM-DD"
        :disabled="readonly"
        placeholder="Дата"
        @change="emitChange"
      />
      <a-input v-model:value="p.goodsNumber" :disabled="readonly" placeholder="№ товара" style="width: 120px" @change="emitChange" />
      <a-button v-if="!readonly" type="text" danger size="small" @click="remove(i)"><CloseOutlined /></a-button>
    </div>
    <div v-if="items.length === 0" class="empty-state">
      <span v-if="!readonly">Нажмите «+ Предшествующий документ» чтобы добавить позицию</span>
      <span v-else>Нет предшествующих документов</span>
    </div>
    <a-button v-if="!readonly" type="dashed" size="small" @click="add">+ Предшествующий документ</a-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import { useClassifiersStore } from '@/stores/classifiers'
import type { Import40PrevDocItem } from '@/api/import40'
import './dt-sections.css'

const props = defineProps<{ modelValue: Import40PrevDocItem[]; readonly: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [Import40PrevDocItem[]] }>()

const classifiers = useClassifiersStore()

// Строки — плоские объекты (все поля примитивные), поэтому копия через
// spread на каждый элемент уже является глубокой копией; та же дисциплина,
// что и у transport-массивов в DtSectionTransport.vue.
const items = ref<Import40PrevDocItem[]>([])

watch(
  () => props.modelValue,
  (v) => { items.value = (v ?? []).map((x) => ({ ...x })) },
  { immediate: true, deep: true },
)

const emitChange = () => emit('update:modelValue', items.value.map((x, i) => ({ ...x, sortOrder: i })))

const add = () => {
  items.value.push({
    docTypeCode: null,
    docNumber: null,
    docDate: null,
    goodsNumber: null,
    goodsItemIndex: null,
    sortOrder: items.value.length,
  })
  emitChange()
}
const remove = (i: number) => {
  items.value.splice(i, 1)
  emitChange()
}
</script>

<style scoped>
.prev-docs {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.prev-docs-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.empty-state {
  font-size: 12px;
  color: var(--atg-muted);
  font-style: italic;
  padding: 6px 0 2px;
}
</style>
