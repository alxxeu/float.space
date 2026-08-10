import {
    AnimatePresence,
    motion
} from "framer-motion";

import {
    useEffect,
    useRef,
    useState
} from "react";

import {
    listen
} from "@tauri-apps/api/event";

import type {
    Card,
    Workspace
} from "./domain";

import {
  createCard,
  createWorkspace,
  deleteCard,
  loadCards,
  loadOnboarding,
  loadWorkspaces,
  saveOnboarding,
  updateCard,
  updateWorkspace,
  setOverlayMode,
  minimizeOtherWindows,
} from "./native";

import {
    Onboarding,
    type OnboardingStep
} from "./Onboarding";

import {
    StartupHint
} from "./StartupHint";

import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

const MIN_CARD_SIZE = 120;
const TOP_CREATION_LIMIT = 38;
const DEFAULT_CARD = { width: MIN_CARD_SIZE, height: MIN_CARD_SIZE };
const DELETE_HOLD_TIME = 400;

type DraftCard = Omit<Card, "id" | "workspaceId" | "text">;

export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [cardsWorkspaceId, setCardsWorkspaceId] = useState<string | null>(null);
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
  const [isFloatspaceLayer, setIsFloatspaceLayer] = useState(false);
  const [onboardingStep, setOnboardingStep] =
      useState<OnboardingStep | null>(null);
  const onboardingStepRef = useRef<OnboardingStep | null>(null);

    useEffect(() => {
      onboardingStepRef.current = onboardingStep;
    }, [onboardingStep]);
    
    useEffect(() => {
          function handleResetOnboardingHotkey(event: KeyboardEvent) {
              if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "o") {
                event.preventDefault();
                void setOnboarding(1);
              }
          }

          window.addEventListener("keydown", handleResetOnboardingHotkey);
          return () => window.removeEventListener("keydown", handleResetOnboardingHotkey);
        }, []);
    
  const canvasRef = useRef<HTMLElement>(null);
  const creationStart = useRef<{ x: number; y: number }>();
  const draftRef = useRef<DraftCard>();
  const didDragToCreate = useRef(false);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [showStartupHint, setShowStartupHint] = useState(false);
  const showStartupHintRef = useRef(false);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
    
    

    useEffect(() => {
        void loadWorkspaces().then(async (loaded) => {
            let spaces = [...loaded];

            for (let slot = 2; slot <= 9; slot++) {
              if (!spaces.some((workspace) => workspace.slot === slot)) {
                  const workspace = await createWorkspace(`Space ${slot - 1}`);
                      spaces.push(workspace);
              }
            }

            spaces.sort((a, b) => a.slot - b.slot);

            setWorkspaces(spaces);
        });
    }, []);
    
    useEffect(() => {
      if (!showStartupHint) {
        return;
      }

      const timer = window.setTimeout(() => {
        showStartupHintRef.current = false;
        setShowStartupHint(false);
      }, 3500);

      return () => {
        window.clearTimeout(timer);
      };
    }, [showStartupHint]);

    
    useEffect(() => {
        console.log("AUTOSTART CHECK");
        
        void isAutostartEnabled().then((enabled) => {
           console.log("FLOATSPACE AUTOSTART:", enabled);
         });
      void loadOnboarding().then(({ completed, step }) => {
        if (completed) {
          setOnboardingStep(null);

          showStartupHintRef.current = true;
          setShowStartupHint(true);

          return;
        }

        const safeStep = Math.max(
          1,
          Math.min(4, step)
        ) as OnboardingStep;

          setIsFloatspaceLayer(true);
          setOnboardingStep(safeStep);
      });
    }, []);
    
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        void listen<number>("switch-workspace", (event) => {
            const slot = event.payload;
            
            if (showStartupHintRef.current && slot === 2) {
              showStartupHintRef.current = false;
              setShowStartupHint(false);
              void setOverlayMode(false, true);
            }

            // ⌥1 = normal macOS Desktop
            if (slot === 1) {
                setIsFloatspaceLayer(false);
                setActiveWorkspaceId(null);
                setCards([]);
                return;
            }

            setIsFloatspaceLayer(true);
            
            // ⌥2–⌥9 = Floatspace Spaces 1–8
            setWorkspaces((current) => {
                const workspace = current.find(
                    (item) => item.slot === slot
                );

                if (workspace) {
                    setActiveWorkspaceId(workspace.id);
                }
                
                if (
                  onboardingStepRef.current === 1 &&
                  slot === 2
                ) {
                  void setOnboarding(2);
                }

                if (
                  onboardingStepRef.current === 4 &&
                    slot >= 2 &&
                    slot <= 9
                ) {
                  void completeOnboarding();
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
            setCardsWorkspaceId(null);
            return;
        }

        void loadCards(activeWorkspaceId).then((loaded) => {
            setCards(loaded);
            setCardsWorkspaceId(activeWorkspaceId);
        });
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
    setCards((current) =>
      current.map((item) => (item.id === card.id ? card : item))
    );
    persistCard(card, immediately);
  }

  function activateCard(cardId: string) {
    const zIndex = nextZIndex.current++;

    setCardZIndexes((current) => ({
      ...current,
      [cardId]: zIndex,
    }));
  }

  function pointInCanvas(event: React.PointerEvent) {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

    function handleCanvasPointerDown(event: React.PointerEvent) {
      event.preventDefault();

      if (!activeWorkspaceId) return;

        if (event.target === event.currentTarget) {
          setFocusedCardId(null);
          document.activeElement instanceof HTMLElement &&
            document.activeElement.blur();
        } else {
          return;
        }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rawPoint = pointInCanvas(event);

      const point = {
        x: Math.min(
          Math.max(0, rawPoint.x),
          canvas.clientWidth - MIN_CARD_SIZE
        ),
        y: Math.min(
          Math.max(TOP_CREATION_LIMIT, rawPoint.y),
          canvas.clientHeight - MIN_CARD_SIZE
        ),
      };

      creationStart.current = point;
      didDragToCreate.current = false;
      setIsCreatingCard(true);

      event.currentTarget.setPointerCapture(event.pointerId);

      const initialDraft = {
        x: point.x,
        y: point.y,
        ...DEFAULT_CARD,
      };

      draftRef.current = initialDraft;
      setDraft(initialDraft);
    }
    
    
    function handleCanvasPointerMove(event: React.PointerEvent) {
      if (!creationStart.current) return;

      const point = pointInCanvas(event);
      const start = creationStart.current;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasWidth = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;

      const constrainedX = Math.min(
        canvasWidth,
        Math.max(0, point.x)
      );

      const constrainedY = Math.min(
        canvasHeight,
        Math.max(TOP_CREATION_LIMIT, point.y)
      );

      const nextDraft = {
        x: Math.max(
          0,
          Math.min(start.x, constrainedX)
        ),

        y: Math.max(
          TOP_CREATION_LIMIT,
          Math.min(start.y, constrainedY)
        ),

        width: Math.min(
          Math.max(MIN_CARD_SIZE, Math.abs(constrainedX - start.x)),
          canvasWidth - Math.min(start.x, constrainedX)
        ),

        height: Math.min(
          Math.max(MIN_CARD_SIZE, Math.abs(constrainedY - start.y)),
          canvasHeight - Math.min(start.y, constrainedY)
        ),
      };

      if (
        Math.abs(constrainedX - start.x) > 8 ||
        Math.abs(constrainedY - start.y) > 8
      ) {
        didDragToCreate.current = true;
      }

      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLElement>) {
      setIsCreatingCard(false);
      
    const pending = draftRef.current;
    creationStart.current = undefined;
    draftRef.current = undefined;
    setDraft(undefined);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!pending || !didDragToCreate.current || !activeWorkspaceId) return;
    const card: Omit<Card, "id"> = {
      workspaceId: activeWorkspaceId,
      text: "",
      ...pending,
    };

    void createCard(card).then((created) => {
      activateCard(created.id);
      setFocusCardId(created.id);
      setCards((current) => [...current, created]);

      if (onboardingStep === 2) {
        void setOnboarding(3);
      }
    });
  }
    
  async function addWorkspace() {
    if (workspaces.length >= 10) return;
    const workspace = await createWorkspace(`Space ${workspaces.length + 1}`);
    setWorkspaces((current) => [...current, workspace]);
    setActiveWorkspaceId(workspace.id);
    setMenuOpen(false);
  }
    async function setOnboarding(step: OnboardingStep) {
        
        if (step === 1) {
          void minimizeOtherWindows();
          void setOverlayMode(true, false);
        }
      setOnboardingStep(step);
      await saveOnboarding(false, step);
    }

    async function completeOnboarding() {
      setOnboardingStep(null);
      await saveOnboarding(true, 4);
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
          <AnimatePresence>
            {isFloatspaceLayer && !showStartupHint && (
              <motion.div
                className="floatspace-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
          <section
            className={`canvas${isCreatingCard ? " is-creating-card" : ""}`}
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
                    event.preventDefault();
                    setIsEditingWorkspaceName(false);
                }
            }}
            />
            ) : (
                 <div
                 className="empty-space-slot"
                 onClick={startEditingWorkspaceName}
                 >
                 {activeWorkspace.name || `SPACE ${activeWorkspace.slot}`}
                 </div>
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
          
          <AnimatePresence key={cardsWorkspaceId}>
            {cards.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 1, scale: 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: 0.8,
                  transition: {
                    duration: 0.2,
                    ease: "easeOut",
                  },
                }}
              >
                <CardView
                  card={card}
                autoFocus={card.id === focusCardId}
                focusedCardId={focusedCardId}
                setFocusedCardId={setFocusedCardId}
                                  onType={() => {
                                                      if (onboardingStep === 3) {
                                                        void setOnboarding(4);
                                                      }
                                                  }}
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
                    setCards((current) =>
                      current.filter((item) => item.id !== id)
                    );
                      if (focusedCardId === id) {
                           setFocusedCardId(null);
                         }
                    void deleteCard(id);
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {draft && (
              <motion.div
                className="card card-draft"
                style={{
                    left: draft.x,
                    top: draft.y,
                    width: draft.width,
                    height: draft.height,
                }}
                initial={{
                  opacity: 0,
                  scale: 0.88,
                }}
                animate={{
                  opacity: 0.45,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                }}
                transition={{
                  duration: 0.18,
                  ease: "easeOut",
                }}
              />
            )}
          </AnimatePresence>
      </section>
        
          {isFloatspaceLayer && activeWorkspace && (
            <div
               className={`workspace-label ${
                 isEditingWorkspaceName ? "editing" : ""
               }`}
               onPointerDown={(event) => event.stopPropagation()}
               onClick={() => {
                 if (!isEditingWorkspaceName) {
                   startEditingWorkspaceName();
                 }
               }}
            >
              {isEditingWorkspaceName ? (
                <input
                  className="workspace-label-input"
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
                      event.preventDefault();
                      setIsEditingWorkspaceName(false);
                    }
                  }}
                />
              ) : (
                <span>
                  {activeWorkspace.name || `SPACE ${activeWorkspace.slot}`}
                </span>
              )}
            </div>
          )}
          
          <AnimatePresence>
            {showStartupHint && (
              <StartupHint />
            )}
          </AnimatePresence>
          
          {onboardingStep !== null && (
            <div className="onboarding-layer">
              <Onboarding step={onboardingStep} />
            </div>
          )}
    </main>
  );
}

