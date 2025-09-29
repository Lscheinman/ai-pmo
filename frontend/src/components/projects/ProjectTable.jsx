import React from "react";
import { formatDateCompact } from "../../utils/date";
import { getContrastTextColor } from "../../utils/colors";
import { STATUS_COLORS } from "../../styles/constants";


export default function ProjectTable({ projects, onRowClick }) {
  return (
    <table className="project-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Start</th>
          <th>End</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {projects.length === 0 && (
          <tr>
            <td colSpan={5} style={{ textAlign: "center" }}>No projects</td>
          </tr>
        )}
        {projects.map(proj => (
          <tr
            key={proj.id}
            onClick={() => onRowClick(proj)}
            style={{ cursor: "pointer" }}
          >
            <td>{proj.name}</td>
            <td className="compact-date">{formatDateCompact(proj.start_date)}</td>
            <td className="compact-date">{formatDateCompact(proj.end_date)}</td>
            <td>
              <span
                className="status-badge"
                style={{
                  backgroundColor: STATUS_COLORS[proj.status],
                  color: getContrastTextColor(STATUS_COLORS[proj.status])
                }}
              >
                {proj.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
