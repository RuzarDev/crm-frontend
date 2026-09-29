import { theme } from 'ant-design-vue'

// ВНИМАНИЕ: значения цветов/радиусов здесь — «сырые» хексы, продублированные из
// дизайн-токенов --z-* в src/assets/main.css (AntD ConfigProvider не читает CSS-переменные).
// При изменении бренд-токенов в main.css СИНХРОНИЗИРУЙТЕ значения здесь вручную.

export const zirconTheme = {
  token: {
    colorPrimary: '#23B5D3',
    colorInfo: '#1580A6',
    colorSuccess: '#1F9D6A',
    colorWarning: '#8A6410',
    colorError: '#C4483B',
    colorText: '#0E1B35',
    colorTextSecondary: '#475569',
    colorBorder: '#E8EBF2',
    colorBorderSecondary: '#EEF1F7',
    colorBgLayout: '#F5F7FB',
    colorBgContainer: '#FFFFFF',
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    controlHeight: 36,
    controlHeightSM: 28,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    boxShadow: '0 4px 12px -4px rgba(14, 27, 53,.12)',
    wireframe: false,
  },
  components: {
    Button: {
      fontWeight: 600,
      controlHeight: 36,
      primaryShadow: 'none',
    },
    Table: {
      headerBg: '#F5F7FB',
      headerColor: '#475569',
      rowHoverBg: '#F5F7FB',
      borderColor: '#E8EBF2',
      cellPaddingBlock: 10,
    },
    Card: {
      borderRadiusLG: 14,
    },
    Input: {
      controlHeight: 36,
      borderRadius: 10,
    },
    Select: {
      controlHeight: 36,
      borderRadius: 10,
    },
    Tabs: {
      itemSelectedColor: '#1580A6',
      inkBarColor: '#23B5D3',
    },
  },
}

export const zirconDarkSiderTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorBgContainer: '#0E1B35',
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      // фон РАСКРЫТОГО подменю (inline) — по умолчанию тёмный алгоритм AntD даёт
      // почти чёрный (#000c17), из-за чего раскрытый «ТН ВЭД» выделялся чёрным
      // прямоугольником поверх navy-сайдбара. Делаем прозрачным, чтобы совпадал.
      darkSubMenuItemBg: 'transparent',
      darkItemColor: '#AEB9CF',
      darkItemSelectedBg: 'rgba(255,255,255,.08)',
      darkItemSelectedColor: '#fff',
      darkItemHoverBg: 'rgba(255,255,255,.05)',
      itemBorderRadius: 9,
    },
  },
}
