// Live events inside the server. Chat messages are pushed through here to
// every open screen of the people they are for. The app runs as one server,
// so a simple in-process emitter is enough; nothing here is stored.
import { EventEmitter } from "node:events";

const bus = globalThis.__fieldBus || (globalThis.__fieldBus = new EventEmitter());
bus.setMaxListeners(0);

// Send one event to everyone listening for this email.
export function publish(email, event) {
  bus.emit("to:" + String(email).toLowerCase(), event);
}

export function listen(email, fn) {
  const name = "to:" + String(email).toLowerCase();
  bus.on(name, fn);
  return () => bus.off(name, fn);
}
