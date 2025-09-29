// src/components/buttons/ButtonIcon.jsx
import React from "react";
import IconButton from "./IconButton";

export default function ButtonIcon({ children, title, ...rest }) {
  return <IconButton icon={children} title={title} variant="neutral" {...rest} />;
}
