/**
 * Seeded RNG implementation using mulberry32.
 * Crucial for deterministic day simulation.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  // Returns current state for serialization
  public getState(): number {
    return this.state;
  }

  // mulberry32 implementation returning [0, 1)
  public next(): number {
    this.state |= 0;
    this.state = this.state + 0x6D2B79F5 | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public d20(): number {
    return Math.floor(this.next() * 20) + 1;
  }

  public rollHand(size: number): number[] {
    const dice: number[] = [];
    for (let i = 0; i < size; i++) {
      dice.push(this.d20());
    }
    // Sort descending so the player sees best options first
    return dice.sort((a, b) => b - a);
  }

  // Creates a child RNG from current state + string hash
  public fork(label: string): SeededRng {
    let hash = this.state;
    for (let i = 0; i < label.length; i++) {
      hash = ((hash << 5) - hash) + label.charCodeAt(i);
      hash |= 0; // Convert to 32bit int
    }
    // Advance parent state a bit when forking just to ensure progress
    this.next();
    return new SeededRng(hash);
  }

  // Fisher-Yates shuffle
  public shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
