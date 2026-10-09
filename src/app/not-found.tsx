import { NotFoundMessage } from "@/components/not-found-message";
import { ShellI18nProvider } from "@/lib/i18n/shell-provider";

// Rendered with the root layout only (no header), so it brings its own frame.
// It must stay static: reading cookies here would make every page dynamic,
// including the precached offline shells. The language is picked on the device.
export default function NotFound() {
  return (
    <ShellI18nProvider>
      <NotFoundMessage />
    </ShellI18nProvider>
  );
}
