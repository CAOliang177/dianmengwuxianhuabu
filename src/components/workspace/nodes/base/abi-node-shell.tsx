/**
 * ABI-driven node shell. Wires `useAbiExecution` to `BaseNodeShell` and
 * auto-renders `<AbiHandles>`. Node components only declare:
 *   - `feature` + (optional) `sourceSpec`
 *   - the form (passed from `useAbiForm` so the same instance feeds execution)
 *   - presentation: title / icon / executeLabel / children
 */

import type { CSSProperties, ReactNode } from "react";

import type { NodeSlot } from "@/generated/abi";
import { useAbiExecution } from "@/hooks/use-abi-execution";
import type { UseAbiFormReturn } from "@/hooks/use-abi-form";
import type { Task } from "@/hooks/use-task";
import type { SourceSpec } from "@/lib/abi/sources";
import type { BaseNodeData } from "@/types/nodes";

import { AbiHandles } from "./abi-handles";
import { BaseNodeShell } from "./base-node-shell";

export interface AbiNodeShellExecution {
    run: () => void;
    cancel: () => void;
    canCancel: boolean;
    loading: boolean;
    canRun: boolean;
    elapsedSeconds: number;
    progressLabel: string | null;
}

export interface AbiNodeShellProps<F extends NodeSlot> {
    feature: F;
    sourceSpec?: SourceSpec<F>;
    form: UseAbiFormReturn<F>;

    // ---- Chrome ----
    title?: string;
    icon?: ReactNode;
    headerActions?: ReactNode;

    // ---- Execute button ----
    executeLabel?: string;
    executeIcon?: ReactNode;
    /** Force-disable execute (e.g. required upstream not connected yet). */
    executeDisabled?: boolean;
    /** Treated as input node — execute button stays visible in execute mode. */
    isInputNode?: boolean;
    /** Hide the shell execute button while a compact node is collapsed. */
    showExecuteButton?: boolean;

    // ---- Misc ----
    selected?: boolean;
    count?: number;
    className?: string;
    style?: CSSProperties;
    children?: ReactNode | ((execution: AbiNodeShellExecution) => ReactNode);
    overlay?: ReactNode;
    /** Whether to auto-render AbiHandles. Default true. */
    autoHandles?: boolean;
    /** Whether to show plugin selector. Default true. */
    showPluginSelect?: boolean;
    /** Optional node.data passthrough for chrome (defaults to form state). */
    data?: BaseNodeData;
    /** Custom task update handler (forwarded to useAbiExecution). */
    onTaskUpdate?: (
        task: Task,
    ) => boolean | undefined | Promise<boolean | undefined>;
    /** Final-stage prompt transformer (forwarded to useAbiExecution). */
    transformPrompts?: (
        prompts: Record<string, unknown>[],
    ) => Record<string, unknown>[];
}

export function AbiNodeShell<F extends NodeSlot>({
    feature,
    sourceSpec,
    form,
    title,
    icon,
    headerActions,
    executeLabel,
    executeIcon,
    executeDisabled,
    isInputNode,
    showExecuteButton = true,
    selected,
    count,
    className,
    style,
    children,
    overlay,
    autoHandles = true,
    showPluginSelect = true,
    data,
    onTaskUpdate,
    transformPrompts,
}: AbiNodeShellProps<F>) {
    const exec = useAbiExecution({
        feature,
        sourceSpec,
        form,
        disabled: executeDisabled,
        onTaskUpdate,
        transformPrompts,
    });

    return (
        <BaseNodeShell
            selected={selected}
            count={count}
            data={data ?? (form.state as BaseNodeData)}
            overlay={overlay}
            className={className}
            style={style}
            title={title}
            icon={icon}
            headerActions={headerActions}
            loading={exec.loading}
            elapsedSeconds={exec.elapsedSeconds}
            progressLabel={exec.progressLabel}
            isExecuteMode={exec.isExecuteMode}
            onExecute={showExecuteButton ? exec.run : undefined}
            onCancel={exec.canCancel ? exec.cancel : undefined}
            executeLabel={executeLabel}
            executeIcon={executeIcon}
            executeDisabled={executeDisabled || !exec.canRun}
            isInputNode={isInputNode}
            feature={feature}
            showPluginSelect={showPluginSelect}
            missingPluginOpen={exec.missingPluginOpen}
            setMissingPluginOpen={exec.setMissingPluginOpen}
        >
            {typeof children === "function"
                ? children({
                      run: exec.run,
                      cancel: exec.cancel,
                      canCancel: exec.canCancel,
                      loading: exec.loading,
                      canRun: exec.canRun,
                      elapsedSeconds: exec.elapsedSeconds,
                      progressLabel: exec.progressLabel,
                  })
                : children}
            {autoHandles && (
                <AbiHandles feature={feature} sourceSpec={sourceSpec} />
            )}
        </BaseNodeShell>
    );
}
