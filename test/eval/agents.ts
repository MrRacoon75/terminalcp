/**
 * Abstraction for CLI agentic coding tools
 */

export interface Agent {
	name: string;
	command: string;
	workingMarker: string; // Text that appears when agent is processing
	costCommand: string; // Command to get token usage/cost (e.g. "/cost")
	initDelay?: number; // Milliseconds to wait for agent to initialize (default: 3000)
	supportsMcp: boolean; // Whether agent supports MCP servers
	configFiles?: {
		path: string;
		template: (mcpServers?: Record<string, any>) => object;
	}[];
}

export const AGENTS: Record<string, Agent> = {
	claude: {
		name: "Claude Code",
		command: "claude --dangerously-skip-permissions --model sonnet --strict-mcp-config --mcp-config mcp.json",
		workingMarker: "esc to interrupt",
		costCommand: "/cost",
		initDelay: 3000,
		supportsMcp: true,
		configFiles: [
			{
				path: "mcp.json",
				template: (mcpServers?: Record<string, any>) => ({
					mcpServers: mcpServers || {},
				}),
			},
		],
	},
	opencode: {
		name: "OpenCode",
		command: "opencode",
		workingMarker: "esc interrupt",
		costCommand: "/usage", // Assuming OpenCode uses /usage - need to verify
		initDelay: 3000,
		supportsMcp: false, // OpenCode doesn't support MCP yet
	},
	gemini: {
		name: "Gemini",
		command: "gemini",
		workingMarker: "esc to cancel",
		costCommand: "/stats", // Assuming Gemini uses /tokens - need to verify
		initDelay: 3000,
		supportsMcp: true,
		configFiles: [
			{
				path: ".gemini/settings.json",
				template: (mcpServers?: Record<string, any>) => ({
					// Restrict to only these core tools to prevent ~/.gemini/settings.json interference
					coreTools: ["ReadFileTool", "WriteFileTool", "ReplaceFileTool", "GlobTool", "ShellTool"],
					// Only our evaluation MCP servers
					mcpServers: mcpServers || {},
				}),
			},
		],
	},
};

/**
 * Check if an agent is working based on its output
 */
export function isAgentWorking(agent: Agent, output: string): boolean {
	return output.toLowerCase().includes(agent.workingMarker.toLowerCase());
}

/**
 * Get agent by name
 */
export function getAgent(name: string): Agent | undefined {
	return AGENTS[name.toLowerCase()];
}
