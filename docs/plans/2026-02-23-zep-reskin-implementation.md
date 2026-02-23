# ZEP Reskin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace pixel-agents' character sprites, UI colors/fonts, and branding with ZEP assets while keeping the VS Code extension architecture unchanged.

**Architecture:** Resource-only swap — extract ZEP preset avatar PNGs, downscale and remap frames to pixel-agents format, replace CSS color variables and font, rename identifiers.

**Tech Stack:** TypeScript, pngjs, CSS custom properties, woff2 fonts

---

## Task 1: Acquire ZEP Preset Avatar PNGs

**Files:**
- Source: ZEP client at `C:\Projects\zep-client\` (CDN URL pattern: `/assets/sprites/avatar/{skinId}-{clothesId}-{faceId}-{hairId}.png`)
- Create: `scripts/zep-source-avatars/` directory to hold 6 raw ZEP avatar PNGs

**Step 1: Identify available preset avatar combinations**

Search the ZEP codebase for preset avatar ID references and default avatar configurations:

```bash
# Find default/sample avatar IDs used in ZEP
grep -r "skinId\|clothesId\|faceId\|hairId\|presetId\|defaultAvatar\|DEFAULT_AVATAR" \
  C:\Projects\zep-client\libs\ --include="*.ts" -l
```

Look at the results to identify 6 visually distinct combinations of `{skinId}-{clothesId}-{faceId}-{hairId}`.

**Step 2: Download or extract 6 preset avatar PNGs**

Option A — From ZEP dev server (if running locally):
```bash
mkdir -p scripts/zep-source-avatars
# Download 6 preset combinations (replace IDs with actual values found in step 1)
curl -o scripts/zep-source-avatars/avatar_0.png "http://localhost:3001/assets/sprites/avatar/1-1-1-1.png"
curl -o scripts/zep-source-avatars/avatar_1.png "http://localhost:3001/assets/sprites/avatar/2-2-2-2.png"
# ... repeat for all 6
```

Option B — From ZEP CDN (production):
```bash
# Use the ZEP asset CDN base URL (check ZEP client env config for the domain)
# Pattern: https://{zep-asset-domain}/assets/sprites/avatar/{s}-{c}-{f}-{h}.png
```

Option C — From ZEP client static assets (if bundled):
```bash
# Check if any preset sprites are bundled in the ZEP client build
find C:\Projects\zep-client -name "*.png" -path "*/avatar/*"
```

**Step 3: Verify each PNG is 432×256 (9 columns × 4 rows of 48×64 frames)**

```bash
npx tsx -e "
const { PNG } = require('pngjs');
const fs = require('fs');
const f = fs.readFileSync('scripts/zep-source-avatars/avatar_0.png');
const png = PNG.sync.read(f);
console.log('Dimensions:', png.width, '×', png.height);
// Expected: 432 × 256
"
```

**Step 4: Commit raw source avatars**

```bash
git add scripts/zep-source-avatars/
git commit -m "feat: add ZEP preset avatar source PNGs for conversion"
```

---

## Task 2: Create ZEP Avatar Conversion Script

**Files:**
- Create: `scripts/convert-zep-avatars.ts`

**Step 1: Write the conversion script**

Create `scripts/convert-zep-avatars.ts` with this logic:

```typescript
/**
 * Convert ZEP preset avatar PNGs to pixel-agents character format.
 *
 * Input:  ZEP preset avatar (432×256, 9×4 grid of 48×64 frames)
 * Output: pixel-agents char (112×96, 7×3 grid of 16×32 frames)
 *
 * Frame mapping (ZEP frame index → pixel-agents column):
 *   walk1 (1)  → col 0     walk2 (2)  → col 1     walk3 (3)  → col 2
 *   sit   (*)  → col 3     sit   (*)  → col 4
 *   idle  (0)  → col 5     idle  (0)  → col 6
 *
 * Direction mapping (ZEP row → pixel-agents row):
 *   ZEP row 0 (down)  → row 0
 *   ZEP row 3 (up)    → row 1
 *   ZEP row 2 (right) → row 2
 *
 * Sit frames are per-direction: down=32, left=33, right=34, up=35
 * (ZEP frame index in the full 36-frame grid)
 *
 * Run: npx tsx scripts/convert-zep-avatars.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { PNG } from 'pngjs'

// ZEP source format
const ZEP_FRAME_W = 48
const ZEP_FRAME_H = 64
const ZEP_COLS = 9  // frames per row in ZEP sheet
// const ZEP_ROWS = 4

// pixel-agents target format
const TARGET_FRAME_W = 16
const TARGET_FRAME_H = 32
const TARGET_COLS = 7  // frames per row in output
const TARGET_ROWS = 3  // down, up, right

// ZEP direction rows → pixel-agents direction rows
// ZEP: row0=down, row1=left, row2=right, row3=up
// pixel-agents: row0=down, row1=up, row2=right
const DIRECTION_MAP = [
  { zepRow: 0, targetRow: 0 }, // down → down
  { zepRow: 3, targetRow: 1 }, // up → up
  { zepRow: 2, targetRow: 2 }, // right → right
]

// For each pixel-agents column, which ZEP frame index (within that direction's row) to use
// ZEP per-direction frames: 0=idle, 1=walk1, 2=walk2, 3=walk3, 4=unused
// Sit frames are at absolute indices 32-35 (row depends on direction)
const FRAME_MAP_WALK = [1, 2, 3]  // cols 0-2: walk frames
const FRAME_MAP_READ = [0, 0]     // cols 5-6: idle frame (standing/reading)

// Sit frame absolute indices per direction: down=32, left=33, right=34, up=35
const SIT_FRAME_FOR_DIRECTION: Record<number, number> = {
  0: 32, // down
  1: 35, // up (ZEP row 3 = up)
  2: 34, // right (ZEP row 2 = right)
}

/**
 * Extract a single frame from ZEP sprite sheet and downscale to target size.
 * Uses nearest-neighbor sampling to preserve pixel art feel.
 */
