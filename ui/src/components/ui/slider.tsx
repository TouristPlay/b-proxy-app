import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex h-8 w-full touch-none items-center select-none", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-glass-3">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-amber-deep to-amber" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-7 w-11 rounded-full bg-white shadow-[0_2px_10px_rgb(0_0_0/0.4)] transition-transform focus-visible:scale-105" />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";
