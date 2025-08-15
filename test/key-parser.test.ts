import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseKeyInput, parseKeySequence } from "../src/key-parser.js";

describe("parseKeySequence", () => {
	describe("plain characters", () => {
		it("should return single characters as-is", () => {
			assert.equal(parseKeySequence("a"), "a");
			assert.equal(parseKeySequence("Z"), "Z");
			assert.equal(parseKeySequence("1"), "1");
			assert.equal(parseKeySequence("!"), "!");
		});

		it("should return multi-character strings as-is", () => {
			assert.equal(parseKeySequence("hello"), "hello");
			assert.equal(parseKeySequence("123"), "123");
		});

		it("should handle empty string", () => {
			assert.equal(parseKeySequence(""), "");
		});
	});

	describe("special keys", () => {
		it("should convert arrow keys", () => {
			assert.equal(parseKeySequence("Up"), "\x1b[A");
			assert.equal(parseKeySequence("Down"), "\x1b[B");
			assert.equal(parseKeySequence("Left"), "\x1b[D");
			assert.equal(parseKeySequence("Right"), "\x1b[C");
		});

		it("should convert navigation keys", () => {
			assert.equal(parseKeySequence("Home"), "\x1b[H");
			assert.equal(parseKeySequence("End"), "\x1b[F");
			assert.equal(parseKeySequence("PageUp"), "\x1b[5~");
			assert.equal(parseKeySequence("PageDown"), "\x1b[6~");
		});

		it("should handle page navigation aliases", () => {
			assert.equal(parseKeySequence("PgUp"), "\x1b[5~");
			assert.equal(parseKeySequence("PgDn"), "\x1b[6~");
			assert.equal(parseKeySequence("PPage"), "\x1b[5~");
			assert.equal(parseKeySequence("NPage"), "\x1b[6~");
		});

		it("should convert editing keys", () => {
			assert.equal(parseKeySequence("Insert"), "\x1b[2~");
			assert.equal(parseKeySequence("Delete"), "\x1b[3~");
			assert.equal(parseKeySequence("IC"), "\x1b[2~");
			assert.equal(parseKeySequence("DC"), "\x1b[3~");
		});

		it("should convert special characters", () => {
			assert.equal(parseKeySequence("Enter"), "\r");
			assert.equal(parseKeySequence("Tab"), "\t");
			assert.equal(parseKeySequence("Space"), " ");
			assert.equal(parseKeySequence("Escape"), "\x1b");
			assert.equal(parseKeySequence("Esc"), "\x1b");
			assert.equal(parseKeySequence("BSpace"), "\x7f");
			assert.equal(parseKeySequence("Backspace"), "\x7f");
			assert.equal(parseKeySequence("BTab"), "\x1b[Z");
		});

		it("should convert function keys", () => {
			assert.equal(parseKeySequence("F1"), "\x1bOP");
			assert.equal(parseKeySequence("F2"), "\x1bOQ");
			assert.equal(parseKeySequence("F5"), "\x1b[15~");
			assert.equal(parseKeySequence("F10"), "\x1b[21~");
			assert.equal(parseKeySequence("F12"), "\x1b[24~");
		});

		it("should convert keypad keys", () => {
			assert.equal(parseKeySequence("KP0"), "\x1bOp");
			assert.equal(parseKeySequence("KP5"), "\x1bOu");
			assert.equal(parseKeySequence("KP9"), "\x1bOy");
			assert.equal(parseKeySequence("KP/"), "\x1bOo");
			assert.equal(parseKeySequence("KP*"), "\x1bOj");
			assert.equal(parseKeySequence("KP-"), "\x1bOm");
			assert.equal(parseKeySequence("KP+"), "\x1bOk");
			assert.equal(parseKeySequence("KPEnter"), "\x1bOM");
		});
	});

	describe("control sequences", () => {
		it("should handle C- notation", () => {
			assert.equal(parseKeySequence("C-c"), "\x03");
			assert.equal(parseKeySequence("C-d"), "\x04");
			assert.equal(parseKeySequence("C-z"), "\x1a");
			assert.equal(parseKeySequence("C-["), "\x1b"); // Escape
			assert.equal(parseKeySequence("C-m"), "\x0d"); // Enter
		});

		it("should handle case-insensitive C- notation", () => {
			assert.equal(parseKeySequence("c-c"), "\x03");
			assert.equal(parseKeySequence("C-C"), "\x03");
			assert.equal(parseKeySequence("c-X"), "\x18");
		});

		it("should handle ^ notation", () => {
			assert.equal(parseKeySequence("^c"), "\x03");
			assert.equal(parseKeySequence("^C"), "\x03");
			assert.equal(parseKeySequence("^["), "\x1b");
			assert.equal(parseKeySequence("^?"), "\x7f");
		});

		it("should handle control with special keys", () => {
			// Control with special keys typically doesn't change the sequence
			// The terminal interprets the control modifier
			assert.equal(parseKeySequence("C-Up"), "\x1b[A");
			assert.equal(parseKeySequence("C-Left"), "\x1b[D");
		});
	});

	describe("meta sequences", () => {
		it("should handle M- notation", () => {
			assert.equal(parseKeySequence("M-x"), "\x1bx");
			assert.equal(parseKeySequence("M-a"), "\x1ba");
			assert.equal(parseKeySequence("M-Z"), "\x1bZ");
		});

		it("should handle case-insensitive M- notation", () => {
			assert.equal(parseKeySequence("m-x"), "\x1bx");
			assert.equal(parseKeySequence("M-X"), "\x1bX");
		});

		it("should handle meta with special keys", () => {
			assert.equal(parseKeySequence("M-Enter"), "\x1b\r");
			assert.equal(parseKeySequence("M-Tab"), "\x1b\t");
			assert.equal(parseKeySequence("M-Up"), "\x1b\x1b[A");
			assert.equal(parseKeySequence("M-Left"), "\x1b\x1b[D");
		});
	});

	describe("shift sequences", () => {
		it("should uppercase single characters with S-", () => {
			assert.equal(parseKeySequence("S-a"), "A");
			assert.equal(parseKeySequence("S-z"), "Z");
		});

		it("should handle case-insensitive S- notation", () => {
			assert.equal(parseKeySequence("s-a"), "A");
			assert.equal(parseKeySequence("S-m"), "M");
		});

		it("should handle shift with special keys", () => {
			// BTab is Shift-Tab
			assert.equal(parseKeySequence("S-Tab"), "\x1b[Z");
		});
	});

	describe("combined modifiers", () => {
		it("should handle C-M- combinations", () => {
			assert.equal(parseKeySequence("C-M-x"), "\x1b\x18"); // ESC + Ctrl-X
			assert.equal(parseKeySequence("C-M-a"), "\x1b\x01"); // ESC + Ctrl-A
			assert.equal(parseKeySequence("M-C-d"), "\x1b\x04"); // Order doesn't matter
		});

		it("should handle C-S- combinations", () => {
			assert.equal(parseKeySequence("C-S-a"), "\x01"); // Control applies to 'A' -> Ctrl-A
			assert.equal(parseKeySequence("S-C-z"), "\x1a"); // Shift then Control
		});

		it("should handle M-S- combinations", () => {
			assert.equal(parseKeySequence("M-S-a"), "\x1bA"); // ESC + uppercase A
			assert.equal(parseKeySequence("S-M-x"), "\x1bX"); // Order doesn't matter
		});

		it("should handle all three modifiers", () => {
			assert.equal(parseKeySequence("C-M-S-a"), "\x1b\x01"); // ESC + Ctrl-A
			assert.equal(parseKeySequence("S-C-M-x"), "\x1b\x18"); // ESC + Ctrl-X
		});

		it("should handle modifiers with special keys", () => {
			assert.equal(parseKeySequence("C-M-Enter"), "\x1b\r");
			assert.equal(parseKeySequence("M-S-Tab"), "\x1b\x1b[Z");
			assert.equal(parseKeySequence("C-M-Up"), "\x1b\x1b[A");
		});
	});

	describe("hex notation", () => {
		it("should parse hex values", () => {
			assert.equal(parseKeySequence("0x41"), "A");
			assert.equal(parseKeySequence("0x20"), " ");
			assert.equal(parseKeySequence("0x0d"), "\r");
			assert.equal(parseKeySequence("0x1b"), "\x1b");
		});

		it("should handle invalid hex as literal", () => {
			assert.equal(parseKeySequence("0xGG"), "0xGG");
			assert.equal(parseKeySequence("0x"), "0x");
		});
	});

	describe("edge cases", () => {
		it("should handle unknown special keys as literal", () => {
			assert.equal(parseKeySequence("UnknownKey"), "UnknownKey");
			assert.equal(parseKeySequence("NotAKey"), "NotAKey");
		});

		it("should handle malformed modifier sequences", () => {
			assert.equal(parseKeySequence("C-"), "C-");
			assert.equal(parseKeySequence("M-"), "M-");
			assert.equal(parseKeySequence("-a"), "-a");
		});

		it("should handle repeated modifiers", () => {
			assert.equal(parseKeySequence("C-C-x"), "\x18"); // Duplicate C- ignored
			assert.equal(parseKeySequence("M-M-a"), "\x1ba"); // Duplicate M- ignored
		});

		it("should handle invalid ^ notation as literal", () => {
			assert.equal(parseKeySequence("^"), "^");
			assert.equal(parseKeySequence("^ab"), "^ab"); // Too long
			assert.equal(parseKeySequence("^1"), "^1"); // Not a control char
		});
	});
});

