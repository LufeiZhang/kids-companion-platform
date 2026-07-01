import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent
} from "react";
import type { DrawPayload, SignalMessage, WhiteboardAction } from "@companion/types";

interface Stroke {
  color: string;
  lineWidth: number;
  erase: boolean;
  points: Array<{ x: number; y: number }>;
}

type PageMap = Record<number, Stroke[]>;

export interface WhiteboardProps {
  page: number;
  editable: boolean;
  incoming?: SignalMessage | null;
  backgroundUrl?: string;
  backgroundType?: "image" | "pdf";
  onEvent?: (action: WhiteboardAction, payload: DrawPayload | { page: number }) => void;
}

export function Whiteboard({
  page,
  editable,
  incoming,
  backgroundUrl,
  backgroundType,
  onEvent
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<PageMap>({});
  const redoRef = useRef<PageMap>({});
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState("#2563eb");
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of pagesRef.current[page] ?? []) {
      if (stroke.points.length < 2) continue;
      context.save();
      context.lineJoin = "round";
      context.lineCap = "round";
      context.lineWidth = stroke.lineWidth * devicePixelRatio;
      context.strokeStyle = stroke.color;
      context.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      context.beginPath();
      const first = stroke.points[0]!;
      context.moveTo(first.x * canvas.width, first.y * canvas.height);
      for (const point of stroke.points.slice(1)) {
        context.lineTo(point.x * canvas.width, point.y * canvas.height);
      }
      context.stroke();
      context.restore();
    }
  }, [page]);

  useLayoutEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(redraw, [page, redraw]);

  useEffect(() => {
    if (!incoming || incoming.msg_type !== "WHITEBOARD_EVENT") return;
    const action = incoming.action as WhiteboardAction;
    const payload = incoming.payload as unknown as DrawPayload;
    const targetPage = payload.page ?? page;
    const strokes = pagesRef.current[targetPage] ??= [];
    if (action === "DRAW_START" || action === "ERASE") {
      const stroke: Stroke = {
        color: payload.color ?? "#2563eb",
        lineWidth: payload.lineWidth ?? 4,
        erase: action === "ERASE",
        points: [{ x: payload.x, y: payload.y }]
      };
      strokes.push(stroke);
      currentStrokeRef.current = stroke;
    } else if (action === "DRAW_MOVE" && currentStrokeRef.current) {
      currentStrokeRef.current.points.push({ x: payload.x, y: payload.y });
    } else if (action === "DRAW_END") {
      currentStrokeRef.current = null;
    } else if (action === "CLEAR") {
      pagesRef.current[targetPage] = [];
      redoRef.current[targetPage] = [];
    } else if (action === "UNDO") {
      const removed = strokes.pop();
      if (removed) (redoRef.current[targetPage] ??= []).push(removed);
    } else if (action === "REDO") {
      const restored = (redoRef.current[targetPage] ?? []).pop();
      if (restored) strokes.push(restored);
    }
    if (targetPage === page) redraw();
  }, [incoming, page, redraw]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  };

  const emitDraw = (
    action: WhiteboardAction,
    position: { x: number; y: number },
    selectedTool = tool
  ) => {
    onEvent?.(action, {
      ...position,
      pressure: 1,
      color,
      lineWidth: selectedTool === "eraser" ? lineWidth * 3 : lineWidth,
      page
    });
  };

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = point(event);
    const stroke: Stroke = {
      color,
      lineWidth: tool === "eraser" ? lineWidth * 3 : lineWidth,
      erase: tool === "eraser",
      points: [position]
    };
    (pagesRef.current[page] ??= []).push(stroke);
    redoRef.current[page] = [];
    currentStrokeRef.current = stroke;
    emitDraw(tool === "eraser" ? "ERASE" : "DRAW_START", position);
  };

  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!editable || !currentStrokeRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const position = point(event);
    currentStrokeRef.current.points.push(position);
    redraw();
    emitDraw("DRAW_MOVE", position);
  };

  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!editable || !currentStrokeRef.current) return;
    const position = point(event);
    currentStrokeRef.current.points.push(position);
    currentStrokeRef.current = null;
    emitDraw("DRAW_END", position);
  };

  const control = (action: "CLEAR" | "UNDO" | "REDO") => {
    const strokes = pagesRef.current[page] ??= [];
    if (action === "CLEAR") {
      pagesRef.current[page] = [];
      redoRef.current[page] = [];
    } else if (action === "UNDO") {
      const removed = strokes.pop();
      if (removed) (redoRef.current[page] ??= []).push(removed);
    } else {
      const restored = (redoRef.current[page] ?? []).pop();
      if (restored) strokes.push(restored);
    }
    redraw();
    onEvent?.(action, { page });
  };

  const pdfUrl = backgroundUrl ? `${backgroundUrl}#page=${page}&toolbar=0&navpanes=0` : "";

  return (
    <div className="whiteboard-shell">
      {editable && (
        <div className="whiteboard-toolbar">
          <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}>✏️ 画笔</button>
          <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}>🧽 橡皮</button>
          <label>颜色 <input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
          <label>线宽 <input type="range" min="2" max="16" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} /></label>
          <button onClick={() => control("UNDO")}>↶ 撤销</button>
          <button onClick={() => control("REDO")}>↷ 重做</button>
          <button onClick={() => control("CLEAR")}>清空</button>
        </div>
      )}
      <div className="whiteboard-canvas-wrap" ref={containerRef}>
        {!backgroundUrl && <div className="whiteboard-grid" />}
        {backgroundUrl && backgroundType === "image" && <img className="courseware-background" src={backgroundUrl} alt="课件" />}
        {backgroundUrl && backgroundType === "pdf" && <iframe className="courseware-background" src={pdfUrl} title="PDF 课件" />}
        <canvas
          ref={canvasRef}
          className={`whiteboard-canvas ${editable ? "is-editable" : ""}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        />
        <span className="page-badge">第 {page} 页</span>
      </div>
    </div>
  );
}
