import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, onCheckedChange, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    onCheckedChange={(v) => {
      haptic(v ? "toggle-on" : "toggle-off");
      onCheckedChange?.(v);
    }}
    className={cn(
      "peer relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full bg-glass-3 transition-colors duration-200",
      "data-[state=checked]:bg-amber disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block size-[26px] translate-x-[2px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-transform duration-200 ease-[var(--ease-soft)]",
        "data-[state=checked]:translate-x-[24px]",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
