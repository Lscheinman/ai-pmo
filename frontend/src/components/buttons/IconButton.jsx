// src/components/buttons/IconButton.jsx
import React from "react";
import clsx from "clsx";

// Common icon button wrapper
export default function IconButton({
  icon,
  title,
  onClick,
  as = "button", // could be "label" for file inputs
  variant = "neutral", // primary, danger, success, neutral
  size = 22,
  type = "button",
  className = "",
  ...rest
}) {
  const Tag = as;

  return (
    <Tag
      type={as === "button" ? type : undefined}
      className={clsx("icon-btn", variant, className)}
      title={title}
      onClick={onClick}
      {...rest}
    >
      {icon && React.cloneElement(icon, { size })}
      <span className="sr-only">{title}</span>
    </Tag>
  );
}
