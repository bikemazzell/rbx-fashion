import type { JSX } from "preact";

function strokeIcon(paths: readonly string[]): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function IconAdd(): JSX.Element {
  return strokeIcon(["M12 5v14", "M5 12h14"]);
}

export function IconMove(): JSX.Element {
  return strokeIcon([
    "M12 3v18",
    "M3 12h18",
    "m9 6 3-3 3 3",
    "m9 18 3 3 3-3",
    "m6 9-3 3 3 3",
    "m18 9 3 3-3 3",
  ]);
}

export function IconRepeat(): JSX.Element {
  return strokeIcon(["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"]);
}

export function IconColor(): JSX.Element {
  return strokeIcon(["M12 3s6 6.7 6 11a6 6 0 0 1-12 0c0-4.3 6-11 6-11z"]);
}

export function IconPreview(): JSX.Element {
  return strokeIcon(["M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"]);
}

export function IconExport(): JSX.Element {
  return strokeIcon(["M12 4v11", "m8 11 4 4 4-4", "M5 20h14"]);
}

export function IconUndo(): JSX.Element {
  return strokeIcon(["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H10"]);
}

export function IconRedo(): JSX.Element {
  return strokeIcon(["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H14"]);
}

export function IconEye(): JSX.Element {
  return strokeIcon(["M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"]);
}

export function IconDuplicate(): JSX.Element {
  return strokeIcon(["M9 9h11v11H9z", "M5 15V4h11"]);
}

export function IconUp(): JSX.Element {
  return strokeIcon(["m6 14 6-6 6 6"]);
}

export function IconDown(): JSX.Element {
  return strokeIcon(["m6 10 6 6 6-6"]);
}

export function IconTrash(): JSX.Element {
  return strokeIcon(["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v5", "M14 11v5"]);
}
