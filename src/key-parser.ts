/**
 * Key parser for converting symbolic key names to escape sequences
 * Based on tmux's key handling approach
 */

// Special key mappings based on common terminal escape sequences
const SPECIAL_KEYS: Record<string, string> = {
	// Navigation keys
	Up: "\x1b[A",
	Down: "\x1b[B",
	Left: "\x1b[D",
	Right: "\x1b[C",
	Home: "\x1b[H",
	End: "\x1b[F",

	// Page navigation
	PageUp: "\x1b[5~",
	PageDown: "\x1b[6~",
	PgUp: "\x1b[5~", // Alias
	PgDn: "\x1b[6~", // Alias
	PPage: "\x1b[5~", // Alias (tmux style)
	NPage: "\x1b[6~", // Alias (tmux style)

	// Editing keys
	Insert: "\x1b[2~",
	Delete: "\x1b[3~",
	IC: "\x1b[2~", // Alias (tmux style)
	DC: "\x1b[3~", // Alias (tmux style)

	// Special characters
	Enter: "\r",
	Tab: "\t",
	BTab: "\x1b[Z", // Shift-Tab
	Space: " ",
	Escape: "\x1b",
	Esc: "\x1b", // Alias
	BSpace: "\x7f", // Backspace
	Backspace: "\x7f", // Alias

	// Function keys
	F1: "\x1bOP",
	F2: "\x1bOQ",
	F3: "\x1bOR",
	F4: "\x1bOS",
	F5: "\x1b[15~",
	F6: "\x1b[17~",
	F7: "\x1b[18~",
	F8: "\x1b[19~",
	F9: "\x1b[20~",
	F10: "\x1b[21~",
	F11: "\x1b[23~",
	F12: "\x1b[24~",

	// Keypad keys
	KP0: "\x1bOp",
	KP1: "\x1bOq",
	KP2: "\x1bOr",
	KP3: "\x1bOs",
	KP4: "\x1bOt",
	KP5: "\x1bOu",
	KP6: "\x1bOv",
	KP7: "\x1bOw",
	KP8: "\x1bOx",
	KP9: "\x1bOy",
	"KP/": "\x1bOo",
	"KP*": "\x1bOj",
	"KP-": "\x1bOm",
	"KP+": "\x1bOk",
	"KP.": "\x1bOn",
	KPEnter: "\x1bOM",
};

// Control character mappings for Ctrl combinations
const CONTROL_CHARS: Record<string, string> = {
	"@": "\x00", // Ctrl+@ = NULL
	a: "\x01", // Ctrl+A
	b: "\x02", // Ctrl+B
	c: "\x03", // Ctrl+C
	d: "\x04", // Ctrl+D
	e: "\x05", // Ctrl+E
	f: "\x06", // Ctrl+F
	g: "\x07", // Ctrl+G (Bell)
	h: "\x08", // Ctrl+H (Backspace)
	i: "\x09", // Ctrl+I (Tab)
	j: "\x0a", // Ctrl+J (Line feed)
	k: "\x0b", // Ctrl+K
	l: "\x0c", // Ctrl+L (Form feed)
	m: "\x0d", // Ctrl+M (Carriage return)
	n: "\x0e", // Ctrl+N
	o: "\x0f", // Ctrl+O
	p: "\x10", // Ctrl+P
	q: "\x11", // Ctrl+Q
	r: "\x12", // Ctrl+R
	s: "\x13", // Ctrl+S
	t: "\x14", // Ctrl+T
	u: "\x15", // Ctrl+U
	v: "\x16", // Ctrl+V
	w: "\x17", // Ctrl+W
	x: "\x18", // Ctrl+X
	y: "\x19", // Ctrl+Y
	z: "\x1a", // Ctrl+Z
	"[": "\x1b", // Ctrl+[ (Escape)
	"\\": "\x1c", // Ctrl+\
	"]": "\x1d", // Ctrl+]
	"^": "\x1e", // Ctrl+^
	_: "\x1f", // Ctrl+_
	"?": "\x7f", // Ctrl+? (Delete)
};

/**
 * Parse a single key sequence into its terminal escape sequence
 *
 * Supports:
 * - Plain characters: "a", "1", etc.
 * - Special keys: "Enter", "Tab", "Up", etc.
 * - Control sequences: "C-c", "^c"
 * - Meta sequences: "M-x"
 * - Shift sequences: "S-Tab" (for supported keys)
 * - Combined modifiers: "C-M-x", "M-S-Left"
 * - Hex notation: "0x41" for Unicode codepoints
 *
 * @param key The key sequence to parse
 * @returns The escape sequence string
 */
