# ZEP Reskin Design

## Summary

Transform the pixel-agents public repository's visual identity from custom pixel art to ZEP brand assets. The VS Code extension architecture remains unchanged — only visual resources (character sprites, UI colors, fonts) and branding metadata are replaced.

## Scope

| Area | Change | Keep |
|------|--------|------|
| Characters | ZEP preset avatar sprites | 16×32 frame format, hueShift system, palette diversity |
| UI Theme | ZEP color palette + Pretendard font | Pixel art aesthetic (sharp corners, 2px borders, hard shadows) |
| Branding | Name, description, icon → ZEP | Extension architecture, commands, message protocol |

## 1. Character Sprite Migration

### Source

ZEP preset avatar PNGs: `/assets/sprites/avatar/{skinId}-{clothesId}-{faceId}-{hairId}.png`

- Format: 48×64px per frame, 432×256 canvas (9 columns × 4 rows = 36 frames)
- 4 directions: down (frames 0-4), left (5-9), right (10-14), up (15-19)
- Additional: dance (20-27), jump (28-31), sit (32-35)

### Target

pixel-agents format: 16×32px per frame, 112×96 canvas (7 columns × 3 rows = 21 frames)

- 3 directions: down (row 0), up (row 1), right (row 2), left = flipped right
- 7 frames per direction: walk1, walk2, walk3, type1, type2, read1, read2

### Frame Mapping

```
ZEP frame → pixel-agents frame

walk1 (1/6/11/16)  → walk1 (col 0)
walk2 (2/7/12/17)  → walk2 (col 1)  — also used as idle
walk3 (3/8/13/18)  → walk3 (col 2)
sit   (32/33/34/35) → type1 (col 3)  — seated working pose
sit   (duplicate)   → type2 (col 4)  — same frame, slight variation if available
idle  (0/5/10/15)  → read1 (col 5)  — standing/reading pose
idle  (duplicate)   → read2 (col 6)  — same frame
```

### Direction Mapping

```
ZEP down  (row 0, frames 0-4)   → pixel-agents row 0 (down)
ZEP up    (row 3, frames 15-19) → pixel-agents row 1 (up)
ZEP right (row 2, frames 10-14) → pixel-agents row 2 (right)
ZEP left  (row 1, frames 5-9)   → discarded (flipped from right at runtime)
```

### Conversion Pipeline

1. **Select 6 ZEP preset avatar combinations** with visually distinct appearances
2. **Create `scripts/convert-zep-avatars.ts`**:
   - Input: 6 ZEP preset PNG files (48×64 frames, 432×256 canvas)
   - Remap frames per mapping above
   - Downscale 48×64 → 16×32 using nearest-neighbor (preserve pixel feel)
   - Output: `char_0.png` through `char_5.png` (112×96 each)
3. **Update `scripts/export-characters.ts`**: remove palette-baking logic, use pre-colored ZEP avatars directly
4. **Update `spriteData.ts`**: hardcoded fallback templates updated or replaced with ZEP-derived data
5. **Keep**: `hueShift` system for 7th+ agents, `pickDiversePalette()` logic, sprite cache keying

### Asset Acquisition

- Extract from ZEP client build artifacts or asset CDN
- Select 6 combinations covering diverse skin tones, clothing styles, hair types
- Ensure legal clearance for public repo use

## 2. UI Theme

### Color Mapping

```css
/* index.css :root variables */

/* Current              → ZEP                        */
--pixel-bg:        #1e1e2e → #27262E   /* gray-900       */
--pixel-bg-light:  #2a2a3e → #5D5E69   /* gray-700       */
--pixel-border:    #3a3a5c → #BEC3CC   /* gray-400       */
--pixel-accent:    #7c6fff → #6758FF   /* ZEP primary    */
--pixel-accent-hover:  new → #5246CC   /* primary hover  */
--pixel-text:      #e0e0ff → #F3F5F9   /* gray-100       */
--pixel-text-dim:  #8888aa → #8C9097   /* gray-500       */
--pixel-shadow:    #0a0a14 → rgba(42,39,65,0.18) /* ZEP shadow */
```

### Canvas Overlay Colors

Update `webview-ui/src/constants.ts` canvas rendering colors:
- Seat highlights: `rgba(103,88,255,0.3)` (ZEP primary based)
- Selection outlines: `rgba(103,88,255,0.5)`
- Grid lines, ghost previews: derive from ZEP gray scale

### Font Replacement

```
Remove: webview-ui/src/fonts/FSPixelSans-* (all variants)
Add:    webview-ui/src/fonts/Pretendard-Regular.woff2
        webview-ui/src/fonts/Pretendard-SemiBold.woff2
        webview-ui/src/fonts/Pretendard-Bold.woff2

Update: index.css @font-face declarations
        font-family: 'Pretendard', -apple-system, sans-serif
```

### Preserved Aesthetic

These pixel-art UI patterns are intentionally kept:
- `borderRadius: 0` on all overlays
- `2px solid` border style
- Hard offset shadows (`2px 2px 0px`, color updated to ZEP shadow)
- Solid backgrounds (no transparency/blur)

## 3. Branding & Metadata

### Extension Identity

```json
// package.json
{
  "name": "zep-agents",
  "displayName": "ZEP Agents",
  "description": "AI agents in a ZEP-style virtual office"
}
```

### Internal Identifiers

```typescript
// src/constants.ts
WEBVIEW_VIEW_TYPE: 'zepAgents.officeView'
COMMAND_PREFIX: 'zep-agents'
```

### Assets

- Replace VS Code sidebar icon with ZEP-branded icon
- Update README.md screenshots with ZEP-themed result
- Update project description for ZEP branding context

## 4. Files Changed

### Character Pipeline
- `scripts/convert-zep-avatars.ts` — NEW: ZEP → pixel-agents sprite converter
- `scripts/export-characters.ts` — UPDATE: remove palette-baking, use ZEP avatars
- `webview-ui/public/assets/characters/char_0.png` ~ `char_5.png` — REPLACE
- `webview-ui/src/office/sprites/spriteData.ts` — UPDATE: fallback templates

### UI Theme
- `webview-ui/src/index.css` — UPDATE: CSS variables, @font-face
- `webview-ui/src/constants.ts` — UPDATE: canvas overlay colors
- `webview-ui/src/fonts/` — REPLACE: FS Pixel Sans → Pretendard

### Branding
- `package.json` — UPDATE: name, displayName, description
- `src/constants.ts` — UPDATE: view type, command prefix
- `assets/icon.png` (or similar) — REPLACE
- `README.md` — UPDATE: screenshots, description

## 5. Out of Scope

- Tile/floor/wall assets (keep current pixel art)
- Furniture assets (keep current)
- Rendering engine changes (keep custom canvas)
- Frame size / tile size changes (keep 16×32 / 16×16)
- ZEP platform integration (no iframe embed, no ZEP API)
- Multi-layer avatar compositing (use preset only)
