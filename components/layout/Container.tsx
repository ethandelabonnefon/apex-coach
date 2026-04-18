import { cn } from "@/lib/utils";

type ContainerSize = "sm" | "md" | "lg" | "xl";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
}

const sizes: Record<ContainerSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Container({
  children,
  className,
  size = "md",
  ...props
}: ContainerProps) {
  return (
    <div className={cn("mx-auto px-4", sizes[size], className)} {...props}>
      {children}
    </div>
  );
}