function extractAndDownscale(
  src: PNG,
  frameIndex: number,
): PNG {
  // Calculate source position from absolute frame index
  const srcCol = frameIndex % ZEP_COLS
  const srcRow = Math.floor(frameIndex / ZEP_COLS)
  const srcX = srcCol * ZEP_FRAME_W
  const srcY = srcRow * ZEP_FRAME_H

  const dst = new PNG({ width: TARGET_FRAME_W, height: TARGET_FRAME_H })
  const scaleX = ZEP_FRAME_W / TARGET_FRAME_W  // 3
  const scaleY = ZEP_FRAME_H / TARGET_FRAME_H  // 2

  for (let dy = 0; dy < TARGET_FRAME_H; dy++) {
    for (let dx = 0; dx < TARGET_FRAME_W; dx++) {
      // Nearest-neighbor: pick center pixel of the source region
      const sx = srcX + Math.floor((dx + 0.5) * scaleX)
      const sy = srcY + Math.floor((dy + 0.5) * scaleY)
      const si = (sy * src.width + sx) * 4
      const di = (dy * TARGET_FRAME_W + dx) * 4
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }

  return dst
}

/**
 * Place a downscaled frame into the output canvas at the given grid position.
 */
function placeFrame(
  dst: PNG,
  frame: PNG,
  col: number,
  row: number,
): void {
  const offX = col * TARGET_FRAME_W
  const offY = row * TARGET_FRAME_H
  for (let y = 0; y < TARGET_FRAME_H; y++) {
    for (let x = 0; x < TARGET_FRAME_W; x++) {
      const si = (y * TARGET_FRAME_W + x) * 4
      const di = ((offY + y) * dst.width + (offX + x)) * 4
      dst.data[di] = frame.data[si]
      dst.data[di + 1] = frame.data[si + 1]
      dst.data[di + 2] = frame.data[si + 2]
      dst.data[di + 3] = frame.data[si + 3]
    }
  }
}

function convertAvatar(inputPath: string, outputPath: string): void {
  const buffer = fs.readFileSync(inputPath)
  const src = PNG.sync.read(buffer)

  if (src.width !== 432 || src.height !== 256) {
    console.warn(`Warning: ${inputPath} is ${src.width}×${src.height}, expected 432×256`)
  }

  const outW = TARGET_FRAME_W * TARGET_COLS  // 112
  const outH = TARGET_FRAME_H * TARGET_ROWS  // 96
  const dst = new PNG({ width: outW, height: outH })

  for (const { zepRow, targetRow } of DIRECTION_MAP) {
    // Cols 0-2: walk frames
    for (let i = 0; i < FRAME_MAP_WALK.length; i++) {
      const zepFrameIdx = zepRow * ZEP_COLS + FRAME_MAP_WALK[i]
      const frame = extractAndDownscale(src, zepFrameIdx)
      placeFrame(dst, frame, i, targetRow)
    }

    // Cols 3-4: sit frames (type1, type2)
    const sitFrameIdx = SIT_FRAME_FOR_DIRECTION[targetRow]
    const sitFrame = extractAndDownscale(src, sitFrameIdx)
    placeFrame(dst, sitFrame, 3, targetRow)
    placeFrame(dst, sitFrame, 4, targetRow)  // duplicate for type2

    // Cols 5-6: idle frames (read1, read2)
    for (let i = 0; i < FRAME_MAP_READ.length; i++) {
      const zepFrameIdx = zepRow * ZEP_COLS + FRAME_MAP_READ[i]
      const frame = extractAndDownscale(src, zepFrameIdx)
      placeFrame(dst, frame, 5 + i, targetRow)
    }
  }

  const outBuffer = PNG.sync.write(dst)
  fs.writeFileSync(outputPath, outBuffer)
  console.log(`✓ ${path.basename(outputPath)} (${outW}×${outH})`)
}

// ── Main ──
const sourceDir = path.join(__dirname, 'zep-source-avatars')
const outDir = path.join(__dirname, '..', 'webview-ui', 'public', 'assets', 'characters')
fs.mkdirSync(outDir, { recursive: true })

const sourceFiles = fs.readdirSync(sourceDir)
  .filter(f => f.endsWith('.png'))
  .sort()

if (sourceFiles.length < 6) {
  console.error(`Need at least 6 source PNGs in ${sourceDir}, found ${sourceFiles.length}`)
  process.exit(1)
}

for (let i = 0; i < 6; i++) {
  const inputPath = path.join(sourceDir, sourceFiles[i])
  const outputPath = path.join(outDir, `char_${i}.png`)
  convertAvatar(inputPath, outputPath)
}

console.log('\nConverted 6 ZEP avatars to pixel-agents format')
```

**Step 2: Run the conversion script**

```bash
npx tsx scripts/convert-zep-avatars.ts
```

Expected output:
```
✓ char_0.png (112×96)
✓ char_1.png (112×96)
✓ char_2.png (112×96)
✓ char_3.png (112×96)
✓ char_4.png (112×96)
✓ char_5.png (112×96)

Converted 6 ZEP avatars to pixel-agents format
```

**Step 3: Visually verify output**

Open the generated `char_0.png` through `char_5.png` in an image viewer. Each should be 112×96 with:
- Row 0: 7 frames facing down (walk, sit, idle)
- Row 1: 7 frames facing up
- Row 2: 7 frames facing right

**Step 4: Commit**

```bash
git add scripts/convert-zep-avatars.ts webview-ui/public/assets/characters/
git commit -m "feat: add ZEP avatar conversion script and generated character PNGs"
```

---

## Task 3: Update spriteData.ts Fallback Templates

**Files:**
- Modify: `webview-ui/src/office/sprites/spriteData.ts` (lines ~325-330 for CHARACTER_PALETTES, lines ~968+ for CHARACTER_TEMPLATES)

The hardcoded fallback templates in `spriteData.ts` are used when character PNGs fail to load. After the ZEP migration, these templates should still provide reasonable fallbacks.

**Step 1: Update CHARACTER_PALETTES colors**

The 6 palettes define the color substitution for fallback templates. Update them to approximate the 6 ZEP avatars' color schemes:

```typescript
// In spriteData.ts, replace the CHARACTER_PALETTES array values:
export const CHARACTER_PALETTES = [
  { skin: '#FFD5B8', shirt: '#6758FF', pants: '#27262E', hair: '#3D2B1F', shoes: '#1A1A1A' },
  { skin: '#FFD5B8', shirt: '#FF5353', pants: '#2A2A3E', hair: '#FFD700', shoes: '#1A1A1A' },
  { skin: '#C68642', shirt: '#15E4BF', pants: '#27262E', hair: '#1A1A1A', shoes: '#2A2A2A' },
  { skin: '#FFDFC4', shirt: '#5246CC', pants: '#3A3A4E', hair: '#8B4513', shoes: '#1A1A1A' },
  { skin: '#8D5524', shirt: '#924AFF', pants: '#27262E', hair: '#2C1608', shoes: '#2A2A2A' },
  { skin: '#F1C27D', shirt: '#0D94FF', pants: '#2A2A3E', hair: '#A0522D', shoes: '#1A1A1A' },
]
```

Note: The actual colors should match the 6 ZEP avatar combinations chosen in Task 1. Adjust after seeing the actual sprites.

**Step 2: Rebuild character PNGs from updated palettes**

```bash
npx tsx scripts/export-characters.ts
```

Wait — this step is only needed if we keep the template-based export. Since Task 2 generates PNGs directly from ZEP sources, the export script becomes a secondary fallback generator only. The fallback templates in spriteData.ts are used at runtime when PNGs don't load — they don't need to match the ZEP sprites perfectly, just look reasonable.

**Step 3: Verify the extension still builds**

```bash
cd /c/Projects/pixel-agents && npm run build
```

Expected: Clean build with no errors.

**Step 4: Commit**

```bash
git add webview-ui/src/office/sprites/spriteData.ts
git commit -m "feat: update fallback character palettes to match ZEP color scheme"
```

---

## Task 4: Replace Font — FS Pixel Sans → Pretendard

**Files:**
- Delete: `webview-ui/src/fonts/FSPixelSansUnicode-Regular.ttf`
- Create: `webview-ui/src/fonts/Pretendard-Regular.woff2`
- Create: `webview-ui/src/fonts/Pretendard-SemiBold.woff2`
- Create: `webview-ui/src/fonts/Pretendard-Bold.woff2`
- Modify: `webview-ui/src/index.css` (lines 1-7 for @font-face, line 60 for body font, line 64 for * selector)

**Step 1: Download Pretendard woff2 fonts**

Pretendard is open source (OFL license): https://github.com/orioncactus/pretendard

```bash
# Download Pretendard woff2 files
cd /c/Projects/pixel-agents/webview-ui/src/fonts

# From the Pretendard CDN or GitHub releases
curl -L -o Pretendard-Regular.woff2 \
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2"
curl -L -o Pretendard-SemiBold.woff2 \
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-SemiBold.woff2"
curl -L -o Pretendard-Bold.woff2 \
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2"
```

**Step 2: Delete old font**

```bash
rm /c/Projects/pixel-agents/webview-ui/src/fonts/FSPixelSansUnicode-Regular.ttf
```

**Step 3: Update index.css @font-face and font-family**

Replace the entire `@font-face` block and update `font-family` references in `webview-ui/src/index.css`:

```css
@font-face {
  font-family: 'Pretendard';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/Pretendard-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Pretendard';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./fonts/Pretendard-SemiBold.woff2') format('woff2');
}

