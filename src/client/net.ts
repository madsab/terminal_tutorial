/** 0.5 s, 1 s, 2 s, 4 s, then every 5 s. */
export function backoffDelay(attempt: number): number {
  return Math.min(5000, 500 * 2 ** attempt);
}

export interface NetOptions<In> {
  onMessage(msg: In): void;
  /** Called on every (re)connect. Re-send identity here. */
  onOpen(): void;
  onStatus?(connected: boolean): void;
}

export interface Net<Out> {
  /** Returns false when the socket is down (the message is dropped; resend state in onOpen). */
  send(msg: Out): boolean;
  close(): void;
}

export function wsUrl(): string {
  return new URL('ws', document.baseURI).href.replace(/^http/, 'ws');
}

/** A WebSocket that reconnects with backoff. */
export function createNet<In, Out>(opts: NetOptions<In>, url = wsUrl()): Net<Out> {
  let ws: WebSocket | undefined;
  let attempt = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      attempt = 0;
      opts.onStatus?.(true);
      opts.onOpen();
    };
    ws.onmessage = (e) => {
      try {
        opts.onMessage(JSON.parse(e.data));
      } catch (err) {
        console.error('Ugyldig melding', err);
      }
    };
    ws.onclose = () => {
      opts.onStatus?.(false);
      if (closed) return;
      timer = setTimeout(connect, backoffDelay(attempt++));
    };
  };
  connect();

  return {
    send(msg) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}