function CardView({
  card,
    autoFocus,
    focusedCardId,
    setFocusedCardId,
  onChange,
  onDelete,
  onActivate,
    onType,
  zIndex
}: {
  card: Card;
  autoFocus: boolean;
    focusedCardId: string | null;
    setFocusedCardId: (id: string | null) => void;
  onChange: (card: Card, immediately?: boolean) => void;
  onDelete: (id: string) => void;
  onActivate: () => void;
    onType?: () => void;
  zIndex: number;
}) {
    const start = useRef<{
      x: number;
      y: number;
      card: Card;
      latest: Card;
      mode: "move" | "resize";
    }>();

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [isActive, setIsActive] = useState(false);
    
    const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);
    const deleteStart = useRef<number | null>(null);
    const deleteAnimation = useRef<number | null>(null);
    
    function begin(event: React.PointerEvent, mode: "move" | "resize") {
      event.preventDefault();
      event.stopPropagation();

      onActivate();

      start.current = {
        x: event.clientX,
        y: event.clientY,
        card,
        latest: card,
        mode,
      };

      event.currentTarget.setPointerCapture(event.pointerId);
    }

    // Hold to delete.
    function startDelete(event: React.PointerEvent) {
      event.stopPropagation();
        
        setIsDeleting(true);
        
      if (deleteTimer.current) {
        clearTimeout(deleteTimer.current);
      }

      deleteStart.current = performance.now();

      const animate = (now: number) => {
        if (deleteStart.current === null) return;

        const progress = Math.min(
          (now - deleteStart.current) / DELETE_HOLD_TIME,
          1
        );

        setDeleteProgress(progress);

        if (progress < 1) {
          deleteAnimation.current = requestAnimationFrame(animate);
        }
      };

      deleteAnimation.current = requestAnimationFrame(animate);

      deleteTimer.current = setTimeout(() => {
        deleteTimer.current = null;
        deleteAnimation.current = null;
        deleteStart.current = null;
        setDeleteProgress(0);

        onDelete(card.id);
      }, DELETE_HOLD_TIME);
    }
    function cancelDelete(event?: React.PointerEvent) {
      event?.stopPropagation();

      if (deleteTimer.current) {
        clearTimeout(deleteTimer.current);
        deleteTimer.current = null;
      }

      if (deleteAnimation.current) {
        cancelAnimationFrame(deleteAnimation.current);
        deleteAnimation.current = null;
      }

      deleteStart.current = null;
      setDeleteProgress(0);
        setIsDeleting(false);
    }

    function move(event: React.PointerEvent) {
      event.stopPropagation();

      const operation = start.current;
      if (!operation) return;
        
    const dx = event.clientX - operation.x;
    const dy = event.clientY - operation.y;
    const canvas = event.currentTarget.closest(".canvas")?.getBoundingClientRect();
      const topBoundary = 38;
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
      const operation = start.current;
      if (!operation) return;

      onChange(operation.latest, true);

      start.current = undefined;

      if (operation.mode === "resize") {
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    }
    
          return (
            <motion.article
                  className={`card ${focusedCardId === card.id ? "card-focused" : ""}`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                zIndex,
              }}
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: 0.92,
                transition: {
                  duration: 0.2,
                  ease: "easeOut",
                },
              }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onActivate();
                    setFocusedCardId(card.id);
                  }}
          >
          <div className="card-background" />
      <div className="card-handle" aria-label="Move card"  onPointerDown={(event) => {
          begin(event, "move");
        }}
                  onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/>
                  
                  <textarea
                    ref={textareaRef}
                  autoFocus={autoFocus}
                  spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    aria-label="Card text"
                    value={card.text}
                  placeholder={isActive && !card.text ? "Write something..." : ""}
                  onFocus={() => setIsActive(true)}
                  onBlur={() => setIsActive(false)}
                    onChange={(event) => {
                      onChange({ ...card, text: event.target.value });
                      onType?.();
                    }}
                  />
                  <div
                    className="resize-handle"
                    aria-label="Resize card"
                    onPointerDown={(event) => {
                      begin(event, "resize");
                    }}
                    onPointerMove={move}
                    onPointerUp={finish}
                    onPointerCancel={finish}
                  />
                  <button
                    className="delete-card"
                    aria-label="Hold to delete card"
                    onPointerDown={startDelete}
                    onPointerUp={cancelDelete}
                    onPointerCancel={cancelDelete}
                    onPointerLeave={cancelDelete}
                  >
                    <svg
                      className="delete-progress"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <circle
                        className="delete-progress-track"
                        cx="10"
                        cy="10"
                        r="8"
                      />

                      <circle
                  className={`delete-progress-fill ${isDeleting ? "active" : ""}`}
                        cx="10"
                        cy="10"
                        r="8"
                  style={{
                        strokeDashoffset: 44 - 44 * deleteProgress,
                      }}
                    />
                  <path
                       className="delete-cross"
                       d="M6 6L12 12M12 6L6 12"
                     />
                    </svg>

                    <svg
                      className="delete-icon"
                      width="11"
                      height="11"
                      viewBox="0 0 14 14"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 3L11 11M11 3L3 11"
                        stroke="currentColor"
                        strokeWidth="2.3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
    </motion.article>
    );
}