@font-face {
  font-family: 'Pretendard';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('./fonts/Pretendard-Bold.woff2') format('woff2');
}
```

Update `html, body, #root` and `*` selectors:

```css
html, body, #root {
  /* ... existing properties ... */
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}

* {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}
```

**Step 4: Search for any other 'FS Pixel Sans' references**

```bash
grep -r "FS Pixel Sans\|FSPixelSans" webview-ui/src/ --include="*.{ts,tsx,css}"
```

Update any found references to use `'Pretendard'` instead.

**Step 5: Build and verify**

```bash
cd /c/Projects/pixel-agents && npm run build
```

Expected: Clean build. Font files should be bundled by Vite.

**Step 6: Commit**

```bash
git add webview-ui/src/fonts/ webview-ui/src/index.css
git commit -m "feat: replace FS Pixel Sans with Pretendard font family"
```

---

## Task 5: Update CSS Color Variables to ZEP Palette

**Files:**
- Modify: `webview-ui/src/index.css` (lines 9-53, the `:root` block)

**Step 1: Replace CSS custom properties**

Update the `:root` block in `webview-ui/src/index.css`. Map current colors to ZEP design system:

```css
:root {
  --pixel-bg: #27262E;
  --pixel-border: #5D5E69;
  --pixel-border-light: #8C9097;
  --pixel-accent: #6758FF;
  --pixel-green: #15E4BF;
  --pixel-shadow: 2px 2px 0px rgba(42, 39, 65, 0.40);

  /* Button base */
  --pixel-text: rgba(243, 245, 249, 0.9);
  --pixel-text-dim: rgba(140, 144, 151, 0.85);
  --pixel-btn-bg: rgba(255, 255, 255, 0.08);
  --pixel-btn-hover-bg: rgba(255, 255, 255, 0.15);
  --pixel-btn-disabled-opacity: 0.35;

  /* Active/selected button state */
  --pixel-active-bg: rgba(103, 88, 255, 0.25);

  /* Agent button */
  --pixel-agent-bg: rgba(21, 228, 191, 0.15);
  --pixel-agent-hover-bg: rgba(21, 228, 191, 0.3);
  --pixel-agent-border: #15E4BF;
  --pixel-agent-text: rgba(116, 250, 218, 0.95);

  /* Close button */
  --pixel-close-text: rgba(255, 255, 255, 0.5);
  --pixel-close-hover: #FF5353;

  /* Hints & confirmations */
  --pixel-hint-bg: #6758FF;
  --pixel-reset-text: #ecc;
  --pixel-danger-bg: #FF5353;

  /* Vignette */
  --pixel-vignette: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.6) 100%);

  /* Status dot colors */
  --pixel-status-permission: var(--vscode-charts-yellow, #cca700);
  --pixel-status-active: var(--vscode-charts-blue, #6758FF);

  /* ToolOverlay z-index layers */
  --pixel-overlay-z: 100;
  --pixel-overlay-selected-z: 110;
  --pixel-controls-z: 50;
}
```

