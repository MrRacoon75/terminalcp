// Request types
export interface StartArgs {
	action: "start";
	command: string;
	cwd?: string;
	name?: string;
}

export interface StopArgs {
	action: "stop";
	id?: string; // Optional - if not provided, stops all
}

export interface StdinArgs {
	action: "stdin";
	id: string;
	data: string;
	submit?: boolean;
}

export interface StdoutArgs {
	action: "stdout";
	id: string;
	lines?: number;
}

export interface StreamArgs {
	action: "stream";
	id: string;
	since_last?: boolean;
	strip_ansi?: boolean;
}

export interface TermSizeArgs {
	action: "term-size";
	id: string;
}

export interface ResizeArgs {
	action: "resize";
	id: string;
	cols: number;
	rows: number;
}

export interface AttachArgs {
	action: "attach";
	id: string;
}

export interface DetachArgs {
	action: "detach";
	id: string;
}

export interface ListArgs {
	action: "list";
}

export interface KillServerArgs {
	action: "kill-server";
}

export type Args =
	| StartArgs
	| StopArgs
	| StdinArgs
	| StdoutArgs
	| StreamArgs
	| TermSizeArgs
	| ResizeArgs
	| AttachArgs
	| DetachArgs
	| ListArgs
	| KillServerArgs;

export interface AttachResult {
	sessionId: string;
	cols: number;
	rows: number;
	rawOutput?: string;
}

export interface TermSizeResult {
	rows: number;
	cols: number;
	scrollback_lines: number;
}

// Request message
export interface ServerRequest {
	id: string;
	type: "request";
	args: Args;
}

// Response message
export interface ServerResponse {
	id: string;
	type: "response";
	result?: string | AttachResult | TermSizeResult;
	error?: string;
}

// Event message
export interface ServerEvent {
	id: string;
	type: "event";
	event: "output" | "exit" | "resize";
	sessionId?: string;
	data?: string | { cols: number; rows: number } | { exitCode: number };
}

// Union type for all messages
export type ServerMessage = ServerRequest | ServerResponse | ServerEvent;

// Type guards
export function isRequest(msg: ServerMessage): msg is ServerRequest {
	return msg.type === "request";
}

export function isResponse(msg: ServerMessage): msg is ServerResponse {
	return msg.type === "response";
}

export function isEvent(msg: ServerMessage): msg is ServerEvent {
	return msg.type === "event";
}

// Helper to create typed requests
export function createRequest(args: Args): ServerRequest {
	return {
		id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		type: "request",
		args,
	};
}
