// ── Timing (ms) ──────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 2000;
export const PROJECT_SCAN_INTERVAL_MS = 1000;
export const TOOL_DONE_DELAY_MS = 300;
export const PERMISSION_TIMER_DELAY_MS = 7000;

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 128;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_PATTERN_COUNT = 7;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

// ── User-Level Layout Persistence ─────────────────────────────
export const LAYOUT_FILE_DIR = '.arcadia';
export const LAYOUT_FILE_NAME = 'layout.json';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_ID = 'arcadia.panelView';
export const COMMAND_SHOW_PANEL = 'arcadia.showPanel';
export const COMMAND_EXPORT_DEFAULT_LAYOUT = 'arcadia.exportDefaultLayout';
export const WORKSPACE_KEY_AGENTS = 'arcadia.agents';
export const WORKSPACE_KEY_AGENT_SEATS = 'arcadia.agentSeats';
export const WORKSPACE_KEY_LAYOUT = 'arcadia.layout';
export const TERMINAL_NAME_PREFIX = 'Claude Code';