Key changes:
- `--pixel-bg`: `#1e1e2e` → `#27262E` (ZEP gray-900)
- `--pixel-border`: `#4a4a6a` → `#5D5E69` (ZEP gray-700)
- `--pixel-accent`: `#5a8cff` → `#6758FF` (ZEP primary violet)
- `--pixel-green`: `#5ac88c` → `#15E4BF` (ZEP mint)
- `--pixel-shadow`: uses ZEP shadow color `rgba(42,39,65,...)`
- `--pixel-hint-bg`: `#3278c8` → `#6758FF` (ZEP primary)
- `--pixel-danger-bg`: `#a33` → `#FF5353` (ZEP red)
- Agent colors: adjusted to ZEP mint `#15E4BF`

**Step 2: Build and verify**

```bash
cd /c/Projects/pixel-agents && npm run build
```

**Step 3: Commit**

```bash
git add webview-ui/src/index.css
git commit -m "feat: update CSS color variables to ZEP design system palette"
```

---

## Task 6: Update Canvas Overlay Colors

**Files:**
- Modify: `webview-ui/src/constants.ts` (lines 54-68, overlay color constants)

**Step 1: Update canvas rendering colors**

In `webview-ui/src/constants.ts`, update the overlay color section:

```typescript
// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(103, 88, 255, 0.35)'        // ZEP primary
export const SEAT_AVAILABLE_COLOR = 'rgba(21, 228, 191, 0.35)'  // ZEP mint
export const SEAT_BUSY_COLOR = 'rgba(255, 83, 83, 0.35)'        // ZEP red
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)'          // keep
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)'  // keep
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2]   // keep
export const GHOST_BORDER_HOVER_FILL = 'rgba(103, 88, 255, 0.25)'   // ZEP primary
export const GHOST_BORDER_HOVER_STROKE = 'rgba(103, 88, 255, 0.5)'  // ZEP primary
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)'      // keep
export const GHOST_VALID_TINT = '#15E4BF'                            // ZEP mint
export const GHOST_INVALID_TINT = '#FF5353'                          // ZEP red
export const SELECTION_HIGHLIGHT_COLOR = '#6758FF'                   // ZEP primary
export const DELETE_BUTTON_BG = 'rgba(255, 83, 83, 0.85)'           // ZEP red
export const ROTATE_BUTTON_BG = 'rgba(103, 88, 255, 0.85)'          // ZEP primary
```

