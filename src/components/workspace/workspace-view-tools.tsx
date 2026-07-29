"use client";

import { MiniMap, Panel } from "@xyflow/react";
import {
	Eye,
	EyeOff,
	Grid3X3,
	Keyboard,
	LayoutDashboard,
	Map as MapIcon,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WorkspaceViewToolsProps {
	colorMode: "light" | "dark";
	miniMapVisible: boolean;
	edgeLinesVisible: boolean;
	gridSnapEnabled: boolean;
	shortcutsOpen: boolean;
	onAutoArrange: () => void;
	onMiniMapVisibleChange: (visible: boolean) => void;
	onEdgeLinesVisibleChange: (visible: boolean) => void;
	onGridSnapEnabledChange: (enabled: boolean) => void;
	onShortcutsOpenChange: (open: boolean) => void;
}

const shortcutSections = [
	{
		title: "画布视图",
		items: [
			["自动整理画布", "Alt + Shift + F"],
			["适应全部内容", "Ctrl + 0"],
			["选择模式", "V"],
			["移动画布", "H"],
		],
	},
	{
		title: "节点编辑",
		items: [
			["复制选中节点", "Ctrl + C"],
			["粘贴节点", "Ctrl + V"],
			["拖动复制节点", "Alt + 拖动"],
			["删除选中节点或连线", "Delete"],
		],
	},
	{
		title: "历史操作",
		items: [
			["撤销", "Ctrl + Z"],
			["重做", "Ctrl + Shift + Z"],
		],
	},
] as const;

function ViewToolButton({
	label,
	active = false,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={active}
					onClick={onClick}
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-xl transition",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
						active
							? "bg-blue-600 text-white shadow-sm"
							: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-700/80 dark:hover:text-white",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export function WorkspaceViewTools({
	colorMode,
	miniMapVisible,
	edgeLinesVisible,
	gridSnapEnabled,
	shortcutsOpen,
	onAutoArrange,
	onMiniMapVisibleChange,
	onEdgeLinesVisibleChange,
	onGridSnapEnabledChange,
	onShortcutsOpenChange,
}: WorkspaceViewToolsProps) {
	return (
		<>
			{miniMapVisible ? (
				<MiniMap
					position="bottom-right"
					pannable
					zoomable
					nodeStrokeWidth={3}
					maskColor={
						colorMode === "dark"
							? "rgba(9, 9, 11, 0.72)"
							: "rgba(244, 244, 245, 0.72)"
					}
					className="!mb-16 !mr-4 overflow-hidden rounded-2xl border border-zinc-200 shadow-xl dark:border-zinc-700"
				/>
			) : null}

			<Panel position="bottom-left" className="!mb-5 !ml-4 z-20">
				<div className="flex items-center gap-1 rounded-2xl border border-zinc-200/80 bg-white/92 p-1.5 shadow-lg backdrop-blur-xl dark:border-zinc-700 dark:bg-zinc-900/92">
					<ViewToolButton
						label="自动整理（Alt + Shift + F）"
						onClick={onAutoArrange}
					>
						<LayoutDashboard className="h-4.5 w-4.5" />
					</ViewToolButton>
					<ViewToolButton
						label={miniMapVisible ? "关闭小地图" : "打开小地图"}
						active={miniMapVisible}
						onClick={() => onMiniMapVisibleChange(!miniMapVisible)}
					>
						<MapIcon className="h-4.5 w-4.5" />
					</ViewToolButton>
					<ViewToolButton
						label={
							edgeLinesVisible ? "隐藏全部连线" : "显示全部连线"
						}
						active={!edgeLinesVisible}
						onClick={() =>
							onEdgeLinesVisibleChange(!edgeLinesVisible)
						}
					>
						{edgeLinesVisible ? (
							<Eye className="h-4.5 w-4.5" />
						) : (
							<EyeOff className="h-4.5 w-4.5" />
						)}
					</ViewToolButton>
					<ViewToolButton
						label={
							gridSnapEnabled ? "关闭网格吸附" : "开启网格吸附"
						}
						active={gridSnapEnabled}
						onClick={() =>
							onGridSnapEnabledChange(!gridSnapEnabled)
						}
					>
						<Grid3X3 className="h-4.5 w-4.5" />
					</ViewToolButton>
					<div className="mx-0.5 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
					<ViewToolButton
						label="快捷键"
						onClick={() => onShortcutsOpenChange(true)}
					>
						<Keyboard className="h-4.5 w-4.5" />
					</ViewToolButton>
				</div>
			</Panel>

			<Dialog open={shortcutsOpen} onOpenChange={onShortcutsOpenChange}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>画布快捷键</DialogTitle>
						<DialogDescription>
							常用操作集中在这里，输入提示词时不会触发画布快捷键。
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-5 py-2 sm:grid-cols-3">
						{shortcutSections.map((section) => (
							<section key={section.title}>
								<h3 className="mb-2 text-sm font-semibold text-foreground">
									{section.title}
								</h3>
								<div className="space-y-1.5">
									{section.items.map(([label, shortcut]) => (
										<div
											key={label}
											className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-xs"
										>
											<span className="text-muted-foreground">
												{label}
											</span>
											<kbd className="shrink-0 rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground shadow-sm">
												{shortcut}
											</kbd>
										</div>
									))}
								</div>
							</section>
						))}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
