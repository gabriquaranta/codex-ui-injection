interface CdpError {
  readonly message: string;
}

interface CdpMessage<T> {
  readonly id?: number;
  readonly result?: T;
  readonly error?: CdpError;
  readonly method?: string;
  readonly params?: unknown;
}

export class CdpClient {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  readonly #eventListeners = new Map<string, Set<(params: unknown) => void>>();
  #nextId = 0;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => this.#handleMessage(event));
    socket.addEventListener("error", () => this.#rejectPending(new Error("CDP WebSocket error.")));
    socket.addEventListener("close", () => this.#rejectPending(new Error("CDP WebSocket closed.")));
  }

  static async connect(url: URL): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to CDP.")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to the CDP target."));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.#nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for CDP method ${method}.`));
      }, 15_000);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Registers a listener for one CDP event and returns its cleanup function. */
  onEvent(method: string, listener: (params: unknown) => void): () => void {
    const listeners = this.#eventListeners.get(method) ?? new Set<(params: unknown) => void>();
    listeners.add(listener);
    this.#eventListeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#eventListeners.delete(method);
    };
  }

  close(): void {
    this.#socket.close();
  }

  #handleMessage(event: MessageEvent): void {
    const message = JSON.parse(String(event.data)) as CdpMessage<unknown>;
    if (message.id === undefined) {
      if (message.method) {
        for (const listener of this.#eventListeners.get(message.method) ?? []) listener(message.params);
      }
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