Also update the matrix effect head color to use ZEP mint:

```typescript
export const MATRIX_HEAD_COLOR = '#74FADA'  // ZEP mint light (was #ccffcc)
```

**Step 2: Build and verify**

```bash
cd /c/Projects/pixel-agents && npm run build
```

**Step 3: Commit**

```bash
git add webview-ui/src/constants.ts
git commit -m "feat: update canvas overlay colors to ZEP palette"
```

---

## Task 7: Rebrand Extension Identifiers

**Files:**
- Modify: `package.json` (lines 2-9, 24-46)
- Modify: `src/constants.ts` (lines 28-41)

**Step 1: Update package.json**

```json
{
  "name": "zep-agents",
  "displayName": "ZEP Agents",
  "description": "AI agents in a ZEP-style virtual office",
  ...
  "contributes": {
    "commands": [
      {
        "command": "zep-agents.showPanel",
        "title": "ZEP Agents: Show Panel"
      },
      {
        "command": "zep-agents.exportDefaultLayout",
        "title": "ZEP Agents: Export Layout as Default"
      }
    ],
    "viewsContainers": {
      "panel": [
        {
          "id": "zep-agents-panel",
          "title": "ZEP Agents",
          "icon": "$(window)"
        }
      ]
    },
    "views": {
      "zep-agents-panel": [
        {
          "type": "webview",
          "id": "zep-agents.panelView",
          "name": "ZEP Agents"
        }
      ]
    }
  }
}
```

