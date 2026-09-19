"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none",
    "transition-all duration-200 ease-out",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
    "disabled:opacity-50 disabled:pointer-events-none",
    "active:scale-[0.98] touch-manipulation",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-bg-primary font-semibold hover:bg-accent-hover shadow-lg shadow-accent/20",
        secondary:
          "bg-bg-tertiary text-text-primary border border-border-subtle hover:bg-bg-hover",
        ghost:
          "bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary",
        danger: "bg-error/10 text-error hover:bg-error/20",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading ? (
          <span
            aria-hidden
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

export { buttonVariants };
