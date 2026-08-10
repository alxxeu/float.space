import { motion } from "framer-motion";

export function StartupHint() {
  return (
    <motion.div
      className="startup-hint"
      initial={{
        opacity: 0,
        y: -120,
        scale: 0.94,
      }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}
      exit={{
        opacity: 0,
        y: -80,
        scale: 0.96,
      }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 28,
        mass: 0.8,
      }}
    >
      <div className="startup-hint-title">
        Floatspace ready
      </div>

      <div className="startup-hint-text">
        Press ⌥ + 2-9 to enter your Space
      </div>
    </motion.div>
  );
}
