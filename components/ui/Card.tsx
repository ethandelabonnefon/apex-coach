"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type CardVariant = "default" | "elevated" | "bordered" | "gradient";
type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
}

const variants: Record<CardVariant, string> = {
  default: "bg-bg-secondary",
  elevated: "bg-bg-secondary shadow-xl shadow-black/30",
  bordered: "bg-bg-secondary border border-border-subtle",
  gradient:
    "bg-gradient-to-br from-accent/5 to-transparent border border-accent/10",
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = "default",
      padding = "md",
      interactive = false,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl transition-all duration-200",
          variants[variant],
          paddings[padding],
          interactive && "hover:bg-bg-hover cursor-pointer tap-scale",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("mb-4", className)} {...props}>
    {children}
  </div>
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold tracking-tight text-text-primary",
      className
    )}
    {...props}
  >
    {children}
  </h3>
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("mt-1 text-sm text-text-tertiary", className)}
    {...props}
  >
    {children}
  </p>
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props}>
    {children}
  </div>
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-4 flex items-center gap-2", className)}
    {...props}
  >
    {children}
  </div>
));
CardFooter.displayName = "CardFooter";
