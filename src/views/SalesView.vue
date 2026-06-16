<template>
  <div class="sales-page crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Модуль продаж</div>
        <h1 class="crm-page-title">Продажи</h1>
        <p class="crm-page-subtitle">Калькулятор стоимости, коммерческие предложения, контроль маржи.</p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-empty description="Калькулятор и КП появятся здесь">
        <template #image><CalculatorOutlined style="font-size: 48px; color: var(--atg-accent)" /></template>
        <p class="muted">Раздел в разработке: интерактивный расчёт услуг и ТПиН, генерация КП.</p>
      </a-empty>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { CalculatorOutlined } from '@ant-design/icons-vue'
</script>

<style scoped>
.sales-page { display: flex; flex-direction: column; gap: 18px; }
.muted { color: var(--atg-muted); }
</style>
