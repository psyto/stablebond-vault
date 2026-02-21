interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-accent-red/30 bg-accent-red/10 px-4 py-3">
      <p className="text-sm text-accent-red">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-medium text-accent-red hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
