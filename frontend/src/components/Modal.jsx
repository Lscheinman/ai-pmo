// src/components/Modal.jsx
import React from "react";
import IconButton from "./buttons/IconButton";
import { CloseIcon, TrashIcon } from "./icons";

export default function Modal({
  open,
  title,
  children,
  actions,                 // caller-provided header actions (e.g., Save, Copy)
  footer = null,           // optional footer content (right-aligned)
  onClose,                 // close handler (renders Close icon if provided)
  onDelete,                // delete handler (renders Delete icon if provided)
  deleteLabel = "Delete",  // tooltip/label for delete
  deleting = false,        // show busy/disabled state on delete button
  size = "md",             // "md" | "lg" | "xl" (mapped to CSS width)
  className = "",          // extra class hook if needed
}) {
  if (!open) return null;

  const sizeClass =
    size === "xl" ? "modal--xl" :
    size === "lg" ? "modal--lg" : "modal--md";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${sizeClass} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()} // prevent overlay close
      >
        {/* Header */}
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">{title}</h2>

          <div className="modal-actions">
            {/* caller actions first (e.g., Save/Copy) */}
            {actions}

            {/* Delete button (optional) */}
            {onDelete && (
              <IconButton
                icon={<TrashIcon />}
                title={deleting ? `${deleteLabel}…` : deleteLabel}
                variant="danger"
                size={18}
                onClick={onDelete}
                disabled={deleting}
                aria-busy={deleting ? "true" : "false"}
                aria-disabled={deleting ? "true" : "false"}
              />
            )}

            {/* Close button (optional) */}
            {onClose && (
              <IconButton
                icon={<CloseIcon />}
                title="Close"
                variant="neutral"
                size={18}
                onClick={onClose}
              />
            )}
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {children}
        </div>

        {/* Footer (sticky, right-aligned) */}
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
