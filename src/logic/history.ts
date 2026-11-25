/** A short undo history: pushing past `limit` forgets the oldest entry. */
export class UndoStack<T> {
  private readonly items: T[] = [];

  constructor(readonly limit = 20) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.limit) this.items.shift();
  }

  /** The most recent entry, removed; undefined when there is nothing to undo. */
  pop(): T | undefined {
    return this.items.pop();
  }

  get size(): number {
    return this.items.length;
  }
}
