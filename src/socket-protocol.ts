import { EventEmitter } from "node:events";
import * as net from "node:net";

export interface SocketMessage {
	type: "output" | "input" | "resize" | "attach" | "detach" | "error";
	clientId: string;
	timestamp: number;
	payload: any;
}

export interface AttachPayload {
	cols: number;
	rows: number;
}

export interface OutputPayload {
	data: string;
}

export interface InputPayload {
	data: string;
}

export interface ResizePayload {
	cols: number;
	rows: number;
}

export class SocketProtocol extends EventEmitter {
	private clients = new Map<string, net.Socket>();
	
	constructor() {
		super();
	}

	/**
	 * Add a client connection
	 */
	addClient(clientId: string, socket: net.Socket): void {
		this.clients.set(clientId, socket);
		
		// Set up socket event handlers
		socket.on("data", (data) => {
			const messages = this.parseMessages(data.toString());
			for (const message of messages) {
				this.emit("message", message, clientId);
			}
		});

		socket.on("close", () => {
			this.clients.delete(clientId);
			this.emit("client-disconnected", clientId);
		});

		socket.on("error", (err) => {
			console.error(`Socket error for client ${clientId}:`, err);
			this.clients.delete(clientId);
		});
	}

	/**
	 * Send a message to a specific client
	 */
	sendToClient(clientId: string, message: Omit<SocketMessage, "timestamp">): void {
		const socket = this.clients.get(clientId);
		if (!socket || socket.destroyed) {
			this.clients.delete(clientId);
			return;
		}

		const fullMessage: SocketMessage = {
			...message,
			timestamp: Date.now(),
		};

		try {
			socket.write(JSON.stringify(fullMessage) + "\n");
		} catch (err) {
			console.error(`Failed to send to client ${clientId}:`, err);
			this.clients.delete(clientId);
		}
	}

	/**
	 * Broadcast a message to all connected clients
	 */
	broadcast(message: Omit<SocketMessage, "clientId" | "timestamp">): void {
		const clientIds = Array.from(this.clients.keys());
		for (const clientId of clientIds) {
			this.sendToClient(clientId, { ...message, clientId });
		}
	}

	/**
	 * Parse incoming messages (handle multiple messages in one chunk)
	 */
	private parseMessages(data: string): SocketMessage[] {
		const messages: SocketMessage[] = [];
		const lines = data.split("\n").filter((line) => line.trim());
		
		for (const line of lines) {
			try {
				const message = JSON.parse(line);
				messages.push(message);
			} catch (err) {
				console.error("Failed to parse message:", line, err);
			}
		}
		
		return messages;
	}

	/**
	 * Get connected client count
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Disconnect all clients
	 */
	disconnectAll(): void {
		for (const [clientId, socket] of this.clients) {
			socket.end();
		}
		this.clients.clear();
	}
}