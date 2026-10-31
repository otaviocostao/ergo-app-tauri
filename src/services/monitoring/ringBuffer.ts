/** Fixed storage: insertion overwrites the oldest item once capacity is reached. */
export class RingBuffer<T> {
  private readonly slots: (T | undefined)[];
  private next = 0;
  private count = 0;

  constructor(readonly capacity = 600) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Ring buffer capacity must be a positive integer");
    }
    this.slots = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(value: T): void {
    this.slots[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  values(): T[] {
    const start = (this.next - this.count + this.capacity) % this.capacity;
    return Array.from({ length: this.count }, (_, index) =>
      this.slots[(start + index) % this.capacity] as T,
    );
  }

  clear(): void {
    // Release references, including slots that are no longer logically occupied.
    this.slots.fill(undefined);
    this.next = 0;
    this.count = 0;
  }
}
