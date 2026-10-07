import type { Component } from 'vue'
import {
  PhArchive, PhBooks, PhBuildings, PhChartBar, PhChartLineUp, PhClipboardText, PhCurrencyCircleDollar, PhFileText,
  PhGear, PhHouse, PhMagnifyingGlass, PhPackage, PhPlus, PhReceipt, PhScales, PhShieldCheck, PhTruck, PhUsers, PhWallet,
} from '@phosphor-icons/vue'
import type { NavIcon } from '@/shell/navModel'

// Иконки пунктов меню (модель отдаёт имя, оболочка — компонент Phosphor).
export const NAV_ICONS: Record<NavIcon, Component> = {
  home: PhHouse,
  requests: PhClipboardText,
  transit: PhTruck,
  packages: PhArchive,
  keden: PhShieldCheck,
  clients: PhUsers,
  sales: PhChartLineUp,
  finance: PhWallet,
  analytics: PhChartBar,
  references: PhBooks,
  settings: PhGear,
  shipments: PhPackage,
  plus: PhPlus,
  documents: PhFileText,
  invoices: PhReceipt,
  search: PhMagnifyingGlass,
  rates: PhCurrencyCircleDollar,
  npa: PhScales,
  company: PhBuildings,
}
