import { motion } from "framer-motion";

export type OnboardingStep = 1 | 2 | 3 | 4;

type OnboardingProps = {
  step: OnboardingStep;
};

const content = {
  1: {
    eyebrow: "FLOATSPACE",
    title: "Give your thoughts a place",
    text: "Your desktop is divided into Spaces. Press to open your first one.",
    keys: ["⌥", "2"],
  },
  2: {
    eyebrow: "SPACE 1",
    title: "Create your first card.",
    text: "Click and drag anywhere to create a note.",
    keys: null,
  },
  3: {
    eyebrow: "YOUR FIRST CARD",
    title: "Nice. This is your note.",
    text: "Start typing right away. Move the card anywhere on your desktop.",
    keys: null,
  },
  4: {
    eyebrow: "SPACES",
    title: "Keep things separate",
    text: "Create up to 8 Spaces for different ideas, projects, and thoughts.",
    keys: ["⌥", "2-9"],
  },
} as const;

export function Onboarding({
  step,
}: OnboardingProps) {
  const current = content[step];

  return (
    <motion.div
      className="onboarding-card"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.22,
        ease: "easeOut",
      }}
    >
      <motion.div
        key={step}
        className="onboarding-content"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.2,
          ease: "easeOut",
        }}
      >
        <div className="onboarding-progress">
          {[1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className={`onboarding-dot ${index === step ? "active" : ""}`}
            />
          ))}
        </div>

        <div className="onboarding-eyebrow">
          {current.eyebrow}
        </div>

        <div className="onboarding-title">
          {current.title}
        </div>

        <div className="onboarding-text">
          {current.text}
        </div>

        {current.keys && (
          <div className="onboarding-keys">
            {current.keys.map((key: string, index: number) => (
              <kbd key={index} className="onboarding-key">
                {key}
              </kbd>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-hint">
            Drag anywhere on the desktop
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-hint">
            Your cursor is already in the note
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
