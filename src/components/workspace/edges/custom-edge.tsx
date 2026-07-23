import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
	useReactFlow,
} from "@xyflow/react";
import { Scissors } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useFlow } from "@/hooks/use-flow";
import { getEdgeTargetOptions } from "@/lib/abi/edge-target-options";

const CustomEdge = ({
	id,
	source,
	target,
	sourceHandleId: sourceHandle,
	targetHandleId: targetHandle,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style,
	selected,
}: EdgeProps) => {
	const [hovered, setHovered] = useState(false);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});

	// Edge style: thicker and more visible
	const edgeStyle = {
		...style,
		strokeWidth: 3,
		stroke: "#94a3b8",
		strokeLinecap: "round" as const,
	};

	const { getNodes } = useReactFlow();
	const t = useTranslations("Workspace.handles");
	const controlsVisible = hovered || Boolean(selected);

	// Fields this edge could plug into. Node types are fixed after creation, so
	// computing from a non-reactive snapshot is fine (the edge re-renders as its
	// endpoints move anyway).
	const options = useMemo(
		() => {
			if (!controlsVisible) return [];
			return getEdgeTargetOptions(
				{ id, source, target, sourceHandle, targetHandle },
				getNodes(),
			);
		},
		[
			controlsVisible,
			id,
			source,
			target,
			sourceHandle,
			targetHandle,
			getNodes,
		],
	);

	const onSelect = useCallback(
		(newHandle: string) => {
			if (newHandle === targetHandle) return;
			const { edges, setEdges } = useFlow.getState();
			const picked = options.find((o) => o.handleId === newHandle);

			// Swap with the edge currently occupying a single-edge target.
			const occupant =
				picked?.single &&
				edges.find(
					(e) =>
						e.id !== id && e.target === target && e.targetHandle === newHandle,
				);

			const next = edges.map((e) => {
				if (e.id === id) return { ...e, targetHandle: newHandle };
				if (occupant && e.id === occupant.id) {
					return { ...e, targetHandle: targetHandle };
				}
				return e;
			});
			setEdges(next);
		},
		[id, target, targetHandle, options],
	);

	const cancelHide = useCallback(() => {
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = null;
		}
		setHovered(true);
	}, []);

	const scheduleHide = useCallback(() => {
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => {
			setHovered(false);
			hideTimerRef.current = null;
		}, 250);
	}, []);

	useEffect(
		() => () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		},
		[],
	);

	const cutConnection = useCallback(() => {
		const { edges, setEdges } = useFlow.getState();
		setEdges(edges.filter((edge) => edge.id !== id));
	}, [id]);

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				style={edgeStyle}
				interactionWidth={32}
			/>
			{/* biome-ignore lint/a11y/useSemanticElements: an SVG edge hit area cannot be represented by an HTML button */}
			<path
				d={edgePath}
				fill="none"
				stroke="transparent"
				strokeWidth={32}
				pointerEvents="stroke"
				role="button"
				tabIndex={0}
				aria-label="显示连接线剪刀"
				onMouseEnter={cancelHide}
				onMouseLeave={scheduleHide}
				onFocus={cancelHide}
				onBlur={scheduleHide}
				onClick={(event) => {
					event.stopPropagation();
					cancelHide();
				}}
				onKeyDown={(event) => {
					if (event.key === "Delete" || event.key === "Backspace") {
						event.preventDefault();
						cutConnection();
					}
				}}
			/>
			{controlsVisible && (
				<EdgeLabelRenderer>
					<button
						type="button"
						aria-label="剪断连接线"
						title="剪断连接线"
						className="nodrag nopan absolute flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-red-500 text-white shadow-lg transition hover:scale-110 hover:bg-red-600"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							pointerEvents: "all",
							zIndex: 40,
						}}
						onMouseEnter={cancelHide}
						onMouseLeave={scheduleHide}
						onMouseDown={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							cutConnection();
						}}
					>
						<Scissors className="h-4 w-4" />
					</button>
				</EdgeLabelRenderer>
			)}
			{controlsVisible && options.length >= 2 && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan absolute"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 30}px)`,
							pointerEvents: "all",
						}}
					>
						<Select value={targetHandle ?? undefined} onValueChange={onSelect}>
							<SelectTrigger
								size="sm"
								className="h-6 bg-white px-2 text-xs shadow-sm"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{options.map((o) => {
									// Per-node override (e.g. `image` reads as
									// "first frame" on the first/last-frame node)
									// falls back to the global field label, then
									// the raw field name.
									const perNode = `byFeature.${o.feature}.${o.field}`;
									const label = t.has(perNode)
										? t(perNode)
										: t.has(o.field)
											? t(o.field)
											: o.field;
									return (
										<SelectItem
											key={o.handleId}
											value={o.handleId}
											className="text-xs"
										>
											{label}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
};

CustomEdge.displayName = "CustomEdge";

export default memo(CustomEdge);
