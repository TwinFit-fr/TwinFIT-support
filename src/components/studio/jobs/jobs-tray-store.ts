import { create } from "zustand";

/**
 * Whether the jobs tray is open (its top-bar button toggles it; starting a paid job or a
 * generation opens it) and the element it renders into: the side-panel slot of the shell, which
 * JobsSlot registers wherever the shell places it.
 */
export const useJobsTray = create<{ open: boolean; setOpen: (open: boolean) => void; slot: HTMLElement | null; setSlot: (slot: HTMLElement | null) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  slot: null,
  setSlot: (slot) => set({ slot }),
}));
