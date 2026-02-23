"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "image" | "animated";
  size?: number;
  className?: string;
}

export function BrandLogo({
  variant = "animated",
  size = 32,
  className,
}: BrandLogoProps) {
  const isAnimated = variant === "animated";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-xl overflow-hidden",
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Glow Background */}
      {isAnimated && (
        <motion.div
          className="absolute inset-0 rounded-xl blur-md"
          style={{
            background:
              "linear-gradient(135deg, rgba(34,211,238,0.6), rgba(99,102,241,0.6))",
          }}
          animate={{
            opacity: [0.5, 0.9, 0.5],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Logo */}
      <motion.div
        className="relative z-10"
        animate={
          isAnimated
            ? {
                y: [0, -3, 0],
                rotate: [0, 2, -2, 0],
              }
            : {}
        }
        transition={
          isAnimated
            ? {
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : {}
        }
      >
        <Image
          src="/logo.png"
          alt="Notifly Logo"
          width={size}
          height={size}
          className="object-contain"
          priority
        />
      </motion.div>
    </div>
  );
}