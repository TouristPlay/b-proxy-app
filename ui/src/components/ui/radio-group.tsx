import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as React from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, onValueChange, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    className={cn("grid", className)}
    onValueChange={(v) => {
      haptic("select");
      onValueChange?.(v);
    }}
    {...props}
  />
));
RadioGroup.displayName = "RadioGroup";

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-ink-3 transition-colors",
      "data-[state=checked]:border-amber",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="block size-2.5 rounded-full bg-amber" />
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = "RadioGroupItem";
