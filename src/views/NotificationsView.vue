<template>
  <div class="notifications-view">
    <a-card title="Уведомления" :bordered="false">
      <template #extra>
        <a-button @click="handleMarkAllRead" :disabled="notificationsStore.unreadCount === 0">
          Отметить все как прочитанные
        </a-button>
      </template>

      <div v-if="notificationsStore.items.length === 0" style="text-align: center; padding: 48px; color: #999">
        Уведомлений нет
      </div>

      <a-list
        v-else
        :data-source="notificationsStore.items"
        item-layout="horizontal"
      >
        <template #renderItem="{ item }">
          <a-list-item
            :class="{ 'notif-unread': !item.isRead }"
            style="padding: 12px 16px; border-radius: 6px; margin-bottom: 4px"
          >
            <a-list-item-meta>
              <template #title>
                <span :style="{ fontWeight: item.isRead ? 'normal' : '600' }">
                  {{ item.message }}
                </span>
              </template>
              <template #description>
                <a-space size="small">
                  <a-tag v-if="item.relatedCode" color="blue">{{ item.relatedCode }}</a-tag>
                  <span>{{ formatTime(item.createdAtUtc) }}</span>
                  <a-tag v-if="!item.isRead" color="orange">Не прочитано</a-tag>
                  <a-tag v-else color="default">Прочитано</a-tag>
                </a-space>
              </template>
            </a-list-item-meta>
            <template #actions>
              <a-button
                v-if="!item.isRead"
                type="link"
                size="small"
                @click="handleMarkRead(item.id)"
              >
                Прочитать
              </a-button>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import dayjs from 'dayjs'
import { useNotificationsStore } from '@/stores/notifications'

const notificationsStore = useNotificationsStore()

const formatTime = (utc: string) => dayjs(utc).format('DD.MM.YYYY HH:mm')

onMounted(() => {
  notificationsStore.fetch()
})

const handleMarkRead = async (id: string) => {
  await notificationsStore.markRead(id)
}

const handleMarkAllRead = async () => {
  await notificationsStore.markAllRead()
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
