import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        amber:
          "bg-gradient-to-b from-amber-2 to-amber text-on-accent shadow-[0_8px_24px_-10px_color-mix(in_srgb,var(--color-amber)_70%,transparent)] hover:brightness-105",
        glass: "glass text-ink hover:bg-glass-2",
        ghost: "text-ink-2 hover:bg-glass-2 hover:text-ink",
        danger: "border border-bad/30 bg-bad/10 text-bad hover:bg-bad/15",
      },
      size: {
        md: "",
        icon: "size-11 min-h-11 px-0",
        sm: "min-h-10 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
