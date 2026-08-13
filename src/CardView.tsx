import {
    useEffect,
    useRef,
    useState
} from "react";

import {
    AnimatePresence,
    motion
} from "framer-motion";

import type { Card } from "./domain";

import { openUrl } from "@tauri-apps/plugin-opener";

const MIN_CARD_SIZE = 120;
const CARD_SIZE_STEP = 60;
const TOP_CREATION_LIMIT = 73;
const CANVAS_SIDE_PADDING = 24;
const DELETE_HOLD_TIME = 400;


function snapCardSize(value: number) {
  return Math.max(
    MIN_CARD_SIZE,
    Math.round(value / CARD_SIZE_STEP) * CARD_SIZE_STEP
  );
}

function findPlacementPreview(
  card: Card,
  cards: Card[],
  canvasWidth: number,
  canvasHeight: number
                              ) {
    const GAP = 16;
    const ACTIVATION_DISTANCE = 45;
    
    let best: {
        distance: number;
        x: number;
        y: number;
    } | null = null;
    
    for (const other of cards) {
        if (other.id === card.id) continue;
        
        // RIGHT
        {
            const x = other.x + other.width + GAP;
            
            const yCandidates = [
                other.y,
                other.y + other.height / 2 - card.height / 2,
                other.y + other.height - card.height,
            ];
            
            for (const y of yCandidates) {
                const distance = Math.hypot(
                                            card.x - x,
                                            card.y - y
                                            );
                
                if (
                    distance <= ACTIVATION_DISTANCE &&
                    x + card.width <= canvasWidth - CANVAS_SIDE_PADDING &&
                    y >= TOP_CREATION_LIMIT &&
                    y + card.height <= canvasHeight - CANVAS_SIDE_PADDING
                    ) {
                        if (!best || distance < best.distance) {
                            best = { distance, x, y };
                        }
                    }
            }
        }
        
        
        // LEFT
        {
            const x = other.x - card.width - GAP;
            
            const yCandidates = [
                other.y,
                other.y + other.height / 2 - card.height / 2,
                other.y + other.height - card.height,
            ];
            
            for (const y of yCandidates) {
                const distance = Math.hypot(
                                            card.x - x,
                                            card.y - y
                                            );
                
                if (
                    distance <= ACTIVATION_DISTANCE &&
                    x >= CANVAS_SIDE_PADDING &&
                    y >= TOP_CREATION_LIMIT &&
                    y + card.height <= canvasHeight - CANVAS_SIDE_PADDING
                    ) {
                        if (!best || distance < best.distance) {
                            best = { distance, x, y };
                        }
                    }
            }
        }
        
        
        // BOTTOM
        {
            const y = other.y + other.height + GAP;
            
            const xCandidates = [
                other.x,
                other.x + other.width / 2 - card.width / 2,
                other.x + other.width - card.width,
            ];
            
            for (const x of xCandidates) {
                const distance = Math.hypot(
                                            card.x - x,
                                            card.y - y
                                            );
                
                if (
                    distance <= ACTIVATION_DISTANCE &&
                    x >= CANVAS_SIDE_PADDING &&
                    x + card.width <= canvasWidth - CANVAS_SIDE_PADDING &&
                    y + card.height <= canvasHeight - CANVAS_SIDE_PADDING
                    ) {
                        if (!best || distance < best.distance) {
                            best = { distance, x, y };
                        }
                    }
            }
        }
        
        
        // TOP
        {
            const y = other.y - card.height - GAP;
            
            const xCandidates = [
                other.x,
                other.x + other.width / 2 - card.width / 2,
                other.x + other.width - card.width,
            ];
            
            for (const x of xCandidates) {
                const distance = Math.hypot(
                                            card.x - x,
                                            card.y - y
                                            );
                
                if (
                    distance <= ACTIVATION_DISTANCE &&
                    x >= CANVAS_SIDE_PADDING &&
                    x + card.width <= canvasWidth - CANVAS_SIDE_PADDING &&
                    y >= TOP_CREATION_LIMIT
                    ) {
                        if (!best || distance < best.distance) {
                            best = { distance, x, y };
                        }
                    }
            }
        }
    }
        if (!best) return null;
        
        return {
            x: best.x,
            y: best.y,
            width: card.width,
            height: card.height,
        };
    }
  


