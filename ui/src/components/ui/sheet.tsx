import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Нижняя шторка на телефоне, окно по центру на широком экране. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ground/70 backdrop-blur-sm data-[state=open]:animate-[fade_200ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[28px] border-t border-line bg-dusk px-6 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]",
            "md:inset-auto md:top-1/2 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:border md:pt-6",
          )}
        >
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-xl font-medium tracking-tight">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-dusk-2 hover:text-ink"
              aria-label="Закрыть"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
