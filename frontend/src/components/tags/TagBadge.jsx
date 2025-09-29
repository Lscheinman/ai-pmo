// components/tags/TagBadge.jsx
// A badge component to display a tag with an optional remove button
import React from "react";
import IconButton from "../buttons/IconButton";
import { DeleteIcon } from "../icons";
import { getTagColor } from "../../utils/tags";

export default function TagBadge({ tag, onRemove, style = {} }) {
    const { background, color } = getTagColor(tag.name);

  return (
    <span
      style={{
        background: background,
        borderRadius: 7,
        padding: "2.5px 7px",
        fontSize: "0.98em",
        color: color,
        display: "flex",
        alignItems: "center",
        ...style
      }}
    >
      {tag.name}
      {onRemove && (
        <IconButton
        icon={<DeleteIcon />}
        title="Remove tag"
        variant="danger"
        size={14}
        onClick={onRemove}
        style={{
            marginLeft: 4,
            background: "transparent",
            padding: 0 // tighter icon button
        }}
        />
        )}
    </span>
  );
}
