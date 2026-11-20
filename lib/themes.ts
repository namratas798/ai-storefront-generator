import type { Theme } from "./schema";

export const THEME_STYLES: Record<
  Theme,
  { name: string; bg: string; card: string; text: string; muted: string; accent: string; accentText: string; chip: string; hero: string }
> = {
  sunrise: {
    name: "Sunrise",
    bg: "#FFF7F0",
    card: "#FFFFFF",
    text: "#2B1A12",
    muted: "#7A5E50",
    accent: "#F0562A",
    accentText: "#FFFFFF",
    chip: "#FFE6D8",
    hero: "linear-gradient(135deg,#FF8A4C 0%,#F0562A 55%,#D9365E 100%)",
  },
  mint: {
    name: "Mint",
    bg: "#F2FBF7",
    card: "#FFFFFF",
    text: "#0F2A22",
    muted: "#4E6B61",
    accent: "#0E9F6E",
    accentText: "#FFFFFF",
    chip: "#D7F3E7",
    hero: "linear-gradient(135deg,#34D399 0%,#0E9F6E 60%,#0B7A6B 100%)",
  },
  midnight: {
    name: "Midnight",
    bg: "#0E1020",
    card: "#181B33",
    text: "#F1F2FA",
    muted: "#A4A8C7",
    accent: "#8B7CFF",
    accentText: "#0E1020",
    chip: "#262A4D",
    hero: "linear-gradient(135deg,#3B2F8F 0%,#5B4BD6 55%,#8B7CFF 100%)",
  },
};
