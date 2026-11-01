"use client"

type RetryProps = { title?: string; message?: string; onRetry?: () => void; compact?: boolean }

export function PageLoading({ label = "Loading your hotel information…" }: { label?: string }) {
  return <div className="page-state page-state-loading" role="status" aria-live="polite"><span className="page-state-spinner" /><div><strong>Please wait</strong><p>{label}</p></div></div>
}

export function PageError({ title = "This page could not be loaded", message, onRetry, compact = false }: RetryProps) {
  return <div className={`page-state page-state-error${compact ? " compact" : ""}`} role="alert"><span className="page-state-icon">!</span><div><strong>{title}</strong><p>{message || "Please check your connection and try again."}</p>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div></div>
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="inline-error" role="alert"><span>!</span><p>{message}</p>{onRetry && <button type="button" className="sec" onClick={onRetry}>Try again</button>}</div>
}
