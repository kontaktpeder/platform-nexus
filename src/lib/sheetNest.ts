/**
 * Sheet nest stack — iOS-style layered presentation.
 *
 * Each participating CenteredPopup pushes an id on mount and pops on dismiss
 * start (so under-sheets un-recess during fly-out, not after unmount).
 */

type Listener = () => void;

let nextId = 1;
const stack: number[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function nestPush(): number {
  const id = nextId++;
  stack.push(id);
  notify();
  return id;
}

export function nestPop(id: number): void {
  const idx = stack.lastIndexOf(id);
  if (idx === -1) return;
  stack.splice(idx, 1);
  notify();
}

export function getNestDepth(): number {
  return stack.length;
}

export function getNestIndex(id: number): number {
  return stack.indexOf(id);
}

export function subscribeNest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
