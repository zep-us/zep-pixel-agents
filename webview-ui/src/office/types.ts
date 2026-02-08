export const TILE_SIZE = 16
export const MAP_COLS = 20
export const MAP_ROWS = 11

export const TileType = {
  WALL: 0,
  TILE_FLOOR: 1,
  WOOD_FLOOR: 2,
  CARPET: 3,
  DOORWAY: 4,
} as const
export type TileType = (typeof TileType)[keyof typeof TileType]

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
} as const
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState]

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const
export type Direction = (typeof Direction)[keyof typeof Direction]

/** 2D array of hex color strings (or '' for transparent). [row][col] */
export type SpriteData = string[][]

export interface DeskSlot {
  /** Top-left tile column of 2x2 desk */
  deskCol: number
  /** Top-left tile row of 2x2 desk */
  deskRow: number
  /** Tile column of chair position */
  chairCol: number
  /** Tile row of chair position */
  chairRow: number
  /** Direction character faces when sitting (toward desk center) */
  facingDir: Direction
  assigned: boolean
}

export interface FurnitureInstance {
  sprite: SpriteData
  /** Pixel x (top-left) */
  x: number
  /** Pixel y (top-left) */
  y: number
  /** Y value used for depth sorting (typically bottom edge) */
  zY: number
}

export interface ToolActivity {
  toolId: string
  status: string
  done: boolean
  permissionWait?: boolean
}

export const FurnitureType = {
  DESK: 'desk',
  BOOKSHELF: 'bookshelf',
  PLANT: 'plant',
  COOLER: 'cooler',
  WHITEBOARD: 'whiteboard',
  CHAIR: 'chair',
  PC: 'pc',
  LAMP: 'lamp',
} as const
export type FurnitureType = (typeof FurnitureType)[keyof typeof FurnitureType]

export const EditTool = {
  TILE_PAINT: 'tile_paint',
  FURNITURE_PLACE: 'furniture_place',
  SELECT: 'select',
  ERASER: 'eraser',
} as const
export type EditTool = (typeof EditTool)[keyof typeof EditTool]

export interface FurnitureCatalogEntry {
  type: FurnitureType
  label: string
  footprintW: number
  footprintH: number
  sprite: SpriteData
  isDesk: boolean
}

export interface PlacedFurniture {
  uid: string
  type: FurnitureType
  col: number
  row: number
}

export interface OfficeLayout {
  version: 1
  cols: number
  rows: number
  tiles: TileType[]
  furniture: PlacedFurniture[]
}

export interface Character {
  id: number
  state: CharacterState
  dir: Direction
  /** Pixel position */
  x: number
  y: number
  /** Current tile column */
  tileCol: number
  /** Current tile row */
  tileRow: number
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null
  /** Palette index (0-5) */
  palette: number
  /** Animation frame index */
  frame: number
  /** Time accumulator for animation */
  frameTimer: number
  /** Timer for idle wander decisions */
  wanderTimer: number
  /** Whether the agent is actively working */
  isActive: boolean
  /** Assigned desk slot index, or -1 */
  deskSlot: number
}