export function CardView({
    card,
    cards,
    autoFocus,
    focusedCardId,
    setFocusedCardId,
    onChange,
    onDelete,
    onActivate,
    onType,
    zIndex,
    setPlacementPreview,
    setEdgeHint
}: {
    card: Card;
    cards: Card[];
    autoFocus: boolean;
    focusedCardId: string | null;
    setFocusedCardId: (id: string | null) => void;
    onChange: (card: Card, immediately?: boolean) => void;
    onDelete: (id: string) => void;
    onActivate: () => void;
    onType?: () => void;
    zIndex: number;
    setPlacementPreview: (
                          preview: {
                              x: number;
                              y: number;
                              width: number;
                              height: number;
                          } | null
                          ) => void;
    setEdgeHint: (
      hint: {
        edge: "top" | "left" | "right" | "bottom";
        x: number;
        y: number;
        width: number;
        height: number;
      } | null
    ) => void;е
}) {
    const start = useRef<{
        x: number;
        y: number;
        card: Card;
        latest: Card;
        mode: "move" | "resize";
    }>();
    
    const textareaRef = useRef<HTMLDivElement | null>(null);
    const firstLineBoldRef = useRef(false);

    useEffect(() => {
      const element = textareaRef.current;

      if (!element) return;

      element.innerHTML = card.text || "";

      if (autoFocus && !card.text) {
        firstLineBoldRef.current = true;

        requestAnimationFrame(() => {
          element.focus();

          // Ставим курсор в начало
          const selection = window.getSelection();
          const range = document.createRange();

          range.selectNodeContents(element);
          range.collapse(false);

          selection?.removeAllRanges();
          selection?.addRange(range);

          // Включаем bold для нового вводимого текста
          document.execCommand("bold", false, "true");
        });
      }
    }, [card.id]);
    
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
        setPlacementPreview(null);
        
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

      const canvas = event.currentTarget
        .closest(".canvas")
        ?.getBoundingClientRect();

      if (!canvas) return;

      const dx = event.clientX - operation.x;
      const dy = event.clientY - operation.y;

      if (operation.mode === "move") {
        const maxX = Math.max(
          CANVAS_SIDE_PADDING,
          canvas.width - CANVAS_SIDE_PADDING - operation.card.width
        );

        const maxY = Math.max(
          TOP_CREATION_LIMIT,
          canvas.height - CANVAS_SIDE_PADDING - operation.card.height
        );

        const next = {
          ...operation.card,

          x: Math.min(
            maxX,
            Math.max(
              CANVAS_SIDE_PADDING,
              operation.card.x + dx
            )
          ),

          y: Math.min(
            maxY,
            Math.max(
              TOP_CREATION_LIMIT,
              operation.card.y + dy
            )
          ),
        };

        operation.latest = next;
        onChange(next);

          const EDGE_HINT_DISTANCE = 35;

          const topDistance = next.y - TOP_CREATION_LIMIT;
          const leftDistance = next.x - CANVAS_SIDE_PADDING;

          const rightDistance =
            canvas.width -
            CANVAS_SIDE_PADDING -
            next.x -
            next.width;

          const bottomDistance =
            canvas.height -
            CANVAS_SIDE_PADDING -
            next.y -
            next.height;

          const distances = [
            {
              edge: "top" as const,
              distance: topDistance,
            },
            {
              edge: "left" as const,
              distance: leftDistance,
            },
            {
              edge: "right" as const,
              distance: rightDistance,
            },
            {
              edge: "bottom" as const,
              distance: bottomDistance,
            },
          ];

          const closest = distances.reduce((best, current) =>
            current.distance < best.distance ? current : best
          );

          if (closest.distance <= EDGE_HINT_DISTANCE) {
            if (closest.edge === "top") {
              setEdgeHint({
                edge: "top",
                x: next.x,
                y: TOP_CREATION_LIMIT,
                width: next.width,
                height: 3,
              });
            }

            if (closest.edge === "bottom") {
              setEdgeHint({
                edge: "bottom",
                x: next.x,
                y: canvas.height - CANVAS_SIDE_PADDING,
                width: next.width,
                height: 3,
              });
            }

            if (closest.edge === "left") {
              setEdgeHint({
                edge: "left",
                x: CANVAS_SIDE_PADDING,
                y: next.y,
                width: 3,
                height: next.height,
              });
            }

            if (closest.edge === "right") {
              setEdgeHint({
                edge: "right",
                x: canvas.width - CANVAS_SIDE_PADDING,
                y: next.y,
                width: 3,
                height: next.height,
              });
            }
          } else {
            setEdgeHint(null);
          }
          
        const preview = findPlacementPreview(
          next,
          cards,
          canvas.width,
          canvas.height
        );

        setPlacementPreview(preview);

        return;
      }

      // resize
      const maxWidth = Math.max(
        MIN_CARD_SIZE,
        canvas.width - CANVAS_SIDE_PADDING - operation.card.x
      );

      const maxHeight = Math.max(
        MIN_CARD_SIZE,
        canvas.height - CANVAS_SIDE_PADDING - operation.card.y
      );

      const next = {
        ...operation.card,

        width: Math.min(
          maxWidth,
          Math.max(
            MIN_CARD_SIZE,
            operation.card.width + dx
          )
        ),

        height: Math.min(
          maxHeight,
          Math.max(
            MIN_CARD_SIZE,
            operation.card.height + dy
          )
        ),
      };

      operation.latest = next;
      onChange(next);

      setPlacementPreview(null);
    }
    
    function finish(event: React.PointerEvent) {
        const operation = start.current;
        if (!operation) return;
        setEdgeHint(null);
        
        const canvas = event.currentTarget
        .closest(".canvas")
        ?.getBoundingClientRect();
        
        let finalCard = operation.latest;
        
        if (operation.mode === "move") {
            const preview = canvas
            ? findPlacementPreview(
                                   operation.latest,
                                   cards,
                                   canvas.width,
                                   canvas.height
                                   )
            : null;
            
            if (preview) {
                finalCard = {
                    ...finalCard,
                    x: preview.x,
                    y: preview.y,
                };
            }
            
            setPlacementPreview(null);
        }
        
        if (operation.mode === "resize") {
            const maxWidth = Math.max(
                                      MIN_CARD_SIZE,
                                      (canvas?.width ?? Infinity) - finalCard.x
                                      );
            
            const maxHeight = Math.max(
                                       MIN_CARD_SIZE,
                                       (canvas?.height ?? Infinity) - finalCard.y
                                       );
            
            finalCard = {
                ...finalCard,
                
                width: Math.min(
                                maxWidth,
                                snapCardSize(finalCard.width)
                                ),
                
                height: Math.min(
                                 maxHeight,
                                 snapCardSize(finalCard.height)
                                 ),
            };
        }
        
        operation.latest = finalCard;
        
        onChange(finalCard, true);
        
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // pointer capture уже мог быть освобождён браузером
        }
        
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
            <div className="card-handle" aria-label="Move card" onPointerDown={(event) => {
                begin(event, "move");
            }}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}/>
            
            <div
              ref={textareaRef}
              className="card-textarea"
              contentEditable
              suppressContentEditableWarning
              autoFocus={autoFocus}
              spellCheck={false}
              aria-label="Card text"
            
            onClick={(event) => {
              const target = event.target as HTMLElement;
              const link = target.closest("a");

              if (!link) return;

              const href = link.getAttribute("href");

              if (!href) return;

              event.preventDefault();
              event.stopPropagation();

              void openUrl(href);
            }}
            
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;
              const link = target.closest("a");

              if (link) {
                event.preventDefault();
                event.stopPropagation();

                const href = link.getAttribute("href");

                console.log("LINK CLICK:", href);

                if (href) {
                  void openUrl(href)
                    .then(() => {
                      console.log("LINK OPENED:", href);
                    })
                    .catch((error) => {
                      console.error("LINK OPEN ERROR:", error);
                    });
                }

                return;
              }

              event.stopPropagation();
            }}
              data-placeholder={
                isActive && !card.text ? "Write something..." : ""
              }
                
            onFocus={() => {
              setFocusedCardId(card.id);
              onActivate();
            }}
            
            onInput={(event) => {
              const html = event.currentTarget.innerHTML;
              const text = event.currentTarget.textContent?.trim() ?? "";

              onChange({
                ...card,
                text: html,
              });

              if (text.length > 0) {
                onType?.();
              }
            }}
            
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                firstLineBoldRef.current
              ) {
                event.preventDefault();

                document.execCommand("insertParagraph");

                // Выключаем bold уже после создания новой строки
                document.execCommand("bold", false, "false");

                firstLineBoldRef.current = false;

                return;
              }

              if (event.metaKey && event.key.toLowerCase() === "b") {
                event.preventDefault();
                document.execCommand("bold");
                return;
              }

              if (event.metaKey && event.key.toLowerCase() === "i") {
                event.preventDefault();
                document.execCommand("italic");
                return;
              }

              if (event.metaKey && event.key.toLowerCase() === "u") {
                event.preventDefault();
                document.execCommand("underline");
                return;
              }
            }}
              onBlur={() => setIsActive(false)}
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