describe("parseKeyInput", () => {
	it("should handle string input (backward compatibility)", () => {
		assert.equal(parseKeyInput("hello world"), "hello world");
		assert.equal(parseKeyInput("test\r\n"), "test\r\n");
	});

	it("should handle array of plain strings", () => {
		assert.equal(parseKeyInput(["hello", " ", "world"]), "hello world");
		assert.equal(parseKeyInput(["a", "b", "c"]), "abc");
	});

	it("should handle array of special keys with :: prefix", () => {
		assert.equal(parseKeyInput(["::Tab", "::Enter"]), "\t\r");
		assert.equal(parseKeyInput(["::Up", "::Down", "::Left", "::Right"]), "\x1b[A\x1b[B\x1b[D\x1b[C");
	});

	it("should handle mixed array with :: prefix for keys", () => {
		assert.equal(parseKeyInput(["hello", "::Tab", "world", "::Enter"]), "hello\tworld\r");
		assert.equal(parseKeyInput(["::C-a", "test", "::C-e"]), "\x01test\x05");
	});

	it("should handle complex key sequences with :: prefix", () => {
		const input = ["echo hello", "::C-a", "::C-k", "echo world", "::Enter"];
		const expected = "echo hello\x01\x0becho world\r";
		assert.equal(parseKeyInput(input), expected);
	});

	it("should handle empty array", () => {
		assert.equal(parseKeyInput([]), "");
	});

	it("should handle array with empty strings", () => {
		assert.equal(parseKeyInput(["", "a", "", "b", ""]), "ab");
	});

	it("should handle arrow key navigation with :: prefix", () => {
		const input = ["echo test", "::Left", "::Left", "::Left", "::Left", "hi ", "::End"];
		const expected = "echo test\x1b[D\x1b[D\x1b[D\x1b[Dhi \x1b[F";
		assert.equal(parseKeyInput(input), expected);
	});

	it("should handle vim-like commands with :: prefix", () => {
		const input = ["::Escape", ":wq", "::Enter"];
		const expected = "\x1b:wq\r";
		assert.equal(parseKeyInput(input), expected);
	});

	it("should handle interrupt sequences with :: prefix", () => {
		const input = ["npm start", "::Enter", "::C-c", "echo done", "::Enter"];
		const expected = "npm start\r\x03echo done\r";
		assert.equal(parseKeyInput(input), expected);
	});
});
