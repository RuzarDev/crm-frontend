<template>
  <div class="comments-panel">
    <a-spin :spinning="loading">
      <div v-if="comments.length" class="comments-list">
        <div v-for="c in comments" :key="c.id" class="comment-item">
          <div class="comment-header">
            <span class="comment-author">{{ c.authorUsername }}</span>
            <span class="comment-role-tag" :class="`comment-role--${c.authorRole.trim().toLowerCase()}`">
              {{ formatRole(c.authorRole) }}
            </span>
            <span class="comment-time">{{ formatTime(c.createdAtUtc) }}</span>
            <a-popconfirm
              v-if="canDelete(c)"
              title="Удалить комментарий?"
              ok-text="Да"
              cancel-text="Нет"
              @confirm="handleDelete(c.id)"
            >
              <a-button type="text" size="small" class="comment-delete-btn" danger>
                <DeleteOutlined />
              </a-button>
            </a-popconfirm>
          </div>
          <div class="comment-text">{{ c.text }}</div>
        </div>
      </div>
      <a-empty v-else-if="!loading" description="Нет комментариев" class="empty" />

      <div v-if="!readonly" class="comment-form">
        <a-textarea
          v-model:value="newText"
          placeholder="Написать комментарий…"
          :rows="3"
          :maxlength="2000"
          show-count
          :disabled="posting"
        />
        <a-button
          type="primary"
          :loading="posting"
          :disabled="!newText.trim()"
          @click="handlePost"
          style="margin-top: 8px"
        >
          <SendOutlined />
          Отправить
        </a-button>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import { formatRole } from '@/utils/labels'
import type { ReestrCommentDto } from '@/types/api'
import { DeleteOutlined, SendOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'

const props = defineProps<{
  reestrId: string
  readonly?: boolean
}>()

const authStore = useAuthStore()
const comments = ref<ReestrCommentDto[]>([])
const loading = ref(false)
const posting = ref(false)
const newText = ref('')

const load = async () => {
  loading.value = true
  try {
    comments.value = await reestrApi.listComments(props.reestrId)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const canDelete = (c: ReestrCommentDto) => {
  if (props.readonly) return false
  const isAdmin = (authStore.role || '').trim().toLowerCase() === 'administrator'
  const isAuthor = c.authorId === authStore.userId
  return isAdmin || isAuthor
}

const handlePost = async () => {
  const text = newText.value.trim()
  if (!text) return
  posting.value = true
  try {
    const created = await reestrApi.addComment(props.reestrId, text)
    comments.value.push(created)
    newText.value = ''
  } catch {
    message.error('Не удалось отправить комментарий')
  } finally {
    posting.value = false
  }
}

const handleDelete = async (commentId: string) => {
  try {
    await reestrApi.deleteComment(props.reestrId, commentId)
    comments.value = comments.value.filter((c) => c.id !== commentId)
  } catch {
    message.error('Не удалось удалить комментарий')
  }
}

const formatTime = (iso: string) => dayjs(iso).format('DD.MM.YYYY HH:mm')
</script>

<style scoped>
.comments-panel {
  padding: 4px 0;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.comment-item {
  padding: 12px 14px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: #fafbfd;
  transition: background var(--atg-transition);
}

.comment-item:hover {
  background: #f4f6fb;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.comment-author {
  font-size: 13px;
  font-weight: 700;
  color: var(--atg-ink);
}

.comment-role-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  border: 1px solid transparent;
}

.comment-role--administrator {
  background: rgba(17, 20, 19, 0.08);
  border-color: rgba(17, 20, 19, 0.15);
  color: var(--atg-ink);
}

.comment-role--broker {
  background: rgba(37, 95, 143, 0.08);
  border-color: rgba(37, 95, 143, 0.2);
  color: var(--atg-blue);
}

.comment-role--expeditor {
  background: rgba(40, 107, 75, 0.08);
  border-color: rgba(40, 107, 75, 0.2);
  color: var(--atg-green);
}

.comment-role--client {
  background: var(--atg-accent-soft);
  border-color: rgba(200, 149, 53, 0.25);
  color: var(--atg-accent-strong);
}

.comment-time {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--atg-muted);
  white-space: nowrap;
}

.comment-delete-btn {
  height: 22px;
  width: 22px;
  padding: 0;
  flex-shrink: 0;
}

.comment-text {
  font-size: 13.5px;
  color: var(--atg-charcoal);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty {
  padding: 24px 0;
}

.comment-form {
  border-top: 1px solid var(--atg-line);
  padding-top: 16px;
}
</style>
