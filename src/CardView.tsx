
import {
    useEffect,
    useRef,
    useState
} from "react";

import {
    AnimatePresence,
    motion
} from "framer-motion";

const MIN_CARD_SIZE = 120;
const CARD_SIZE_STEP = 60;
const TOP_CREATION_LIMIT = 38;
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
    const GAP = 12;
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
                    x + card.width <= canvasWidth &&
                    y >= TOP_CREATION_LIMIT &&
                    y + card.height <= canvasHeight
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
                    x >= 0 &&
                    y >= TOP_CREATION_LIMIT &&
                    y + card.height <= canvasHeight
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
                    x >= 0 &&
                    x + card.width <= canvasWidth &&
                    y + card.height <= canvasHeight
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
                    x >= 0 &&
                    x + card.width <= canvasWidth &&
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
    setPlacementPreview
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
                                  0,
                                  canvas.width - operation.card.width
                                  );
            
            const maxY = Math.max(
                                  TOP_CREATION_LIMIT,
                                  canvas.height - operation.card.height
                                  );
            
            const next = {
                ...operation.card,
                
                x: Math.min(
                            maxX,
                            Math.max(0, operation.card.x + dx)
                            ),
                
                y: Math.min(
                            maxY,
                            Math.max(TOP_CREATION_LIMIT, operation.card.y + dy)
                            ),
            };
            
            operation.latest = next;
            
            onChange(next);
            
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
                                  canvas.width - operation.card.x
                                  );
        
        const maxHeight = Math.max(
                                   MIN_CARD_SIZE,
                                   canvas.height - operation.card.y
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
