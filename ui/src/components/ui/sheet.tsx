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
  icon,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-[fade_200ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[32px] border-t border-edge-2 bg-[#121821]/95 px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] backdrop-blur-2xl",
            "md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[86dvh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[32px] md:border md:pt-6",
            wide ? "md:w-[560px]" : "md:w-[460px]",
          )}
        >
          <div className="mx-auto mb-5 h-1 w-11 rounded-full bg-amber/60 md:hidden" aria-hidden />
          <div className="mb-6 flex items-center gap-4">
            {icon}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-xl font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[15px] leading-snug text-ink-2">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink"
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
