import { EventEmitter } from 'node:events';
import { uid } from './util.js';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

/** Broadcast to every connected UI tab (Server-Sent Events). */
export const emit = (type, data) => bus.emit('event', { type, data });

// ---- long-running tasks (imports, conversions, account connections) ----
const tasks = new Map();
const lastEmit = new WeakMap();

export function createTask(kind, meta = {}) {
  const task = { id: uid(10), kind, status: 'running', percent: 0, message: '', error: null, createdAt: Date.now(), ...meta };
  tasks.set(task.id, task);
  emit('task', task);
  return task;
}

export function updateTask(task, patch) {
  const statusChanged = patch.status && patch.status !== task.status;
  Object.assign(task, patch);
  const now = Date.now();
  if (statusChanged || task.status !== 'running' || now - (lastEmit.get(task) || 0) > 200) {
    lastEmit.set(task, now);
    emit('task', task);
  }
}

export const getTask = (id) => tasks.get(id);
export const listTasks = () => [...tasks.values()];

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, t] of tasks) if (t.status !== 'running' && t.status !== 'waiting' && t.createdAt < cutoff) tasks.delete(id);
}, 10 * 60 * 1000).unref();
