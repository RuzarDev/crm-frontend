// Работа КПП на границе (18.10): виды контроля и виды сканов — как на сервере
// (Import40BorderControls.Labels, Import40FileEndpoints.BorderScanKinds).

/** Виды контроля на границе. */
export const BORDER_CONTROL_KINDS = ['phyto', 'veterinary', 'sanitary', 'transport', 'customs', 'other'] as const

/** Виды сканов с границы (раздел border-scans, docKind). */
export const BORDER_SCAN_KINDS = ['cmr', 'transit', 'inspection', 'photo', 'other'] as const
