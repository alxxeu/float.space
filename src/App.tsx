import { useEffect, useRef, useState } from "react";

import {
    AnimatePresence,
    motion
} from "framer-motion";

import {
    listen
} from "@tauri-apps/api/event";

import type {
    Card,
    Workspace
} from "./domain";

import { CardView } from "./CardView";

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
    activateFloatspace,
    bringFloatspaceToFront,
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

import { invoke } from "@tauri-apps/api/core";

const MIN_CARD_SIZE = 120;
const CARD_SIZE_STEP = 60;

const DEFAULT_CARD = {
  width: 120,
  height: 120,
};

const TOP_CREATION_LIMIT = 73;
const CANVAS_SIDE_PADDING = 24;

function snapCardSize(value: number) {
  return Math.max(
    MIN_CARD_SIZE,
    Math.round(value / CARD_SIZE_STEP) * CARD_SIZE_STEP
  );
}

type DraftCard = Omit<Card, "id" | "workspaceId" | "text">;

export function App() {
    
    useEffect(() => {
      console.log("SPOTLIGHT DEBUG → APP MOUNTED");
    }, []);
    
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [spotlightCardId, setSpotlightCardId] = useState<string | null>(null);
  const [cutCardId, setCutCardId] = useState<string | null>(null);
  const [cardsWorkspaceId, setCardsWorkspaceId] = useState<string | null>(null);
  const [cardZIndexes, setCardZIndexes] = useState<Record<string, number>>({});
  const nextZIndex = useRef(1);
  const [draft, setDraft] = useState<DraftCard>();
  const [placementPreview, setPlacementPreview] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);
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

      const name =
        workspaceNameDraft.trim() ||
        `SPACE ${activeWorkspace.slot}`;

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
    const [edgeHintPreview, setEdgeHintPreview] = useState<{
      edge: "top" | "left" | "right" | "bottom";
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);
  const [onboardingStep, setOnboardingStep] =
      useState<OnboardingStep | null>(null);
  const onboardingStepRef = useRef<OnboardingStep | null>(null);
    
    const workspacesRef = useRef(workspaces);

    useEffect(() => {
      workspacesRef.current = workspaces;
    }, [workspaces]);
    

    useEffect(() => {
      onboardingStepRef.current = onboardingStep;
    }, [onboardingStep]);
    
    useEffect(() => {
      let unlisten: (() => void) | undefined;

      void listen("quit-confirmation", () => {
        setShowQuitHint(true);

        window.setTimeout(() => {
          setShowQuitHint(false);
        }, 1500);
      }).then((cleanup) => {
        unlisten = cleanup;
      });

      return () => {
        unlisten?.();
      };
    }, []);
    
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
    
    useEffect(() => {
      function handleOnboardingEnter(event: KeyboardEvent) {
        if (
          onboardingStepRef.current === 5 &&
          event.key === "Enter"
        ) {
          event.preventDefault();
          void completeOnboarding();
        }
      }

      window.addEventListener("keydown", handleOnboardingEnter);

      return () => {
        window.removeEventListener(
          "keydown",
          handleOnboardingEnter
        );
      };
    }, []);
    
    const canvasRef = useRef<HTMLElement>(null);
    const creationStart = useRef<{ x: number; y: number }>();
    const draftRef = useRef<DraftCard>();
    const didDragToCreate = useRef(false);
    const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const [showStartupHint, setShowStartupHint] = useState(false);
    const showStartupHintRef = useRef(false);
    const [showQuitHint, setShowQuitHint] = useState(false);
    const [isCreatingCard, setIsCreatingCard] = useState(false);
    const [, setWindowDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

     useEffect(() => {
       const handleResize = () => {
         setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
       };
       window.addEventListener("resize", handleResize);
       return () => window.removeEventListener("resize", handleResize);
     }, []);
    
    useEffect(() => {
      const handleGlobalKeyDown = (event: KeyboardEvent) => {
        // Кликнули на пустом месте холста и нажали Cmd+V или Alt+V для вставки карточки
        const isPaste = (event.metaKey || event.ctrlKey || event.altKey) && event.key.toLowerCase() === "v";
        
        // Проверяем, что фокус не находится внутри какого-то текстового поля, чтобы не ломать стандартную вставку текста
        const isTextInput = document.activeElement?.getAttribute("contenteditable") === "true" ||
                            document.activeElement?.tagName === "INPUT" ||
                            document.activeElement?.tagName === "TEXTAREA";

        if (isPaste && cutCardId && !isTextInput) {
          event.preventDefault();

          // 1. Находим вырезанную карточку среди всех имеющихся
          const cardToMove = cards.find(c => c.id === cutCardId);
          if (!cardToMove) {
            setCutCardId(null);
            return;
          }

          // 2. Меняем ей workspace_id на ID текущего активного пространства (спэйса)
          // Также центрируем её на новом экране, чтобы она не потерялась
          const updatedCard = {
            ...cardToMove,
            workspace_id: activeWorkspaceId, // Переносим в текущий спэйс
            x: window.innerWidth / 2 - cardToMove.width / 2, // По центру экрана
            y: window.innerHeight / 2 - cardToMove.height / 2
          };

          // 3. Отправляем запрос в базу данных Rust на обновление карточки
          void invoke("update_card", { card: updatedCard })
            .then(() => {
              // Обновляем локальный стейт, чтобы карточка исчезла из старого спэйса и появилась в новом
              setCards(prev => prev.map(c => c.id === cutCardId ? updatedCard : c));
              setCutCardId(null); // Очищаем буфер
            })
            .catch(err => console.error("Failed to move card:", err));
        }
      };

      window.addEventListener("keydown", handleGlobalKeyDown);
      return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [cutCardId, activeWorkspaceId, cards]);


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
          Math.min(5, step)
        ) as OnboardingStep;

          setIsFloatspaceLayer(true);
          setOnboardingStep(safeStep);
      });
    }, []);
    
    useEffect(() => {
      let quitTimer: ReturnType<typeof setTimeout> | null = null;
      let waitingForConfirmation = false;

      function handleQuit(event: KeyboardEvent) {
        if (!event.metaKey || event.key.toLowerCase() !== "q") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (waitingForConfirmation) {
          waitingForConfirmation = false;

          if (quitTimer) {
            clearTimeout(quitTimer);
            quitTimer = null;
          }

          void invoke("quit_app");
          return;
        }

        waitingForConfirmation = true;
        setShowQuitHint(true);

        quitTimer = setTimeout(() => {
          waitingForConfirmation = false;
          setShowQuitHint(false);
          quitTimer = null;
        }, 1500);
      }

      window.addEventListener("keydown", handleQuit);

      return () => {
        window.removeEventListener("keydown", handleQuit);

        if (quitTimer) {
          clearTimeout(quitTimer);
        }
      };
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
                    void setOnboarding(5);
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

    const spotlightOpeningCardRef = useRef<string | null>(null);

    useEffect(() => {
      let unlisten: (() => void) | undefined;

      const openCard = async (cardId: string) => {
        const normalizedCardId = String(cardId).trim();

        if (!normalizedCardId) return;

        // macOS/Core Spotlight can deliver the same activity more than once.
        if (spotlightOpeningCardRef.current === normalizedCardId) {
          console.log("SPOTLIGHT → DUPLICATE IGNORED:", normalizedCardId);
          return;
        }

        spotlightOpeningCardRef.current = normalizedCardId;

        console.log("SPOTLIGHT → OPEN CARD REQUEST:", normalizedCardId);

        try {
          for (const workspace of workspacesRef.current) {
            const workspaceCards = await loadCards(workspace.id);
            const card = workspaceCards.find(
              (item) => String(item.id).trim() === normalizedCardId
            );

            if (!card) continue;

            console.log(
              "SPOTLIGHT → FOUND CARD:",
              card.id,
              "workspace:",
              workspace.slot
            );

              await setOverlayMode(false, true);
              await bringFloatspaceToFront();

              setIsFloatspaceLayer(true);
              setActiveWorkspaceId(workspace.id);
              setFocusCardId(card.id);
              setSpotlightCardId(card.id);

              window.setTimeout(() => {
                setSpotlightCardId((current) =>
                  current === card.id ? null : current
                );
              }, 2000);
              
            return;
          }

          console.log("SPOTLIGHT → CARD NOT FOUND:", normalizedCardId);
        } finally {
          window.setTimeout(() => {
            if (spotlightOpeningCardRef.current === normalizedCardId) {
              spotlightOpeningCardRef.current = null;
            }
          }, 500);
        }
      };

      void listen<string>(
        "open-card-from-spotlight",
        async (event) => {
          console.log("SPOTLIGHT → EVENT RECEIVED:", event.payload);
          await openCard(event.payload);
        }
      ).then(async (cleanup) => {
        unlisten = cleanup;
        console.log("SPOTLIGHT → LISTENER REGISTERED");

        try {
          const pendingCardId = await invoke<string | null>(
            "take_pending_spotlight_card"
          );

          console.log("SPOTLIGHT → PENDING CHECK:", pendingCardId);

          if (pendingCardId) {
            await openCard(pendingCardId);
          }
        } catch (error) {
          console.error("SPOTLIGHT → FAILED TO GET PENDING CARD:", error);
        }
      });

      return () => {
        unlisten?.();
      };
    }, []);

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
            Math.max(CANVAS_SIDE_PADDING, rawPoint.x),
            canvas.clientWidth - CANVAS_SIDE_PADDING - MIN_CARD_SIZE
          ),

          y: Math.min(
            Math.max(TOP_CREATION_LIMIT, rawPoint.y),
            canvas.clientHeight - CANVAS_SIDE_PADDING - MIN_CARD_SIZE
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
          canvasWidth - CANVAS_SIDE_PADDING,
          Math.max(CANVAS_SIDE_PADDING, point.x)
        );

        const constrainedY = Math.min(
          canvasHeight - CANVAS_SIDE_PADDING,
          Math.max(TOP_CREATION_LIMIT, point.y)
        );

      const nextDraft = {
          x: Math.max(
            CANVAS_SIDE_PADDING,
            Math.min(start.x, constrainedX)
          ),

          y: Math.max(
            TOP_CREATION_LIMIT,
            Math.min(start.y, constrainedY)
          ),
          
        width: Math.min(
          Math.max(MIN_CARD_SIZE, Math.abs(constrainedX - start.x)),
          canvasWidth - CANVAS_SIDE_PADDING - Math.min(start.x, constrainedX)
        ),

        height: Math.min(
          Math.max(MIN_CARD_SIZE, Math.abs(constrainedY - start.y)),
          canvasHeight - CANVAS_SIDE_PADDING - Math.min(start.y, constrainedY)
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

    function handleCanvasPointerUp(event: React.PointerEvent) {
      const pending = draftRef.current;

      creationStart.current = undefined;
      draftRef.current = undefined;
      setDraft(undefined);
        setIsCreatingCard(false);

      event.currentTarget.releasePointerCapture(event.pointerId);

      if (!pending || !didDragToCreate.current || !activeWorkspaceId) {
        return;
      }

      const canvas = canvasRef.current?.getBoundingClientRect();

      const snappedWidth = snapCardSize(pending.width);
      const snappedHeight = snapCardSize(pending.height);

        const maxWidth = Math.max(
          MIN_CARD_SIZE,
          (canvas?.width ?? Infinity) - CANVAS_SIDE_PADDING - pending.x
        );

        const maxHeight = Math.max(
          MIN_CARD_SIZE,
          (canvas?.height ?? Infinity) - CANVAS_SIDE_PADDING - pending.y
        );

      const finalWidth = Math.min(
        snappedWidth,
        maxWidth
      );

      const finalHeight = Math.min(
        snappedHeight,
        maxHeight
      );

      const card: Omit<Card, "id"> = {
        workspaceId: activeWorkspaceId,
        text: "",
        x: pending.x,
        y: pending.y,
        width: finalWidth,
        height: finalHeight,
      };

      void createCard(card).then((created) => {
        const zIndex = nextZIndex.current++;

        setCardZIndexes((current) => ({
          ...current,
          [created.id]: zIndex,
        }));

        setFocusCardId(created.id);
        setCards((current) => [...current, created]);

        if (onboardingStep === 2) {
            console.log("ONBOARDING: 2 → 3");
          void setOnboarding(3);
        }
      });
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
          onPointerCancel={handleCanvasPointerUp}
      >
          <AnimatePresence>
            {edgeHintPreview && (
              <motion.div
                className={`canvas-edge-hint canvas-edge-hint-${edgeHintPreview.edge}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                style={{
                  left: edgeHintPreview.x,
                  top: edgeHintPreview.y,
                  width: edgeHintPreview.width,
                  height: edgeHintPreview.height,
                }}
              />
            )}
          </AnimatePresence>
          
          {cards.length === 0 && activeWorkspace && (
            <motion.div
              className="empty-space-note"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div
                className="empty-space-name-row"
              >
                <div className="empty-space-slot">
                  {activeWorkspace.name || `SPACE ${activeWorkspace.slot}`}
                </div>
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
                key={card.id}
                card={card}
                cards={cards}
                setPlacementPreview={setPlacementPreview}
                setEdgeHint={setEdgeHintPreview}
                autoFocus={card.id === focusCardId}
                focusedCardId={focusedCardId}
                spotlightActive={card.id === spotlightCardId}
                isCut={cutCardId === card.id} // Передаем флаг, вырезана ли эта конкретная карточка
                onCut={() => setCutCardId(card.id)} // Функция для активации вырезания
                setFocusedCardId={setFocusedCardId}
                                  
                                  onType={() => {
                                    console.log("ONBOARDING: onType called, current step =", onboardingStep);

                                    if (onboardingStep === 3) {
                                      console.log("ONBOARDING: 3 → 4");
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
            {placementPreview && (
              <motion.div
                className="card-placement-preview"
                style={{
                  left: placementPreview.x,
                  top: placementPreview.y,
                  width: placementPreview.width,
                  height: placementPreview.height,
                }}
                initial={{
                  opacity: 0,
                  scale: 0.96,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  scale: 0.98,
                }}
                transition={{
                  duration: 0.12,
                  ease: "easeOut",
                }}
              />
            )}
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
              <StartupHint
                title="Floatspace ready"
                text="Press ⌥ + 2-9 to enter your Space"
              />
            )}

            {showQuitHint && (
              <StartupHint
                title="Quit Floatspace?"
                text="Press ⌘Q again to quit"
              />
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

function rectanglesOverlap(
                                    a: Pick<Card, "x" | "y" | "width" | "height">,
                                    b: Pick<Card, "x" | "y" | "width" | "height">
                                  ) {
                                    return (
                                      a.x < b.x + b.width &&
                                      a.x + a.width > b.x &&
                                      a.y < b.y + b.height &&
                                      a.y + a.height > b.y
                                    );
                                  }

                                  function distanceBetweenRectangles(
                                    a: Pick<Card, "x" | "y" | "width" | "height">,
                                    b: Pick<Card, "x" | "y" | "width" | "height">
                                  ) {
                                    const horizontal =
                                      a.x + a.width < b.x
                                        ? b.x - (a.x + a.width)
                                        : b.x + b.width < a.x
                                          ? a.x - (b.x + b.width)
                                          : 0;

                                    const vertical =
                                      a.y + a.height < b.y
                                        ? b.y - (a.y + a.height)
                                        : b.y + b.height < a.y
                                          ? a.y - (b.y + b.height)
                                          : 0;

                                    return Math.sqrt(
                                      horizontal * horizontal +
                                      vertical * vertical
                                    );
                                  }
