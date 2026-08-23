import { motion } from "framer-motion";
import {
  enable,
  isEnabled,
} from "@tauri-apps/plugin-autostart";
import enterIcon from "./assets/enter.svg";
import { useEffect, useState } from "react";

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

type OnboardingProps = {
  step: OnboardingStep;
};

const content = {
  1: {
    eyebrow: "FLOATSPACE",
    title: "Give your thoughts a place.",
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
    title: "Keep things separate.",
    text: "Create up to 8 Spaces for different ideas, projects, and thoughts.",
    keys: ["⌥", "2-9"],
  },
    5: {
      eyebrow: "ONE LAST THING",
      title: "Set up Floatspace.",
      text: "A few permissions to unlock all features.",
      keys: null,
    },
} as const;

export function Onboarding({
  step,
}: OnboardingProps) {
    const [autostartEnabled, setAutostartEnabled] = useState(false);
    const [autostartLoading, setAutostartLoading] = useState(false);
  const current = content[step];
    
    useEffect(() => {
      if (step !== 5) return;

      void isEnabled().then(setAutostartEnabled);
    }, [step]);
    
    async function handleEnableAutostart() {
      try {
        setAutostartLoading(true);

        await enable();

        const enabled = await isEnabled();
        setAutostartEnabled(enabled);

        console.log("FLOATSPACE AUTOSTART:", enabled);
      } catch (error) {
        console.error("Failed to enable autostart:", error);
      } finally {
        setAutostartLoading(false);
      }
    }

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
          {[1, 2, 3, 4, 5].map((index) => (
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
              {current.keys.map((key, index) => (
                <kbd key={index} className="onboarding-key">
                  {key}
                </kbd>
              ))}
            </div>
          )}
          
          {step === 5 && (
            <>
              <div className="integration-item">
                <div className="integration-info">
                  <div className="integration-title">
                    Launch at login
                  </div>

                  <div className="integration-description">
                    Start Floatspace automatically when you log in.
                  </div>
                </div>

                <button
                  type="button"
                  className={`integration-button ${
                    autostartEnabled ? "enabled" : ""
                  }`}
                  onClick={() => void handleEnableAutostart()}
                  disabled={autostartLoading || autostartEnabled}
                >
                  <span className="integration-button-text">
                    {autostartEnabled
                      ? "Enabled"
                      : autostartLoading
                        ? "Enabling..."
                        : "Enable"}
                  </span>

                  {autostartEnabled && (
                    <span className="integration-check">✓</span>
                  )}
                </button>
              </div>
              <div className="onboarding-finish-hint">
                <div className="onboarding-finish-copy">
                  <div className="onboarding-finish-title">
                    Or just press Enter to finish
                  </div>

                  <div className="onboarding-finish-subtitle">
                    You can set this up later in Settings.
                  </div>
                </div>

                <div className="onboarding-enter-icon">
                  <img src={enterIcon} alt="" />
                </div>
              </div>
            </>
          )}
      </motion.div>
    </motion.div>
  );
}
