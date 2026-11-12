import React from "react";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useTheme } from "./ThemeContext";

const Settings = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel>Theme</FieldLabel>
        <FieldDescription>Currently using the {theme} theme.</FieldDescription>
      </FieldContent>
      <Button variant="outline" onClick={toggleTheme}>
        {theme === "dark" ? (
          <RiSunLine data-icon="inline-start" />
        ) : (
          <RiMoonLine data-icon="inline-start" />
        )}
        Toggle Theme
      </Button>
      {/* Additional settings can be added here */}
    </Field>
  );
};

export default Settings;
