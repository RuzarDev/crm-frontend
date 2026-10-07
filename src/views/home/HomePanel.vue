<script setup lang="ts">
import { useId } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZSkeleton from '@/components/z/ZSkeleton.vue'

// Панель правой колонки Главной (макет Main.dc): заголовок, подпись, ссылка в раздел; своя загрузка и ошибка.
defineProps<{
  title: string
  caption?: string
  linkTo?: string
  linkLabel?: string
  loading?: boolean
  error?: boolean
}>()
defineEmits<{ retry: [] }>()

const { t } = useI18n()
const id = useId()
// Ширины строк скелетона — разные, чтобы заглушка походила на список, а не на штрихкод.
const SKELETON = ['58%', '46%', '64%', '40%']
</script>

<template>
  <section
    :aria-labelledby="id"
    :aria-busy="loading || undefined"
    class="flex flex-col gap-3 rounded-panel border border-line bg-surface px-4.5 py-4"
  >
    <div class="flex items-baseline gap-3">
      <div class="min-w-0">
        <h2 :id="id" class="m-0 text-base font-semibold text-ink">{{ title }}</h2>
        <p v-if="caption" class="m-0 mt-0.5 text-xs text-muted">{{ caption }}</p>
      </div>
      <RouterLink
        v-if="linkTo"
        :to="linkTo"
        class="ml-auto shrink-0 rounded-[4px] text-[13px] font-medium text-zircon-ink no-underline outline-hidden transition-colors duration-150 hover:text-ink focus-visible:shadow-focus motion-reduce:transition-none"
      >{{ linkLabel }}</RouterLink>
    </div>

    <div v-if="loading" data-home-skeleton class="flex flex-col gap-3 py-0.5">
      <div v-for="w in SKELETON" :key="w" class="flex items-center justify-between gap-6">
        <ZSkeleton :width="w" height="12px" class="flex-1" />
        <ZSkeleton width="44px" height="12px" class="shrink-0" />
      </div>
    </div>
    <div v-else-if="error" class="flex items-center gap-3">
      <p class="m-0 min-w-0 flex-1 text-sm text-ink-3">{{ t('home.blockError') }}</p>
      <ZButton size="sm" @click="$emit('retry')">{{ t('home.retry') }}</ZButton>
    </div>
    <slot v-else />
  </section>
</template>
