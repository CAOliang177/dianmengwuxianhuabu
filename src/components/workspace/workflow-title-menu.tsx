"use client";

import { ChevronDown, FilePlus2, Loader2, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { showErrorToast } from "@/components/ui/error-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FlowState } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import {
	type SaveWorkflowRequest,
	saveWorkflow,
	updateWorkflow,
} from "@/lib/api/workspace";
import { logger } from "@/lib/logger";
import { exportWorkflow } from "@/lib/workflow/exporter";

const selector = (state: FlowState) => ({
	nodes: state.nodes,
	edges: state.edges,
	workflowName: state.workflowName,
	workflowId: state.workflowId,
	workflowDescription: state.workflowDescription,
	setWorkflowName: state.setWorkflowName,
	setWorkflowId: state.setWorkflowId,
	setWorkflowDescription: state.setWorkflowDescription,
	setNodes: state.setNodes,
	setEdges: state.setEdges,
});

export function WorkflowTitleMenu() {
	const {
		nodes,
		edges,
		workflowName,
		workflowId,
		workflowDescription,
		setWorkflowName,
		setWorkflowId,
		setWorkflowDescription,
		setNodes,
		setEdges,
	} = useFlow(useShallow(selector));

	const t = useTranslations("Workspace.menu");
	const tIndex = useTranslations("Index");

	const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
	const [isSaveAsMode, setIsSaveAsMode] = useState(false);
	const [tempName, setTempName] = useState(workflowName);
	const [tempDescription, setTempDescription] = useState(
		workflowDescription || "",
	);
	const [saving, setSaving] = useState(false);
	const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

	// Dropdown menu hover state
	const [menuOpen, setMenuOpen] = useState(false);
	const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Handle mouse enter
	const handleMenuMouseEnter = () => {
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
			closeTimeoutRef.current = null;
		}
		setMenuOpen(true);
	};

	// Handle mouse leave (delayed close to prevent flickering)
	const handleMenuMouseLeave = () => {
		closeTimeoutRef.current = setTimeout(() => {
			setMenuOpen(false);
		}, 150);
	};

	// Sync name
	useEffect(() => {
		setTempName(workflowName);
	}, [workflowName]);

	useEffect(() => {
		setTempDescription(workflowDescription || "");
	}, [workflowDescription]);

	// Save the workflow
	const handleSave = async () => {
		if (!tempName.trim()) {
			showErrorToast({ message: t("enterName") });
			return;
		}

		setSaving(true);
		try {
			// Generate the executable on the frontend (requires runtime registry configuration)
			const executable = exportWorkflow(nodes, edges, {
				name: tempName,
				description: tempDescription || "",
				includeOriginalFlow: false,
			});

			const workflowData: Partial<SaveWorkflowRequest> = {
				name: tempName,
				description: tempDescription,
				flow: { nodes, edges },
				executable,
			};

			if (workflowId && !isSaveAsMode) {
				await updateWorkflow(workflowId, workflowData);
				toast.success(t("saveSuccess"));
			} else {
				const result = await saveWorkflow(workflowData as SaveWorkflowRequest);
				setWorkflowId(result.workflowId);
				toast.success(t("saveSuccess"));
			}

			setWorkflowName(tempName);
			setWorkflowDescription(tempDescription);
			setIsSaveDialogOpen(false);
			setIsSaveAsMode(false);
		} catch (error) {
			logger.error("Save failed:", error);
			showErrorToast({ message: t("saveFailed") });
		} finally {
			setSaving(false);
		}
	};

	// Open the save dialog
	const openSaveDialog = () => {
		setIsSaveAsMode(false);
		setTempName(workflowName);
		setTempDescription(workflowDescription || "");
		setIsSaveDialogOpen(true);
	};

	// Open the "save as" dialog
	const openSaveAsDialog = () => {
		setIsSaveAsMode(true);
		setTempName(workflowName);
		setTempDescription(workflowDescription || "");
		setIsSaveDialogOpen(true);
	};

	// Clear the workflow. Uses an in-app dialog instead of native confirm():
	// on Electron/macOS a native confirm() breaks renderer keyboard focus,
	// leaving inputs unable to receive keystrokes afterwards.
	const handleClear = () => {
		setMenuOpen(false);
		setIsClearConfirmOpen(true);
	};

	const confirmClear = () => {
		setNodes([]);
		setEdges([]);
		setWorkflowName(tIndex("title"));
		setWorkflowDescription("");
		setWorkflowId(null);
		setIsClearConfirmOpen(false);
		toast.success(t("cleared"));
	};

	return (
		<>
			<div
				className="relative"
				onMouseEnter={handleMenuMouseEnter}
				onMouseLeave={handleMenuMouseLeave}
			>
				<Button
					variant="ghost"
					size="sm"
					className="gap-2 px-4 h-10 rounded-xl bg-white border border-gray-100 hover:bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
				>
					<span className="max-w-[200px] truncate font-medium text-gray-700 dark:text-gray-200">
						{workflowName}
					</span>
					<ChevronDown className="size-4 text-gray-500" />
				</Button>

				{menuOpen && (
					<div className="absolute top-full left-0 mt-1 z-50 w-48 bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden py-1">
						<div
							onClick={openSaveDialog}
							className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
						>
							<Save className="mr-2 h-4 w-4" />
							{t("save")}
							{workflowId && (
								<span className="ml-auto text-xs text-muted-foreground">
									({t("update")})
								</span>
							)}
						</div>
						<div
							onClick={openSaveAsDialog}
							className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
						>
							<FilePlus2 className="mr-2 h-4 w-4" />
							{t("saveAs")}
						</div>
						<div className="h-px bg-gray-200 dark:bg-zinc-700 my-1" />
						<div
							onClick={handleClear}
							className="flex items-center px-3 py-2 text-sm cursor-pointer text-red-600 hover:bg-gray-100 dark:hover:bg-zinc-800"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							{t("clear")}
						</div>
					</div>
				)}
			</div>

			{/* Save dialog */}
			<Dialog
				open={isSaveDialogOpen}
				onOpenChange={(open) => {
					setIsSaveDialogOpen(open);
					if (!open) setIsSaveAsMode(false);
				}}
			>
				<DialogContent aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle>
							{isSaveAsMode
								? t("saveAsNew")
								: workflowId
									? t("saveWorkflow")
									: t("saveNew")}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="workflow-name">{t("name")}</Label>
							<Input
								id="workflow-name"
								value={tempName}
								onChange={(e) => setTempName(e.target.value)}
								placeholder={t("enterName")}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="workflow-description">{t("descOptional")}</Label>
							<Textarea
								id="workflow-description"
								value={tempDescription}
								onChange={(e) => setTempDescription(e.target.value)}
								placeholder={t("enterDesc")}
								rows={3}
							/>
						</div>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">{t("cancel")}</Button>
						</DialogClose>
						<Button onClick={handleSave} disabled={saving}>
							{saving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t("saving")}
								</>
							) : (
								t("save")
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Clear confirmation */}
			<AlertDialog
				open={isClearConfirmOpen}
				onOpenChange={setIsClearConfirmOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("clear")}</AlertDialogTitle>
						<AlertDialogDescription>{t("confirmClear")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={confirmClear}>
							{t("clear")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
