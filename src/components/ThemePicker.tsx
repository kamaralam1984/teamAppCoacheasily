import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSetCompanyTheme, useTheme } from "@/hooks/useTheme";

/** The little emoji in the top bar. Anyone can decorate; HR can make it stick. */
export function ThemePicker({ canSetDefault }: { canSetDefault: boolean }) {
  const { themes, theme, manualKey, setThemeKey, autoKey } = useTheme();
  const setCompany = useSetCompanyTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Theme: ${theme.name}`}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-lg transition-colors hover:bg-night2"
        >
          <span aria-hidden>{theme.emoji}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[11px] tracking-[0.16em] uppercase">
          Decorate the office
        </DropdownMenuLabel>

        <DropdownMenuItem
          onSelect={() => {
            setThemeKey(null);
            toast.success("Following the calendar again");
          }}
          className="flex items-center gap-2"
        >
          <Sparkles size={15} />
          <span className="flex-1">Automatic</span>
          {manualKey === null ? <Check size={15} /> : null}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {themes.map((t) => (
          <DropdownMenuItem
            key={t.key}
            onSelect={() => {
              setThemeKey(t.key);
              toast.success(`${t.emoji} ${t.name} theme on`);
            }}
            className="flex items-center gap-2"
          >
            <span aria-hidden>{t.emoji}</span>
            <span className="flex-1">
              {t.name}
              {t.key === autoKey ? <span className="text-soft"> · today</span> : null}
            </span>
            {manualKey === t.key ? <Check size={15} /> : null}
          </DropdownMenuItem>
        ))}

        {canSetDefault ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={setCompany.isPending}
              onSelect={() => {
                setCompany.mutate(theme.key, {
                  onSuccess: () => toast.success(`${theme.name} is now the company default`),
                  onError: () =>
                    toast.error("That didn't save. Please try again in a moment."),
                });
              }}
              className="text-[13px]"
            >
              Make {theme.name} the company default
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
