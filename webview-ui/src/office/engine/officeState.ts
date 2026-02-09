import { TILE_SIZE, CharacterState } from '../types.js'
import type { Character, Seat, FurnitureInstance, TileType as TileTypeVal, OfficeLayout } from '../types.js'
import { createCharacter, updateCharacter } from './characters.js'
import { getWalkableTiles } from '../layout/tileMap.js'
import {
  createDefaultLayout,
  layoutToTileMap,
  layoutToFurnitureInstances,
  layoutToSeats,
  getSeatTiles,
  getBlockedTiles,
} from '../layout/layoutSerializer.js'

export class OfficeState {
  layout: OfficeLayout
  tileMap: TileTypeVal[][]
  seats: Map<string, Seat>
  blockedTiles: Set<string>
  furniture: FurnitureInstance[]
  walkableTiles: Array<{ col: number; row: number }>
  characters: Map<number, Character> = new Map()
  selectedAgentId: number | null = null
  hoveredAgentId: number | null = null
  hoveredTile: { col: number; row: number } | null = null
  private nextPalette = 0

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout()
    this.tileMap = layoutToTileMap(this.layout)
    this.seats = layoutToSeats(this.layout.furniture)
    const seatTiles = getSeatTiles(this.seats)
    this.blockedTiles = getBlockedTiles(this.layout.furniture, seatTiles)
    this.furniture = layoutToFurnitureInstances(this.layout.furniture)
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters. */
  rebuildFromLayout(layout: OfficeLayout): void {
    this.layout = layout
    this.tileMap = layoutToTileMap(layout)
    this.seats = layoutToSeats(layout.furniture)
    const seatTiles = getSeatTiles(this.seats)
    this.blockedTiles = getBlockedTiles(layout.furniture, seatTiles)
    this.furniture = layoutToFurnitureInstances(layout.furniture)
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)

    // Reassign characters to new seats
    // First, clear all seat assignments
    for (const seat of this.seats.values()) {
      seat.assigned = false
    }

    for (const ch of this.characters.values()) {
      const seatId = this.findFreeSeat()
      if (seatId) {
        this.seats.get(seatId)!.assigned = true
        ch.seatId = seatId
      } else {
        ch.seatId = null
      }
    }
  }

  getLayout(): OfficeLayout {
    return this.layout
  }

  private findFreeSeat(): string | null {
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) return uid
    }
    return null
  }

  addAgent(id: number): void {
    if (this.characters.has(id)) return

    const palette = this.nextPalette % 6
    this.nextPalette++

    const seatId = this.findFreeSeat()
    if (seatId) {
      const seat = this.seats.get(seatId)!
      seat.assigned = true
      const ch = createCharacter(id, palette, seatId, seat)
      this.characters.set(id, ch)
    } else {
      // No seats — spawn at random walkable tile
      const spawn = this.walkableTiles.length > 0
        ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
        : { col: 1, row: 1 }
      const ch = createCharacter(id, palette, null, null)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
      this.characters.set(id, ch)
    }
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) seat.assigned = false
    }
    this.characters.delete(id)
    if (this.selectedAgentId === id) this.selectedAgentId = null
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid
    }
    return null
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
    }
    // Assign new seat
    const seat = this.seats.get(seatId)
    if (!seat || seat.assigned) return
    seat.assigned = true
    ch.seatId = seatId
    // Kick out of TYPE/IDLE state so character walks to new seat
    if (ch.state === CharacterState.TYPE || ch.state === CharacterState.IDLE) {
      ch.state = CharacterState.IDLE
      ch.frame = 0
      ch.frameTimer = 0
    }
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.isActive = active
    }
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.currentTool = tool
    }
  }

  update(dt: number): void {
    for (const ch of this.characters.values()) {
      updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles)
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y)
    for (const ch of chars) {
      // Character sprite is 16x24, anchored bottom-center
      const left = ch.x - 8
      const right = ch.x + 8
      const top = ch.y - 24
      const bottom = ch.y
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id
      }
    }
    return null
  }
}
