// src/components/buttons/AddButton.jsx
import React from "react";
import IconButton from "./IconButton";
import { AddIcon } from "../icons";

export default function AddButton({ onClick, title = "Add", ...rest }) {
  return <IconButton icon={<AddIcon />} title={title} onClick={onClick} variant="primary" {...rest} />;
}
