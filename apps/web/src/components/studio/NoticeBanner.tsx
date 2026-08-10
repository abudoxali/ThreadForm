export interface NoticeBannerProps {
  message: string;
  onDismiss: () => void;
}

/** A restrained, single-line notice for recoverable problems — never a raw error or stack trace. */
export function NoticeBanner({ message, onDismiss }: NoticeBannerProps) {
  return (
    <div
      role="alert"
      className="border-danger/40 bg-surface-raised text-primary mx-auto mb-6 flex max-w-lg items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-secondary hover:text-primary focus-visible:ring-accent-strong shrink-0 text-xs font-medium focus-visible:outline-none focus-visible:ring-2"
      >
        Dismiss
      </button>
    </div>
  );
}
