import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Card, Workspace } from "./domain";
import { createCard, createWorkspace, deleteCard, loadCards, loadWorkspaces, updateCard, updateWorkspace } from "./native";

const MIN_CARD_SIZE = 120;
const DEFAULT_CARD = { width: 260, height: 160 };

type DraftCard = Omit<Card, "id" | "workspaceId" | "text">;

export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
    const [cardZIndexes, setCardZIndexes] = useState<Record<string, number>>({});
    const nextZIndex = useRef(1);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<DraftCard>();
    const [isEditingWorkspaceName, setIsEditingWorkspaceName] = useState(false);
    const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
    const activeWorkspace = workspaces.find(
      ({ id }) => id === activeWorkspaceId
    );

    const startEditingWorkspaceName = () => {
      if (!activeWorkspace) return;

      setWorkspaceNameDraft(activeWorkspace.name);
      setIsEditingWorkspaceName(true);
    };

    const saveWorkspaceName = async () => {
      if (!activeWorkspace) return;

      const name = workspaceNameDraft.trim();

      if (!name) {
        setIsEditingWorkspaceName(false);
        return;
      }

      await updateWorkspace(activeWorkspace.id, name);

      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === activeWorkspace.id
            ? { ...workspace, name }
            : workspace
        )
      );

      setIsEditingWorkspaceName(false);
    };
    
  const canvasRef = useRef<HTMLElement>(null);
  const creationStart = useRef<{ x: number; y: number }>();
  const draftRef = useRef<DraftCard>();
  const didDragToCreate = useRef(false);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    useEffect(() => {
        void loadWorkspaces().then(async (loaded) => {
            let spaces = [...loaded];

            for (let slot = 1; slot <= 8; slot++) {
                if (!spaces.some((workspace) => workspace.slot === slot)) {
                    const workspace = await createWorkspace(`Space ${slot}`);
                    spaces.push(workspace);
                }
            }

            spaces.sort((a, b) => a.slot - b.slot);

            setWorkspaces(spaces);

            // Start on Space 1
            
        (
              spaces.find((workspace) => workspace.slot === 1)?.id ?? null
            );
        });
    }, []);
    
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        void listen<number>("switch-workspace", (event) => {
            const slot = event.payload;

            // ⌥1 = normal macOS Desktop
            if (slot === 0) {
                setActiveWorkspaceId(null);
                setCards([]);
                return;
            }

            // ⌥2–⌥9 = Floatspace Spaces 1–8
            setWorkspaces((current) => {
                const workspace = current.find(
                    (item) => item.slot === slot
                );

                if (workspace) {
                    setActiveWorkspaceId(workspace.id);
                }

                return current;
            });
        }).then((cleanup) => {
            unlisten = cleanup;
        });

        return () => {
            unlisten?.();
        };
    }, []);
    
    useEffect(() => {
        if (!activeWorkspaceId) {
            setCards([]);
            return;
        }

        void loadCards(activeWorkspaceId).then(setCards);
    }, [activeWorkspaceId]);

  useEffect(() => () => {
    for (const timer of saveTimers.current.values()) clearTimeout(timer);
  }, []);

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
        <AnimatePresence>
          {isMenuOpen && activeWorkspace && (
            <motion.div
              className="workspace-menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className={`workspace-item ${
                    workspace.id === activeWorkspaceId ? "active" : ""
                  }`}
                >
                  <button
                    className="workspace-button"
                    onClick={() => setActiveWorkspaceId(workspace.id)}
                  >
                    {workspace.name || `SPACE ${workspace.slot}`}
                  </button>
                </div>
              ))}

              {workspaces.length < 10 && (
                <button
                  className="new-space"
                  onClick={() => void addWorkspace()}
                >
                  New space
                </button>
              )}
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
          {cards.length === 0 && activeWorkspace && (
            <motion.div
              className="empty-space-note"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div
                className="empty-space-name-row"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {isEditingWorkspaceName ? (
                  <input
                    className="empty-space-name-input"
                    value={workspaceNameDraft}
                                           autoFocus
                                           onFocus={(event) => event.currentTarget.select()}
                                           onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                    onBlur={() => void saveWorkspaceName()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveWorkspaceName();
                      }

                      if (event.key === "Escape") {
                        setIsEditingWorkspaceName(false);
                      }
                    }}
                  />
                ) : (
                  <>
                     <div className="empty-space-slot">
                       {(activeWorkspace.name || `SPACE ${activeWorkspace.slot}`).toUpperCase()}
                     </div>

                     <button
                       type="button"
                       className="empty-space-edit"
                       onPointerDown={(event) => {
                         event.stopPropagation();
                       }}
                       onClick={(event) => {
                         event.stopPropagation();
                         startEditingWorkspaceName();
                       }}
                     >
                     <svg
                       width="14"
                       height="14"
                       viewBox="0 0 24 24"
                       fill="none"
                       xmlns="http://www.w3.org/2000/svg"
                       aria-hidden="true"
                     >
                       <path
                         d="M4 20h4L19.5 8.5a2.12 2.12 0 0 0-3-3L4 17v3Z"
                         stroke="currentColor"
                         strokeWidth="1.8"
                         strokeLinecap="round"
                         strokeLinejoin="round"
                       />
                       <path
                         d="m14.5 7.5 2 2"
                         stroke="currentColor"
                         strokeWidth="1.8"
                         strokeLinecap="round"
                       />
                     </svg>
                     </button>
                  </>
                )}
              </div>

              <div className="empty-space-title">
                This is your thinking space.
              </div>

              <div className="empty-space-hint">
                Create a card to start.
              </div>
            </motion.div>
          )}
          
        {cards.map((card) => <CardView
                   key={card.id}
                   card={card}
                   onChange={changeCard}
                   onActivate={() => {
                     const zIndex = nextZIndex.current++;

                     setCardZIndexes((current) => ({
                       ...current,
                       [card.id]: zIndex,
                     }));
                   }}
                   zIndex={cardZIndexes[card.id] ?? 0}
                   onDelete={(id) => {
          setCards((current) => current.filter((item) => item.id !== id));
          void deleteCard(id);
        }} />)}
        {draft && <div className="card card-draft" style={cardStyle(draft)} />}
      </section>
    </main>
  );
}

function cardStyle(card: Pick<Card, "x" | "y" | "width" | "height">) {
  return { left: card.x, top: card.y, width: card.width, height: card.height };
}

function CardView({
  card,
  onChange,
  onDelete,
  onActivate,
  zIndex
}: {
  card: Card;
  onChange: (card: Card, immediately?: boolean) => void;
  onDelete: (id: string) => void;
  onActivate: () => void;
  zIndex: number;
}) {
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
      const topBoundary = 64;
    const maxX = Math.max(0, (canvas?.width ?? Infinity) - operation.card.width);
    const maxY = Math.max(0, (canvas?.height ?? Infinity) - operation.card.height);
    const next = operation.mode === "move"
      ? { ...operation.card, x: Math.min(maxX, Math.max(0, operation.card.x + dx)), y: Math.min(maxY, Math.max(topBoundary, operation.card.y + dy)) }
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
          <article
              className="card"
          style={{
            ...cardStyle(card),
            zIndex,
          }}
              onPointerDown={(event) => {
                  event.stopPropagation();
                  onActivate();
              }}
          >
          <div className="card-background" />
      <div className="card-handle" aria-label="Move card" onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={finish} />
      <textarea aria-label="Card text" value={card.text} placeholder="" onChange={(event) => onChange({ ...card, text: event.target.value })} />
      <button className="delete-card" aria-label="Delete card" onClick={() => onDelete(card.id)}>×</button>
      <div className="resize-handle" aria-label="Resize card" onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={finish} />
    </article>
  );
}
