import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-line bg-dusk transition-colors duration-200",
      "data-[state=checked]:border-sun data-[state=checked]:bg-sun disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block size-5 translate-x-1 rounded-full bg-ink-muted shadow-sm transition-transform duration-200 ease-out-soft",
        "data-[state=checked]:translate-x-6 data-[state=checked]:bg-ground",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
