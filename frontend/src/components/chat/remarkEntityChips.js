// remarkEntityChips.js
import { visit } from "unist-util-visit";

// Accepts: task_12, PERSON_7, `task_12`, [task_12], _task_12_
// (We normalize to lowercase type + number)
const ENTITY_CORE = /(person|task|project|group|tag)_(\d+)/i;
const ENTITY_TOKEN = new RegExp(
  String.raw`(?:` +            // optional wrappers:
  String.raw`\`?` +            //   backtick
  String.raw`\[?` +            //   [
  String.raw`_?` +             //   _
  String.raw`)\b` +
  String.raw`(person|task|project|group|tag)_(\d+)` +
  String.raw`\b(?:` +
  String.raw`_?` +             //   _
  String.raw`\]?` +            //   ]
  String.raw`\`?` +            //   backtick
  String.raw`)`,
  "ig"
);

/**
 * remark plugin factory
 * @param {{labels?: Record<string,string>}} opts
 *   labels: map like { "task_12": "Fix login bug" } (fallback to id if missing)
 */
export default function remarkEntityChips(opts = {}) {
  const labels = opts.labels || {};

  return (tree) => {
    // Don’t convert inside code/inlineCode or existing links
    visit(tree, (node) => node.type === "text", (node, index, parent) => {
      if (!parent) return;

      // Skip if parent is code-ish or link-ish
      if (
        parent.type === "link" ||
        parent.type === "linkReference" ||
        parent.type === "inlineCode" ||
        parent.type === "code"
      ) return;

      const value = node.value;
      ENTITY_TOKEN.lastIndex = 0;
      let m, last = 0;
      const newChildren = [];

      while ((m = ENTITY_TOKEN.exec(value))) {
        const start = m.index;
        const end = ENTITY_TOKEN.lastIndex;

        // Push preceding text (if any)
        if (start > last) newChildren.push({ type: "text", value: value.slice(last, start) });

        // Normalize id
        const typ = m[1].toLowerCase();
        const num = m[2];
        const id = `${typ}_${num}`;

        const label = labels[id] || id;

        // Create a custom mdast node that will become <entity-chip> via hName
        newChildren.push({
          type: "text", // mdast node kind; we’ll override to a custom element in hast
          value: label,
          data: {
            hName: "entity-chip",
            hProperties: {
              "data-entity-id": id,
              "data-entity-type": typ,
              // a11y hints
              role: "button",
              tabIndex: 0,
              title: `Focus ${id}`,
              "aria-label": `Focus ${id}`,
            },
          },
        });

        last = end;
      }

      // Tail text
      if (last < value.length) newChildren.push({ type: "text", value: value.slice(last) });

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        // Tell visitor we replaced current index; skip walking replaced nodes
        return index + newChildren.length;
      }
    });
  };
}