**Step 2: Update src/constants.ts identifiers**

```typescript
// ── User-Level Layout Persistence ─────────────────────────────
export const LAYOUT_FILE_DIR = '.zep-agents';
export const LAYOUT_FILE_NAME = 'layout.json';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;

// ── Settings Persistence ────────────────────────────────────
export const GLOBAL_KEY_SOUND_ENABLED = 'zep-agents.soundEnabled';

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_ID = 'zep-agents.panelView';
export const COMMAND_SHOW_PANEL = 'zep-agents.showPanel';
export const COMMAND_EXPORT_DEFAULT_LAYOUT = 'zep-agents.exportDefaultLayout';
export const WORKSPACE_KEY_AGENTS = 'zep-agents.agents';
export const WORKSPACE_KEY_AGENT_SEATS = 'zep-agents.agentSeats';
export const WORKSPACE_KEY_LAYOUT = 'zep-agents.layout';
```

**Step 3: Update console.log prefixes across the codebase**

Search and replace `[Pixel Agents]` with `[ZEP Agents]` in all `.ts` files under `src/`:

Files to update:
- `src/agentManager.ts` — multiple console.log lines
- `src/fileWatcher.ts` — multiple console.log lines
- `src/layoutPersistence.ts` — console.error line

**Step 4: Update package-lock.json**

