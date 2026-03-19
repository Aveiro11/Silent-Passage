import type { Room } from "./types";

export async function loadRooms(xml: string): Promise<Room[]> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, "application/xml");

  const roomElements = Array.from(xmlDoc.getElementsByTagName("room"));

  return roomElements.map((r) => ({
    id: r.getAttribute("id") || "unknown",
    type: (r.getAttribute("type") || "quiet") as "quiet" | "loud",
    minVolume: Number(r.getAttribute("minVolume") || 0),
    maxVolume: Number(r.getAttribute("maxVolume") || 100),
    text: r.textContent || ""
  }));
}