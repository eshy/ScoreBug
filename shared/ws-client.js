// WebSocket client with auto-reconnect and a server-time offset estimate.

export function connect(onState, onStatus) {
  let ws;
  let offset = 0;
  let state = null;

  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      onStatus?.(true);
      ws.send(JSON.stringify({ type: 'ping', t0: Date.now() }));
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'pong') {
        offset = m.now - (m.t0 + Date.now()) / 2;
        if (state) onState(state, offset);
      } else if (m.type === 'state') {
        state = m.state;
        onState(state, offset);
      }
    };
    ws.onclose = () => {
      onStatus?.(false);
      setTimeout(open, 1000);
    };
  }
  open();

  return {
    send(cmd) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'cmd', cmd }));
    },
    get offset() {
      return offset;
    },
  };
}