```bash
cd /c/Projects/pixel-agents && npm install
```

This regenerates `package-lock.json` with the new package name.

**Step 5: Build and verify**

```bash
npm run build
```

Expected: Clean build. All identifier references should be consistent.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/constants.ts src/agentManager.ts src/fileWatcher.ts src/layoutPersistence.ts
git commit -m "feat: rebrand extension identifiers from pixel-agents to zep-agents"
```

---

## Task 8: Update Webview References

**Files:**
- Modify: `webview-ui/src/App.tsx`
- Modify: `webview-ui/src/components/DebugView.tsx`
- Modify: `webview-ui/src/components/AgentLabels.tsx`
- Modify: `webview-ui/src/office/components/ToolOverlay.tsx`

**Step 1: Find and replace "pixel-agents" / "Pixel Agents" references**

Search in these specific files for `pixel-agents` or `Pixel Agents` strings and update them:

```bash
grep -n "pixel-agents\|Pixel Agents\|pixelAgents" \
  webview-ui/src/App.tsx \
  webview-ui/src/components/DebugView.tsx \
  webview-ui/src/components/AgentLabels.tsx \
  webview-ui/src/office/components/ToolOverlay.tsx
```

Replace any user-visible strings with ZEP equivalents. Internal variable names that use `pixelAgents` can remain (they're not user-facing), but update if they're used as CSS class names or data attributes.

**Step 2: Build and verify**

```bash
cd /c/Projects/pixel-agents && npm run build
```

**Step 3: Commit**

```bash
git add webview-ui/src/
git commit -m "feat: update webview references from Pixel Agents to ZEP Agents"
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTORS.md`
- Modify: `CLAUDE.md`

**Step 1: Update README.md**

Replace references:
- Title: `# Pixel Agents` → `# ZEP Agents`
- Description: update to mention ZEP-style virtual office
- Repository URL references: update if repo is renamed
- Screenshots: note that these will need updating after visual verification
- All instances of "Pixel Agents" → "ZEP Agents"
- All instances of "pixel-agents" → "zep-agents"

**Step 2: Update CONTRIBUTORS.md**

Replace all "Pixel Agents" and "pixel-agents" references.

**Step 3: Update CLAUDE.md**

Replace project title and relevant references. Keep the technical documentation accurate — only change branding strings, not architectural descriptions.

**Step 4: Commit**

```bash
git add README.md CONTRIBUTORS.md CLAUDE.md
git commit -m "docs: update documentation for ZEP Agents branding"
```

---

## Task 10: Final Build and Verification

**Files:** None (verification only)

**Step 1: Clean build**

```bash
cd /c/Projects/pixel-agents
rm -rf dist/ webview-ui/dist/
npm run build
```

Expected: Clean build with zero errors.

**Step 2: Type check**

```bash
npm run check-types
```

Expected: No TypeScript errors.

**Step 3: Lint**

```bash
npm run lint
```

Expected: No lint errors.

**Step 4: Visual verification in Extension Dev Host**

1. Press F5 to launch Extension Development Host
2. Open the ZEP Agents panel
3. Verify:
   - Characters display ZEP avatars (not old pixel art)
   - UI uses ZEP colors (violet primary #6758FF, mint green #15E4BF)
   - Font is Pretendard (not pixel font)
   - Pixel art aesthetic preserved (sharp corners, solid borders)
   - Matrix spawn effect still works
   - Layout editor still works
   - Seat assignment still works
   - hueShift works for 7th+ agents

**Step 5: Commit any fixes**

If any issues found during verification, fix and commit separately.
