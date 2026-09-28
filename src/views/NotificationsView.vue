<template>
  <div class="notifications-view">
    <PageHeader :kicker="t('misc.rabochiyStol')" :title="t('misc.uvedomleniya')"
      :subtitle="t('misc.sobytiyaPoVashimZayavkam')">
      <template #actions>
        <a-button :disabled="notificationsStore.unreadCount === 0" @click="handleMarkAllRead"> {{ t('misc.otmetitVseKakProchitannye') }} </a-button>
      </template>
    </PageHeader>

    <a-card :bordered="false">
      <div v-if="items.length === 0 && !loading" style="text-align: center; padding: 48px; color: #999"> {{ t('misc.uvedomleniyNet') }} </div>

      <a-list
        v-else
        :data-source="items"
        item-layout="horizontal"
      >
        <template #renderItem="{ item }">
          <a-list-item
            :class="{ 'notif-unread': !item.isRead }"
            style="padding: 12px 16px; border-radius: 6px; margin-bottom: 4px; cursor: pointer"
            @click="openItem(item)"
          >
            <a-list-item-meta>
              <template #title>
                <span :style="{ fontWeight: item.isRead ? 'normal' : '600' }">
                  {{ item.title }}
                </span>
              </template>
              <template #description>
                <div>{{ item.body }}</div>
                <a-space size="small">
                  <span>{{ formatTime(item.createdAtUtc) }}</span>
                  <a-tag v-if="!item.isRead" color="orange">{{ t('misc.neProchitano') }}</a-tag>
                  <a-tag v-else color="default">{{ t('misc.prochitano') }}</a-tag>
                </a-space>
              </template>
            </a-list-item-meta>
            <template #actions>
              <a-button
                v-if="!item.isRead"
                type="link"
                size="small"
                @click.stop="handleMarkRead(item.id)"
              > {{ t('misc.prochitat') }} </a-button>
            </template>
          </a-list-item>
        </template>
      </a-list>

      <div v-if="hasMore" style="text-align: center; padding-top: 12px">
        <a-button :loading="loading" @click="loadMore">{{ t('misc.pokazatEshcho') }}</a-button>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { useNotificationsStore } from '@/stores/notifications'
import { notificationsApi } from '@/api/notifications'
import PageHeader from '@/components/PageHeader.vue'
import type { AppNotification } from '@/types/api'

const { t } = useI18n()
const router = useRouter()

const notificationsStore = useNotificationsStore()

// Страница «Все уведомления» листает свою страницу целиком (включая прочитанные), в отличие
// от колокольчика, который держит только последние (аудит 2.4/2.5).
const PAGE_SIZE = 30
const items = ref<AppNotification[]>([])
const loading = ref(false)
const hasMore = ref(false)
let offset = 0

const formatTime = (utc: string) => dayjs(utc).format('DD.MM.YYYY HH:mm')

const loadPage = async (reset: boolean) => {
  loading.value = true
  try {
    const res = await notificationsApi.list({ limit: PAGE_SIZE, offset: reset ? 0 : offset })
    items.value = reset ? res.data : [...items.value, ...res.data]
    offset = items.value.length
    hasMore.value = res.data.length === PAGE_SIZE
  } finally {
    loading.value = false
  }
}

const loadMore = () => loadPage(false)

onMounted(() => {
  loadPage(true)
  notificationsStore.refreshUnreadCount()
})

const handleMarkRead = async (id: string) => {
  await notificationsStore.markRead(id)
  const n = items.value.find((x) => x.id === id)
  if (n) n.isRead = true
}

const handleMarkAllRead = async () => {
  await notificationsStore.markAllRead()
  items.value.forEach((n) => (n.isRead = true))
}

// Клик по уведомлению — как в колокольчике: читаем и ведём к заявке/реестру (аудит 2.2).
const openItem = async (item: AppNotification) => {
  if (!item.isRead) await handleMarkRead(item.id)
  if (item.caseId) {
    router.push(`/import-40/${item.caseId}`)
  } else if (item.reestrEntryId) {
    router.push('/reestr')
  }
}
</script>

<style scoped>
.notifications-view {
  max-width: 900px;
  margin: 0 auto;
}

.notif-unread {
  background: #e6f4ff;
}
</style>
