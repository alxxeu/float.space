import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Card, Workspace } from "./domain";
import { createCard, createWorkspace, deleteCard, loadCards, loadWorkspaces, updateCard } from "./native";

const MIN_CARD_SIZE = 120;
const DEFAULT_CARD = { width: 260, height: 160 };

type DraftCard = Omit<Card, "id" | "workspaceId" | "text">;

export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [cards, setCards] = useState<Card[]>([]);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<DraftCard>();
  const canvasRef = useRef<HTMLElement>(null);
  const creationStart = useRef<{ x: number; y: number }>();
  const draftRef = useRef<DraftCard>();
  const didDragToCreate = useRef(false);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    void loadWorkspaces().then((loaded) => {
        setWorkspaces(loaded);
        setActiveWorkspaceId(loaded[0]?.id);
      });
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void loadCards(activeWorkspaceId).then(setCards);
  }, [activeWorkspaceId]);

  useEffect(() => () => {
    for (const timer of saveTimers.current.values()) clearTimeout(timer);
  }, []);

  const activeWorkspace = workspaces.find(({ id }) => id === activeWorkspaceId);

  function persistCard(card: Card, immediately = false) {
    const previous = saveTimers.current.get(card.id);
    if (previous) clearTimeout(previous);
    const save = () => {
      saveTimers.current.delete(card.id);
      void updateCard(card);
    };
    if (immediately) save();
    else saveTimers.current.set(card.id, setTimeout(save, 450));
  }

  function changeCard(card: Card, immediately = false) {
    setCards((current) => current.map((item) => item.id === card.id ? card : item));
    persistCard(card, immediately);
  }

  function pointInCanvas(event: React.PointerEvent) {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!activeWorkspaceId || event.target !== event.currentTarget) return;
    const point = pointInCanvas(event);
    creationStart.current = point;
    didDragToCreate.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialDraft = { x: point.x, y: point.y, ...DEFAULT_CARD };
    draftRef.current = initialDraft;
    setDraft(initialDraft);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!creationStart.current) return;
    const point = pointInCanvas(event);
    const start = creationStart.current;
    const nextDraft = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.max(MIN_CARD_SIZE, Math.abs(point.x - start.x)),
      height: Math.max(MIN_CARD_SIZE, Math.abs(point.y - start.y)),
    };
    if (Math.abs(point.x - start.x) > 8 || Math.abs(point.y - start.y) > 8) didDragToCreate.current = true;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLElement>) {
    const pending = draftRef.current;
    creationStart.current = undefined;
    draftRef.current = undefined;
    setDraft(undefined);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!pending || !didDragToCreate.current || !activeWorkspaceId) return;
    const card: Omit<Card, "id"> = { workspaceId: activeWorkspaceId, text: "", ...pending };
    void createCard(card).then((created) => setCards((current) => [...current, created]));
  }

  async function addWorkspace() {
    if (workspaces.length >= 10) return;
    const workspace = await createWorkspace(`Space ${workspaces.length + 1}`);
    setWorkspaces((current) => [...current, workspace]);
    setActiveWorkspaceId(workspace.id);
    setMenuOpen(false);
  }

  return (
    <main className="app-shell" aria-label="Floatspace">
      <header className="topbar" onPointerEnter={() => setMenuOpen(true)} onPointerLeave={() => setMenuOpen(false)}>
        <p className="wordmark">Floatspace</p>
        <AnimatePresence>
          {isMenuOpen && activeWorkspace && (
            <motion.div className="workspace-menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              {workspaces.map((workspace) => (
                <button key={workspace.id} className={workspace.id === activeWorkspaceId ? "active" : ""} onClick={() => setActiveWorkspaceId(workspace.id)}>
                  <span>{workspace.slot}</span>{workspace.name}
                </button>
              ))}
              {workspaces.length < 10 && <button className="new-space" onClick={() => void addWorkspace()}>New space</button>}
            </motion.div>
          )}
        </AnimatePresence>
      </header>
      <section
        className="canvas"
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
      >
        {cards.map((card) => <CardView key={card.id} card={card} onChange={changeCard} onDelete={(id) => {
          setCards((current) => current.filter((item) => item.id !== id));
          void deleteCard(id);
        }} />)}
        {draft && <div className="card card-draft" style={cardStyle(draft)} />}
        {cards.length === 0 && !draft && <p className="canvas-hint">Drag anywhere to make space for a thought.</p>}
      </section>
    </main>
  );
}

function cardStyle(card: Pick<Card, "x" | "y" | "width" | "height">) {
  return { left: card.x, top: card.y, width: card.width, height: card.height };
}

function CardView({ card, onChange, onDelete }: { card: Card; onChange: (card: Card, immediately?: boolean) => void; onDelete: (id: string) => void }) {
  const start = useRef<{ x: number; y: number; card: Card; latest: Card; mode: "move" | "resize" }>();

  function begin(event: React.PointerEvent, mode: "move" | "resize") {
    event.stopPropagation();
    start.current = { x: event.clientX, y: event.clientY, card, latest: card, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent) {
    const operation = start.current;
    if (!operation) return;
    const dx = event.clientX - operation.x;
    const dy = event.clientY - operation.y;
    const canvas = event.currentTarget.closest(".canvas")?.getBoundingClientRect();
    const maxX = Math.max(0, (canvas?.width ?? Infinity) - operation.card.width);
    const maxY = Math.max(0, (canvas?.height ?? Infinity) - operation.card.height);
    const next = operation.mode === "move"
      ? { ...operation.card, x: Math.min(maxX, Math.max(0, operation.card.x + dx)), y: Math.min(maxY, Math.max(0, operation.card.y + dy)) }
      : {
          ...operation.card,
          width: Math.min(Math.max(MIN_CARD_SIZE, (canvas?.width ?? Infinity) - operation.card.x), Math.max(MIN_CARD_SIZE, operation.card.width + dx)),
          height: Math.min(Math.max(MIN_CARD_SIZE, (canvas?.height ?? Infinity) - operation.card.y), Math.max(MIN_CARD_SIZE, operation.card.height + dy)),
        };
    operation.latest = next;
    onChange(next);
  }

  function finish(event: React.PointerEvent) {
    if (start.current) onChange(start.current.latest, true);
    start.current = undefined;
  }

  return (
    <article className="card" style={cardStyle(card)} onPointerDown={(event) => event.stopPropagation()}>
      <div className="card-handle" aria-label="Move card" onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish} />
      <textarea aria-label="Card text" value={card.text} placeholder="" onChange={(event) => onChange({ ...card, text: event.target.value })} />
      <button className="delete-card" aria-label="Delete card" onClick={() => onDelete(card.id)}>×</button>
      <div className="resize-handle" aria-label="Resize card" onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={finish} />
    </article>
  );
}
