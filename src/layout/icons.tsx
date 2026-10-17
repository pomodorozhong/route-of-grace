import type { Tool } from "../App";

/** Stroke icons, drawn in the current text color. */
function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const TOOL_PATHS: Record<Tool, string> = {
  select: "M4 2 L4 14 L7.5 10.5 L10 16 L12 15 L9.5 9.5 L14 9.5 Z",
  pin: "M9 16 C 9 16 3.5 10.5 3.5 7 A5.5 5.5 0 0 1 14.5 7 C 14.5 10.5 9 16 9 16 Z M9 5 a2 2 0 1 0 0.01 0",
  path: "M2 15 L6 8 L11 11 L16 3",
};

export const ToolIcon = ({ tool }: { tool: Tool }) => (
  <Icon path={TOOL_PATHS[tool]} />
);
export const MenuIcon = () => <Icon path="M3 5 H15 M3 9 H15 M3 13 H15" />;
export const LayersIcon = () => (
  <Icon
    size={16}
    path="M9 2 L16 5.5 L9 9 L2 5.5 Z M2 8.75 L9 12.25 L16 8.75 M2 12 L9 15.5 L16 12"
  />
);

export const PencilIcon = () => (
  <Icon size={16} path="M11.5 3 L15 6.5 L6 15.5 H2.5 V12 Z M9.5 5 L13 8.5" />
);
export const ChevronIcon = ({ up }: { up: boolean }) => (
  <Icon size={16} path={up ? "M4 11 L9 6 L14 11" : "M4 7 L9 12 L14 7"} />
);
export const GraceOffIcon = () => (
  <Icon
    size={16}
    path="M9 6.5 a2.5 2.5 0 1 0 0.01 0 M9 1.5 V3.5 M9 14.5 V16.5 M1.5 9 H3.5 M14.5 9 H16.5 M2.5 2.5 L15.5 15.5"
  />
);
export const SlidersIcon = () => (
  <Icon
    size={16}
    path="M3 5 H8 M12 5 H15 M3 13 H6 M10 13 H15 M10 3 V7 M8 11 V15"
  />
);