export function parseKeySequence(key: string): string {
	// Handle empty string
	if (!key) return "";

	// Handle hex notation (0x...)
	if (key.startsWith("0x")) {
		const codePoint = parseInt(key, 16);
		if (!isNaN(codePoint)) {
			return String.fromCharCode(codePoint);
		}
		// If parsing fails, treat as literal string
		return key;
	}

	// Handle ^x notation for Ctrl
	if (key.length === 2 && key[0] === "^") {
		const char = key[1].toLowerCase();
		if (CONTROL_CHARS[char]) {
			return CONTROL_CHARS[char];
		}
		// If not a valid control char, return as-is
		return key;
	}

	// Parse modifiers (C-, M-, S-)
	const modifiers: string[] = [];
	let remaining = key;

	// Extract modifiers (case insensitive)
	while (true) {
		const match = remaining.match(/^([CMS])-(.+)$/i);
		if (!match) break;

		const modifier = match[1].toUpperCase();
		if (!modifiers.includes(modifier)) {
			modifiers.push(modifier);
		}
		remaining = match[2];
	}

	// Check if remaining is a special key
	let baseSequence = SPECIAL_KEYS[remaining];

	// If not a special key, treat as literal character(s)
	if (!baseSequence) {
		// For single characters with Shift, uppercase them
		if (modifiers.includes("S") && remaining.length === 1) {
			baseSequence = remaining.toUpperCase();
			// Remove Shift from modifiers since we've applied it
			const shiftIndex = modifiers.indexOf("S");
			if (shiftIndex !== -1) {
				modifiers.splice(shiftIndex, 1);
			}
		} else {
			baseSequence = remaining;
		}
	} else {
		// For special keys with Shift modifier, check if there's a shifted version
		if (modifiers.includes("S")) {
			// Special case: S-Tab should map to BTab
			if (remaining === "Tab") {
				baseSequence = SPECIAL_KEYS["BTab"];
				// Remove Shift from modifiers since we've applied it
				const shiftIndex = modifiers.indexOf("S");
				if (shiftIndex !== -1) {
					modifiers.splice(shiftIndex, 1);
				}
			}
		}
	}

	// Apply Control modifier
	if (modifiers.includes("C")) {
		// Only apply to single characters
		if (baseSequence.length === 1) {
			const char = baseSequence.toLowerCase();
			if (CONTROL_CHARS[char]) {
				baseSequence = CONTROL_CHARS[char];
			}
		}
		// For special keys with control, we keep the original sequence
		// and terminals will interpret Ctrl+Arrow differently
	}

	// Apply Meta modifier (ESC prefix)
	if (modifiers.includes("M")) {
		baseSequence = "\x1b" + baseSequence;
	}

	return baseSequence;
}

/**
 * Parse a key input which can be a string or array of strings
 * Used by CLI to handle :: prefix notation
 *
 * @param input Single string or array of key sequences
 * @returns The combined escape sequence string
 */
export function parseKeyInput(input: string | string[]): string {
	if (Array.isArray(input)) {
		// Process each element - check for :: prefix
		return input
			.map((key) => {
				if (key.startsWith("::")) {
					// Remove :: prefix and parse as key
					return parseKeySequence(key.slice(2));
				}
				// No prefix - treat as literal text
				return key;
			})
			.join("");
	}

	if (typeof input === "string") {
		// Single string - check for :: prefix
		if (input.startsWith("::")) {
			return parseKeySequence(input.slice(2));
		}
		// No prefix - treat as literal
		return input;
	}

	return "";
}

/**
 * Helper function to build input strings for TerminalManager.sendInput()
 * Converts symbolic key names to escape sequences
 *
 * @example
 * import { buildInput } from './key-parser.js';
 *
 * // Using symbolic key names
 * const input = buildInput("echo hello", "Left", "Left", "world ", "Enter");
 * await manager.sendInput(sessionId, input);
 *
 * // Mixed literal text and keys
 * const input = buildInput("vim test.txt", "Enter", "i", "Hello", "Escape", ":wq", "Enter");
 * await manager.sendInput(sessionId, input);
 *
 * @param parts Array of strings where each can be literal text or a symbolic key name
 * @returns Combined string with escape sequences
 */
export function buildInput(...parts: string[]): string {
	return parts.map((part) => parseKeySequence(part)).join("");
}
