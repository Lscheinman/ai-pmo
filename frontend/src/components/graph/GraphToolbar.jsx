// components/graph/GraphToolbar.jsx
import React from "react";
import { PeopleIcon, TagIcon, TasksIcon, InfoIcon } from "../icons";
import SwitchToggle from "../buttons/SwitchToggle";

export default function GraphToolbar({
  activePanel,
  onChange,
  historyBar,
  leftExtras,
  rightExtras,
  detailsActive = false,    
  onShowDetails,            
}) {
  const options = [
    { key: "tasks", label: "Tasks", icon: <TasksIcon size={18} /> },
    { key: "people", label: "People", icon: <PeopleIcon size={18} /> },
    { key: "groups", label: "Groups", icon: <TagIcon size={18} /> },
    { key: "details", label: "Details", icon: <InfoIcon size={18} />, disabled: !detailsActive }
  ];

  const handleClick = (key) => {
    if (key === "details") {
      onShowDetails?.(); // parent decides how to reveal details (usually clear activePanel)
      return;
    }
    if (activePanel === key) onChange(null);
    else onChange(key);
  };

  // Make the switch show "details" as active when detailsActive=true
  const activeValue = detailsActive ? "details" : activePanel;

  return (
    <div className="graph-toolbar" style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      gap: 8,
      alignItems: "center",
      marginBottom: 8
    }}>
      <div className="graph-toolbar__left" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <SwitchToggle options={options} value={activeValue} onChange={handleClick} />
        {leftExtras}
      </div>

      <div className="graph-toolbar__center" style={{ minWidth: 0 }}>
        {historyBar}
      </div>

      <div className="graph-toolbar__right" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {rightExtras}
      </div>
    </div>
  );
}
