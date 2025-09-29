// src/components/buttons/SaveButton.jsx
import React from "react";
import IconButton from "./IconButton";
import { SaveIcon } from "../icons";

export default function SaveButton({ onClick, title = "Save", type = "submit", form, ...rest }) {
  return <IconButton icon={<SaveIcon />} title={title} onClick={onClick} type={type} form={form} variant="success" {...rest} />;
}
