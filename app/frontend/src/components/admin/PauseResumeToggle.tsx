"use client";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface PauseResumeToggleProps {
  isActive: boolean;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  loading: boolean;
}

export function PauseResumeToggle({
  isActive,
  onPause,
  onResume,
  loading,
}: PauseResumeToggleProps) {
  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-white">
        Protocol Status
      </h2>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              isActive ? "bg-accent-green" : "bg-accent-red"
            }`}
          />
          <span className="text-white">
            {isActive ? "Protocol is Active" : "Protocol is Paused"}
          </span>
        </div>

        <button
          onClick={isActive ? onPause : onResume}
          disabled={loading}
          className={isActive ? "btn-secondary" : "btn-primary"}
        >
          {loading ? (
            <LoadingSpinner />
          ) : isActive ? (
            "Pause Protocol"
          ) : (
            "Resume Protocol"
          )}
        </button>
      </div>
    </div>
  );
}
