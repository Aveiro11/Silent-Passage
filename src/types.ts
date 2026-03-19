export interface Room {
  id: string;
  type: "quiet" | "loud";
  minVolume: number;
  maxVolume: number;
  text: string;
}

export interface NLUResult {
  topIntent: string;
  entities: any[];
}