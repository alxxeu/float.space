import { motion } from "framer-motion";

type StartupHintProps = {
  title: string;
  text: string;
};

export function StartupHint({ title, text }: StartupHintProps) {
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
      {title}

      <div className="startup-hint-text">
        {text}
      </div>
    </motion.div>
  );
}
