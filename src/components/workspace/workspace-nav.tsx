"use client";

/**
 * Workspace top-right corner: app settings, theme and language.
 */

import { Check, Globe, Moon, Palette, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PluginsDialog } from "@/components/workspace/plugins-dialog";
import { SettingsDialog } from "@/components/workspace/settings-dialog";

const LOCALE_OPTIONS = [
	{ code: "zh", label: "中文" },
	{ code: "en", label: "English" },
	{ code: "ja", label: "日本語" },
	{ code: "ko", label: "한국어" },
] as const;

const navBtnClass =
	"h-10 w-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 text-gray-500 hover:text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-700 transition-all duration-200";

type AppTheme = "light" | "deep-gray" | "dark";

const THEME_OPTIONS: Array<{
	value: AppTheme;
	label: string;
	Icon: typeof Sun;
}> = [
	{ value: "light", label: "浅色", Icon: Sun },
	{ value: "deep-gray", label: "深灰色", Icon: Palette },
	{ value: "dark", label: "深黑色", Icon: Moon },
];

function currentTheme(): AppTheme {
	if (document.documentElement.classList.contains("deep-gray"))
		return "deep-gray";
	if (document.documentElement.classList.contains("dark")) return "dark";
	return "light";
}

function applyTheme(theme: AppTheme) {
	document.documentElement.classList.toggle("dark", theme !== "light");
	document.documentElement.classList.toggle("deep-gray", theme === "deep-gray");
	document.documentElement.dataset.theme = theme;
	localStorage.setItem("theme", theme);
}

function ThemeToggleButton() {
	const t = useTranslations("Navigation");
	const [mounted, setMounted] = useState(false);
	const [theme, setTheme] = useState<AppTheme>("light");

	useEffect(() => {
		setMounted(true);
		setTheme(currentTheme());
		const observer = new MutationObserver(() => {
			setTheme(currentTheme());
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	const ActiveIcon = mounted
		? (THEME_OPTIONS.find((option) => option.value === theme)?.Icon ?? Moon)
		: Moon;

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className={navBtnClass}
							aria-label={t("toggleTheme")}
						>
							<ActiveIcon
								className={`h-5 w-5 ${mounted ? "" : "opacity-40"}`}
							/>
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">主题：浅色 / 深灰 / 深黑</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" className="min-w-[150px]">
				<DropdownMenuLabel>选择主题</DropdownMenuLabel>
				{THEME_OPTIONS.map(({ value, label, Icon }) => (
					<DropdownMenuItem
						key={value}
						className="cursor-pointer gap-2"
						onClick={() => {
							applyTheme(value);
							setTheme(value);
						}}
					>
						<Icon className="h-4 w-4" />
						<span className="flex-1">{label}</span>
						{theme === value && <Check className="h-4 w-4 text-emerald-500" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function LocaleMenu() {
	const t = useTranslations("Navigation");
	const locale = useLocale();
	const router = useRouter();

	const setLocale = (next: string) => {
		if (next === locale) return;
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not available in all target browsers
		document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax`;
		router.refresh();
	};

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className={navBtnClass}
							aria-label={t("language")}
						>
							<Globe className="h-5 w-5" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{t("language")}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" className="min-w-[140px]">
				{LOCALE_OPTIONS.map((opt) => (
					<DropdownMenuItem
						key={opt.code}
						className="cursor-pointer"
						onClick={() => setLocale(opt.code)}
					>
						<span className="flex-1">{opt.label}</span>
						{locale === opt.code ? (
							<span className="text-primary">✓</span>
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function WorkspaceNav() {
	return (
		<div className="flex items-center gap-2">
			<PluginsDialog />
			<SettingsDialog />
			<ThemeToggleButton />
			<LocaleMenu />
		</div>
	);
}
