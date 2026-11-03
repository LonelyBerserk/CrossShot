import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EditorTool, EditorToolState } from "../model/EditorTool";
import type { ToolbarOrientation } from "./toolbarLayout";

import "./EditorToolbar.css";

type ToolbarMenu = "shapes" | "lines" | "effects" | null;

interface ToolOption {
  readonly tool: EditorTool;
  readonly label: string;
}

interface EditorToolbarProps {
  readonly state: EditorToolState;
  readonly orientation: ToolbarOrientation;
  readonly onSelectTool: (tool: EditorTool) => void;
  readonly onSelectArea: () => void;
  readonly onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

const shapeOptions: readonly ToolOption[] = [
  { tool: "rectangle", label: "Прямоугольник" },
  { tool: "ellipse", label: "Эллипс" },
  { tool: "triangle", label: "Треугольник" },
];

const lineOptions: readonly ToolOption[] = [
  { tool: "line", label: "Прямая линия" },
  { tool: "arrow", label: "Стрелка" },
];

const effectOptions: readonly ToolOption[] = [
  { tool: "blur", label: "Размытие" },
];

type IconName = "drag" | "selection" | "brush" | "shapes" | "lines" | "text" | "effects" | "eraser" | "chevron" | EditorTool;

function ToolbarIcon({ name }: { readonly name: IconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "drag": return <svg {...common}><circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
    case "selection": return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2"/><path d="M8 12h8M12 8v8"/></svg>;
    case "brush": return <svg {...common}><path d="m14 6 4 4M4 20c3 0 5-1 6-4l9-9a2.1 2.1 0 0 0-3-3l-9 9c-3 1-4 3-3 7Z"/><path d="M4 20h7"/></svg>;
    case "shapes": return <svg {...common}><rect x="2.5" y="3" width="9" height="8" rx="1"/><circle cx="17.5" cy="7" r="4"/><path d="m12 21 5-8 5 8Z"/></svg>;
    case "lines": return <svg {...common}><path d="M4 20 20 4M14 4h6v6M4 14v6h6"/></svg>;
    case "text": return <svg {...common}><path d="M4 5h16M12 5v14M8 19h8"/></svg>;
    case "effects": return <svg {...common}><circle cx="8" cy="8" r="4"/><circle cx="16" cy="8" r="2"/><circle cx="7" cy="17" r="2"/><circle cx="16" cy="17" r="4"/></svg>;
    case "eraser": return <svg {...common}><path d="m4 15 9-10a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-7 8H8Z"/><path d="m9 10 7 7M13 20h8"/></svg>;
    case "chevron": return <svg {...common}><path d="m7 10 5 5 5-5"/></svg>;
    case "rectangle": return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="1"/></svg>;
    case "ellipse": return <svg {...common}><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>;
    case "triangle": return <svg {...common}><path d="m12 4 10 17H2Z"/></svg>;
    case "line": return <svg {...common}><path d="M4 20 20 4"/></svg>;
    case "arrow": return <svg {...common}><path d="M4 20 20 4M10 4h10v10"/></svg>;
    case "blur": return <svg {...common}><circle cx="12" cy="12" r="8" strokeDasharray="2 2"/><circle cx="12" cy="12" r="3"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
  }
}

interface ToolMenuProps {
  readonly id: Exclude<ToolbarMenu, null>;
  readonly label: string;
  readonly icon: IconName;
  readonly options: readonly ToolOption[];
  readonly state: EditorToolState;
  readonly openMenu: ToolbarMenu;
  readonly onToggle: (menu: ToolbarMenu) => void;
  readonly onSelectTool: (tool: EditorTool) => void;
}

function ToolMenu({ id, label, icon, options, state, openMenu, onToggle, onSelectTool }: ToolMenuProps) {
  const activeTool = state.mode.type === "tool" ? state.mode.tool : null;
  const isActive = options.some((option) => option.tool === activeTool);
  const isOpen = openMenu === id;

  return (
    <div className="editor-toolbar__menu-group">
      <button
        type="button"
        className="editor-toolbar__button editor-toolbar__menu-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-pressed={isActive}
        data-active={isActive}
        onClick={() => onToggle(isOpen ? null : id)}
      >
        <ToolbarIcon name={icon}/><ToolbarIcon name="chevron"/>
      </button>
      {isOpen && (
        <div className="editor-toolbar__dropdown" role="menu" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.tool}
              type="button"
              className="editor-toolbar__dropdown-item"
              role="menuitemradio"
              aria-checked={activeTool === option.tool}
              data-active={activeTool === option.tool}
              onClick={() => { onSelectTool(option.tool); onToggle(null); }}
            >
              <ToolbarIcon name={option.tool}/><span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditorToolbar({ state, orientation, onSelectTool, onSelectArea, onDragStart }: EditorToolbarProps) {
  const [openMenu, setOpenMenu] = useState<ToolbarMenu>(null);
  const activeTool = state.mode.type === "tool" ? state.mode.tool : null;

  const selectTool = (tool: EditorTool) => {
    onSelectTool(tool);
    setOpenMenu(null);
  };

  return (
    <div
      className="editor-toolbar"
      data-orientation={orientation}
      role="toolbar"
      aria-label="Инструменты редактора"
    >
      <button
        type="button"
        className="editor-toolbar__drag-handle"
        aria-label="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        title="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        onPointerDown={onDragStart}
      >
        <ToolbarIcon name="drag"/>
      </button>
      <button
        type="button"
        className="editor-toolbar__button"
        aria-label="Изменить область"
        title="Изменить область"
        aria-pressed={state.mode.type === "selection"}
        data-active={state.mode.type === "selection"}
        onClick={() => { onSelectArea(); setOpenMenu(null); }}
      >
        <ToolbarIcon name="selection"/>
      </button>
      <span className="editor-toolbar__separator" aria-hidden="true"/>
      <button
        type="button"
        className="editor-toolbar__drag-handle"
        aria-label="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        title="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        onPointerDown={onDragStart}
      >
        <ToolbarIcon name="drag"/>
      </button>
      <button
        type="button"
        className="editor-toolbar__button"
        aria-label="Кисть"
        title="Кисть"
        aria-pressed={activeTool === "brush"}
        data-active={activeTool === "brush"}
        onClick={() => selectTool("brush") }
      >
        <ToolbarIcon name="brush"/>
      </button>
      <ToolMenu id="shapes" label="Фигуры" icon="shapes" options={shapeOptions} state={state} openMenu={openMenu} onToggle={setOpenMenu} onSelectTool={selectTool}/>
      <ToolMenu id="lines" label="Прямые и стрелки" icon="lines" options={lineOptions} state={state} openMenu={openMenu} onToggle={setOpenMenu} onSelectTool={selectTool}/>
      <button
        type="button"
        className="editor-toolbar__drag-handle"
        aria-label="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        title="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        onPointerDown={onDragStart}
      >
        <ToolbarIcon name="drag"/>
      </button>
      <button
        type="button"
        className="editor-toolbar__button"
        aria-label="Текст"
        title="Текст"
        aria-pressed={activeTool === "text"}
        data-active={activeTool === "text"}
        onClick={() => selectTool("text")}
      >
        <ToolbarIcon name="text"/>
      </button>
      <ToolMenu id="effects" label="Эффекты" icon="effects" options={effectOptions} state={state} openMenu={openMenu} onToggle={setOpenMenu} onSelectTool={selectTool}/>
      <button
        type="button"
        className="editor-toolbar__drag-handle"
        aria-label="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        title="\u041f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043d\u0435\u043b\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432"
        onPointerDown={onDragStart}
      >
        <ToolbarIcon name="drag"/>
      </button>
      <button
        type="button"
        className="editor-toolbar__button"
        aria-label="Ластик"
        title="Ластик"
        aria-pressed={activeTool === "eraser"}
        data-active={activeTool === "eraser"}
        onClick={() => selectTool("eraser")}
      >
        <ToolbarIcon name="eraser"/>
      </button>
    </div>
  );
}

export default EditorToolbar;