import { Fragment, type ReactNode } from "react";
import { t } from "@/i18n";

// Renders a catalogue message whose {{placeholders}} are elements, such as links, rather than text.
const RichText = ({ id, parts }: { id: string; parts: Record<string, ReactNode> }) => {
  const markers = Object.fromEntries(
    Object.keys(parts).map((name) => [name, `\u0000${name}\u0000`]),
  );
  // Splitting on the markers leaves the placeholder names at the odd positions.
  const pieces = t(id, markers).split("\u0000");
  return (
    <>
      {pieces.map((piece, i) => (
        <Fragment key={i}>{i % 2 === 1 ? parts[piece] : piece}</Fragment>
      ))}
    </>
  );
};

export default RichText;
