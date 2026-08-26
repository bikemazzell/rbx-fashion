import { LIMITS } from "../../domain/types";

export const PALETTE: readonly { name: string; color: string }[] = [
  { name: "Red", color: "#e53935" },
  { name: "Orange", color: "#fb8c00" },
  { name: "Yellow", color: "#f9d423" },
  { name: "Green", color: "#43a047" },
  { name: "Teal", color: "#00838f" },
  { name: "Blue", color: "#1e6fd9" },
  { name: "Indigo", color: "#3949ab" },
  { name: "Purple", color: "#8e24aa" },
  { name: "Pink", color: "#ec407a" },
  { name: "Brown", color: "#6d4c41" },
  { name: "Black", color: "#26282b" },
  { name: "White", color: "#ffffff" },
];

export const ITEM_CAP_MESSAGE = `You already have ${LIMITS.MAX_LAYERS} items. Delete one to add another.`;

export const EXPORT_FAILED_MESSAGE = "Something went wrong. Try again.";

export const SAVE_TOO_BIG_MESSAGE = "This project is too big to save. Delete some pictures and try again.";

export const SAVE_INVALID_MESSAGE = "Something went wrong saving this project. Try again.";

export const OPEN_TOO_BIG_MESSAGE = "That project file is too big to open.";

export const OPEN_INVALID_MESSAGE = "That file can't be opened. It may be damaged or not a clothing project.";

export function composeFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const failure = error as { kind: unknown; message: unknown };
    if (failure.kind === "pattern-too-small" && typeof failure.message === "string") {
      return failure.message;
    }
  }
  return EXPORT_FAILED_MESSAGE;
}
