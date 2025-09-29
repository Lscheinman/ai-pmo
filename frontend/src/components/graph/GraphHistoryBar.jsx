import React, { useRef } from "react";
import IconButton from "../buttons/IconButton";
import { ChevronLeftIcon, ChevronRightIcon, DeleteIcon, HomeIcon, RefreshIcon } from "../icons";

export default function GraphHistoryBar({
  graphHistory,
  currentGraphId,
  onShowHome,
  onSelectSnapshot,
  onRemoveSnapshot,
  onPrevSnapshot,
  onNextSnapshot,
  compact = false
}) {
  const hasHistory = Array.isArray(graphHistory) && graphHistory.length > 0;
  const scrollRef = useRef(null);

  // Optional: let chevrons also scroll the strip in addition to switching selection
  const scrollBy = (dx) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dx, behavior: "smooth" });
  };

  return (
    <div className={`ghb ${compact ? "ghb--compact" : ""}`}>
      {/* Fixed controls */}
      <div className="ghb__controls">
        <IconButton
          icon={HomeIcon ? <HomeIcon /> : <RefreshIcon />}
          title="Home graph"
          variant="neutral"
          size={18}
          onClick={onShowHome}
        />

        {/* Previous: switch AND nudge scroll left */}
        <IconButton
          icon={<ChevronLeftIcon />}
          title="Previous snapshot"
          variant="neutral"
          size={18}
          onClick={() => { onPrevSnapshot?.(); scrollBy(-180); }}
          disabled={!hasHistory}
        />

        {/* Next: switch AND nudge scroll right */}
        <IconButton
          icon={<ChevronRightIcon />}
          title="Next snapshot"
          variant="neutral"
          size={18}
          onClick={() => { onNextSnapshot?.(); scrollBy(180); }}
          disabled={!hasHistory}
        />
      </div>

      {/* Scrollable pills */}
      <div className="ghb__scroller" ref={scrollRef} role="list" aria-label="Graph snapshots">
        {hasHistory ? (
          graphHistory.map((snap) => {
            const active = snap.id === currentGraphId;
            const ts = snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "";
            return (
              <div
                key={snap.id}
                role="listitem"
                className={`ghb__item ${active ? "is-active" : ""}`}
                title={`${snap.title}${ts ? " • " + ts : ""}`}
              >
                <button
                className={`pill pill--button ${active ? "pill--active" : ""}`}
                onClick={() => onSelectSnapshot?.(snap.id)}
                aria-current={active ? "true" : "false"}
                >
                <span className="pill__title">{snap.title}</span>
                {snap.meta?.type && <span className="pill__tag">{snap.meta.type}</span>}
                </button>

                <IconButton
                  icon={<DeleteIcon />}
                  title="Remove snapshot"
                  variant="neutral"
                  size={16}
                  className="ghb__close"
                  onClick={(e) => { e.stopPropagation(); onRemoveSnapshot?.(snap.id); }}
                />
              </div>
            );
          })
        ) : (
          <div className="ghb__empty">No snapshots yet</div>
        )}
      </div>
    </div>
  );
}
