import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors duration-150 ease-out-soft disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        sun: "bg-sun text-ground hover:bg-sun-core active:bg-sun",
        quiet: "bg-dusk text-ink hover:bg-dusk-2",
        ghost: "text-ink-muted hover:bg-dusk hover:text-ink",
        danger: "text-danger hover:bg-danger/10",
      },
      size: {
        md: "",
        icon: "size-12 px-0",
        sm: "min-h-10 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "quiet", size: "md" },
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
