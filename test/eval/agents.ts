/**
 * Abstraction for CLI agentic coding tools
 */

export interface ModelUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface UsageData {
	totalCost: number;
	totalDurationWall: string;
	models: Record<string, ModelUsage>;
}

export interface Agent {
	name: string;
	command: string;
	workingMarker: string; // Text that appears when agent is processing
	costCommand: string; // Command to get token usage/cost (e.g. "/cost")
	initDelay?: number; // Milliseconds to wait for agent to initialize (default: 3000)
	supportsMcp: boolean; // Whether agent supports MCP servers
	parseUsage: (output: string) => UsageData; // Parse agent-specific usage output
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
		parseUsage: parseClaudeUsage,
		configFiles: [
			{
				path: "mcp.json",
				template: (mcpServers?: Record<string, any>) => ({
					mcpServers: mcpServers || {},
				}),
			},
		],
	},
	gemini: {
		name: "Gemini",
		command: "gemini --yolo",
		workingMarker: "esc to cancel",
		costCommand: "/stats",
		initDelay: 6000,
		supportsMcp: true,
		parseUsage: parseGeminiUsage,
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
	// Handle agent name mappings
	const agentMap: Record<string, string> = {
		"claude-code": "claude",
		claude: "claude",
		gemini: "gemini",
	};

	const mappedName = agentMap[name.toLowerCase()];
	return mappedName ? AGENTS[mappedName] : undefined;
}

/**
 * Parse Claude Code usage output
 */
function parseClaudeUsage(output: string): UsageData {
	const lines = output.split("\n");
	const lastLines = lines.slice(-100).join("\n");

	// Extract cost
	const costMatch = lastLines.match(/Total cost:\s+\$?([\d.]+)/);
	const totalCost = costMatch ? parseFloat(costMatch[1]) : 0;

	// Extract wall time
	const wallTimeMatch = lastLines.match(/Total duration \(wall\):\s+([\dm\s.]+s)/);
	const totalDurationWall = wallTimeMatch ? wallTimeMatch[1].trim() : "";

	// Extract model usage
	const models: Record<string, ModelUsage> = {};

	// Look for usage by model section
	const usageSection = lastLines.match(/Usage by model:([\s\S]*?)(?:\n\n|\n╭|$)/);

	if (usageSection) {
		const usageLines = usageSection[1].split("\n").filter((line) => line.trim());

		for (const line of usageLines) {
			// Match model name and usage
			const modelMatch = line.match(/^\s*([\w-]+):\s+(.*)/);
			if (modelMatch) {
				const modelName = modelMatch[1].trim();
				const usageStr = modelMatch[2].trim();
				models[modelName] = parseClaudeUsageString(usageStr);
			}
		}
	}

	return { totalCost, totalDurationWall, models };
}

/**
 * Parse Claude usage string format
 */
function parseClaudeUsageString(usageStr: string): ModelUsage {
	// Parse strings like "100.6k input, 1.5k output, 0 cache read, 0 cache write"
	const parseValue = (str: string): number => {
		const match = str.match(/^([\d.]+)([km]?)/);
		if (!match) return 0;

		const num = parseFloat(match[1]);
		const unit = match[2];

		if (unit === "k") return num * 1000;
		if (unit === "m") return num * 1000000;
		return num;
	};

	const parts = usageStr.split(",").map((s) => s.trim());

	const input = parseValue(parts[0]);
	const output = parseValue(parts[1]);
	const cacheRead = parseValue(parts[2]);
	const cacheWrite = parseValue(parts[3]);

	return { input, output, cacheRead, cacheWrite };
}

/**
 * Parse Gemini usage output
 */
function parseGeminiUsage(output: string): UsageData {
	const lines = output.split("\n");
	const lastLines = lines.slice(-100).join("\n");

	// Gemini doesn't provide cost, default to 0
	const totalCost = 0;

	// Extract wall time from Gemini stats
	// "Total duration (wall)    56.1s"
	const wallTimeMatch = lastLines.match(/Total duration \(wall\)\s+([\d.]+s)/);
	const totalDurationWall = wallTimeMatch ? wallTimeMatch[1].trim() : "";

	// Extract token usage from Gemini stats
	const models: Record<string, ModelUsage> = {};

	// Parse Cumulative section
	// "Input Tokens           117,155"
	// "Output Tokens              562"
	// "Thoughts Tokens          1,165"
	// "Cached Tokens   47,449 (39.9%)"

	const inputMatch = lastLines.match(/Input Tokens\s+[\d,]+\s+Input Tokens\s+([\d,]+)/);
	const outputMatch = lastLines.match(/Output Tokens\s+[\d,]+\s+Output Tokens\s+([\d,]+)/);
	const thoughtsMatch = lastLines.match(/Thoughts Tokens\s+[\d,]+\s+Thoughts Tokens\s+([\d,]+)/);
	const cachedMatch = lastLines.match(/Cached Tokens\s+[\d,]+\s+Cached Tokens\s+([\d,]+)/);

	const parseNumber = (str: string | undefined): number => {
		if (!str) return 0;
		return parseInt(str.replace(/,/g, ""));
	};

	// Gemini doesn't separate by model, so use a single "gemini" entry
	// Also doesn't distinguish cache read/write, so put cached tokens in cacheRead
	models["gemini"] = {
		input: parseNumber(inputMatch?.[1]),
		output: parseNumber(outputMatch?.[1]) + parseNumber(thoughtsMatch?.[1]), // Include thoughts in output
		cacheRead: parseNumber(cachedMatch?.[1]),
		cacheWrite: 0,
	};

	return { totalCost, totalDurationWall, models };
}
