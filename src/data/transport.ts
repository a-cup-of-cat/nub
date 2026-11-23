// SPEC-GAP: 灰砾试行单带每秒一件，资源面板每秒采样；可按试玩反馈独立调整。
export const transport = {
  capacityPerMinute: 60,
  cell: 32,
  machineWidth: 256,
  machineHeight: 256,
  columnSpacing: 448,
  rowSpacing: 320,
  searchMargin: 12,
  maxSearchCells: 16000,
  maxWaypoints: 32,
  maxBeltsPerPair: 8,
  coordinateLimit: 512,
  readoutSeconds: 1,
  perSecondThreshold: 1,
} as const;
