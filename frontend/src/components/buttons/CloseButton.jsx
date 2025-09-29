// src/components/buttons/CloseButton.jsx
import React from "react";
import IconButton from "./IconButton";
import { CloseIcon } from "../icons";

export default function CloseButton({ onClick, title = "Close", ...rest }) {
  return <IconButton icon={<CloseIcon />} title={title} onClick={onClick} variant="neutral" {...rest} />;
}
