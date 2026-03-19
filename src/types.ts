export interface Room {
  id: string;
  type: "quiet" | "loud" | "dragon" | "guard" | "temple";
  minVolume: number;
  maxVolume: number;
  text: string;
  variant?: "normal" | "halfawake" | "grumpy" | "strict";
}

export interface NLUResult {
  topIntent: string;
  entities: any[];
}