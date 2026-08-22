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
    spotlightActive,
    onChange,
    onDelete,
    onActivate,
    onType,
    zIndex,
    setPlacementPreview,
    setEdgeHint,
    isCut = false,
      onCut = () => {}
}: {
    card: Card;
    cards: Card[];
    autoFocus: boolean;
    focusedCardId: string | null;
    setFocusedCardId: (id: string | null) => void;
    spotlightActive: boolean;
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
    ) => void;
    isCut?: boolean;
     onCut?: () => void;
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
    
    const handleFocus = () => {
        setFocusedCardId(card.id);
        onActivate();
        setIsActive(true);

        if (!textareaRef.current) return;

        // Авто-форматирование первой строки жирным
        if (!card.text) {
            textareaRef.current.innerHTML = "<b><br></b>";
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(textareaRef.current);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
            firstLineBoldRef.current = true;
        }
    };

    const handleBlur = () => {
        setIsActive(false);
        if (focusedCardId === card.id) {
            setFocusedCardId(null);
        }
        
        if (textareaRef.current) {
            onChange({
                ...card,
                text: textareaRef.current.innerHTML,
            }, true); // Жесткий коммит в SQLite
        }
    };

    const handlePaletteLeave = () => {
        // Если мышь ушла, запускаем таймер закрытия на 350 миллисекунд
        // Этого времени достаточно, чтобы случайный рывок мыши не закрыл меню
        paletteTimeoutRef.current = setTimeout(() => {
            setIsPaletteOpen(false);
        }, 350);
    };

    const handlePaletteEnter = () => {
        // Если пользователь вернул мышь обратно на палитру до истечения 350мс,
        // мы мгновенно отменяем таймер закрытия, и меню остается открытым
        if (paletteTimeoutRef.current) {
            clearTimeout(paletteTimeoutRef.current);
            paletteTimeoutRef.current = null;
        }
    };
    
    useEffect(() => {
        // Очищаем таймер палитры при размонтировании компонента карточки
        return () => {
            if (paletteTimeoutRef.current) clearTimeout(paletteTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
      const element = textareaRef.current;
      if (!element) return;

      element.innerHTML = card.text || "";

      if (!autoFocus) return;

      const frame = requestAnimationFrame(() => {
        const currentElement = textareaRef.current;
        if (!currentElement) return;

        currentElement.focus();

        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(currentElement);
        range.collapse(false);

        selection?.removeAllRanges();
        selection?.addRange(range);

        setFocusedCardId(card.id);
      });

      return () => cancelAnimationFrame(frame);
    }, [card.id, autoFocus, setFocusedCardId]);
    
    const [isActive, setIsActive] = useState(false);
    
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    
    // 8 официальных системных цветов macOS (включая серый для сброса)
    const availableColors = [
        { name: "red", hex: "#FF383C" },    // Красный
        { name: "orange", hex: "#FF8D28" }, // Оранжевый
        { name: "yellow", hex: "#FFCC00" }, // Желтый
        { name: "gray", hex: "#8D8D8C" },   // Серый — кнопка снятия тэга
        { name: "green", hex: "#34C759" },  // Зеленый
        { name: "blue", hex: "#0088FF" },   // Синий
        { name: "purple", hex: "#6155F5" }, // Фиолетовый
        { name: "pink", hex: "#CB30E0" }    // Розовый
    ];
    const paletteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    
    const canvasElement = textareaRef.current?.closest(".canvas");
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;

    const renderX = Math.max(
        CANVAS_SIDE_PADDING,
        Math.min(card.x, canvasWidth - CANVAS_SIDE_PADDING - card.width)
    );
    const renderY = Math.max(
        TOP_CREATION_LIMIT,
        Math.min(card.y, canvasHeight - CANVAS_SIDE_PADDING - card.height)
    );
    
    return (
        <motion.article
        className={`card ${
          focusedCardId === card.id ? "card-focused" : ""
        } ${spotlightActive ? "card-spotlight-found" : ""}`}

        style={{
            left: renderX,
            top: renderY,
            width: card.width,
            height: card.height,
            zIndex,
            opacity: isCut ? 0.4 : 1,
            filter: isCut ? "grayscale(30%)" : "none",
        }}
            
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    
                    
                    exit={{
                        opacity: 0,
                        scale: 0.96,
                        transition: { duration: 0.18, ease: "easeOut" }, // Быстрое и чистое растворение за 180мс
                    }}
                    
                    // Мягкий переход для появления/исчезновения
                    transition={{
                        type: "tween",
                        duration: 0.22,
                        ease: "easeOut"
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
              spellCheck={false}
              aria-label="Card text"
            
            onFocus={handleFocus}
            onBlur={handleBlur}
            
            onPaste={(event) => {
              event.preventDefault();

              // Получаем чистый текст без стилей
              const text = event.clipboardData.getData("text/plain").trim();

              // Регулярное выражение для проверки, является ли вставляемый текст ссылкой (http/https/www)
              const urlRegex = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;

              if (urlRegex.test(text)) {
                // Если это ссылка, формируем правильный URL для атрибута href
                const href = text.startsWith("www.") ? `https://${text}` : text;
                
                // Создаем HTML-строку с тегом ссылки
                const linkHtml = `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
                
                // Вставляем ссылку как HTML-элемент в позицию курсора
                document.execCommand("insertHTML", false, linkHtml);
              } else {
                // Если это обычный текст, вставляем его без изменений
                document.execCommand("insertText", false, text);
              }
            }}

            
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
                    
                    // === НАЧАЛО БЛОКА ВЫРЕЗАНИЯ КАРТОЧКИ (Шаг 3) ===
                    // Перехватываем Cmd+X (Mac)
                    const isCutShortcut = (event.metaKey) && event.key.toLowerCase() === "x";
                    
                    // Проверяем, что шорткат нажат, но при этом пользователь НЕ выделил мышкой текст внутри карточки
                    if (isCutShortcut && window.getSelection()?.toString() === "") {
                      event.preventDefault(); // Отменяем стандартное вырезание букв
                      onCut();                // Вызываем функцию вырезания карточки целиком
                      return;
                    }
                    
                  // === НАЧАЛО БЛОКА АВТОЗАМЕНЫ ТИРЕ НА ЛИНИЮ ===
                    if (event.key === "Enter") {
                      const selection = window.getSelection();
                      if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const textNode = range.startContainer;
                        
                        if (textNode.nodeType === Node.TEXT_NODE) {
                          const content = textNode.textContent || "";
                          const offset = range.startOffset;
                          const textBeforeCursor = content.substring(0, offset);
                          
                          const dashRegex = /(-{3,20})$/;
                          const match = textBeforeCursor.match(dashRegex);
                          
                          if (match) {
                            event.preventDefault(); // Отменяем стандартный Enter
                            
                            const matchedText = match[0];
                            const matchLength = matchedText.length;
                            const startOffset = offset - matchLength;
                            
                            // Безопасно стираем тире (один раз)
                            const actualTextNode = textNode as Text;
                            actualTextNode.deleteData(startOffset, matchLength);
                                                  
                            // Создаем саму линию (один раз)
                            const hr = document.createElement("hr");
                            hr.className = "card-divider";
                            hr.style.border = "none";
                            hr.style.borderTop = "1px solid rgba(128, 128, 128, 0.3)";
                            hr.style.margin = "12px 0";
                            hr.setAttribute("contenteditable", "false");
                            
                            // Создаем элемент переноса строки
                            const br = document.createElement("br");
                            
                            // Аккуратно вставляем линию и перенос в позицию курсора
                            range.insertNode(br);
                            range.insertNode(hr);
                            
                            // Переносим курсор за только что вставленный перенос строки <br>
                            range.setStartAfter(br);
                            range.setEndAfter(br);
                            selection.removeAllRanges();
                            selection.addRange(range);
                            
                            // Принудительно отключаем первый жирный шрифт
                            firstLineBoldRef.current = false;
                            
                            // Сохраняем изменения на бэкенде в Rust
                            if (textareaRef.current) {
                              onChange({
                                ...card,
                                text: textareaRef.current.innerHTML,
                              });
                            }
                            return;
                          }
                        }
                      }
                    }
                          
                    if (
                      event.key === "Enter" &&
                      firstLineBoldRef.current
                    ) {
                      event.preventDefault();

                      document.execCommand("insertParagraph");
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
            onBlur={handleBlur}
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
            
            {/* === БЛОК ТЭГОВ ПО МАКЕТУ === */}
            <div className="tag-container">
              {/* Круглая точка-маркер (активна при ховере, либо если цвет уже выбран) */}
            <button
              className={`tag-trigger ${card.tagColor ? "has-tag" : ""}`}
              aria-label="Select tag color"
              style={{
                backgroundColor: card.tagColor
                  ? availableColors.find(c => c.name === card.tagColor)?.hex
                  : undefined
              }}
              onClick={(event) => {
                event.stopPropagation();
                setIsPaletteOpen(!isPaletteOpen);
              }}
            />


              {/* Всплывающая Liquid Glass плашка выбора цвета */}
              <AnimatePresence>
                {isPaletteOpen && (
                  <motion.div
                    className="tag-palette"
                                   style={{ transformOrigin: "top right" }}
                                                     initial={{ opacity: 0, scale: 0.8 }}
                                                     animate={{ opacity: 1, scale: 1 }}
                                                     exit={{ opacity: 0, scale: 0.8 }}
                                                     transition={{ duration: 0.12, ease: "easeOut" }}
                                                     onPointerDown={(e) => e.stopPropagation()}
                                                     onMouseEnter={handlePaletteEnter}
                                                     onMouseLeave={handlePaletteLeave}
                                                   >
                                   {availableColors.map((color) => (
                                     <button
                                       key={color.name}
                                       className={`palette-dot ${color.name} ${
                                         card.tagColor === color.name || (!card.tagColor && color.name === "gray") ? "selected" : ""
                                       }`}
                                       style={{ backgroundColor: color.hex }}
                                       onClick={(event) => {
                                         event.stopPropagation();
                                         
                                         // Если кликнули на серый цвет (gray) — полностью сбрасываем тэг в базе
                                         // Если кликнули на любой другой цвет — ставим его
                                         const nextColor = color.name === "gray" ? undefined : color.name;
                                         
                                         onChange({
                                           ...card,
                                           tagColor: nextColor
                                         }, true); // Жесткий коммит в SQLite
                                         
                                         setIsPaletteOpen(false); // Закрываем палитру
                                       }}
                                     />
                                   ))}

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* ============================ */}

            
            
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
