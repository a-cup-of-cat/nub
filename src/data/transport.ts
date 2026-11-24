// SPEC-GAP: 灰砾试行单带每秒一件，资源面板每秒采样；可按试玩反馈独立调整。
export const transport = {
  capacityPerMinute: 60,
  cell: 32,
  // SPEC-GAP: 灰砾使用石料和残骸零件手作简易带，每批消耗 1 石头，得到 4 节。
  craftStone:1, craftYield:4,
  sizes:{small:{w:4,h:3},medium:{w:6,h:4},large:{w:7,h:6}},
  columnSpacing:320, rowSpacing:224,
  legacyColumnSpacing:448, legacyRowSpacing:320,
  searchMargin: 12,
  // Radius in cells for relocating an unbuilt machine whose planned site is occupied.
  siteSearch: 24,
  maxSearchCells: 16000,
  maxWaypoints: 32,
  maxBeltsPerPair: 8,
  coordinateLimit: 512,
  // Display only: belt surface speed in canvas px per second, and the cap on drawn cargo per belt.
  // Cargo spacing follows measured flow, so a belt at capacity shows the densest stream.
  visualSpeed: 48,
  maxCargo: 24,
  readoutSeconds: 1,
  perSecondThreshold: 1,
} as const;
